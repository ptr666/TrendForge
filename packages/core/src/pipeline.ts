import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDefaultDraftGenerator } from "../../generator/src/index.js";
import { createDefaultMediaComposer } from "../../media/src/index.js";
import { createPlannedPublishers } from "../../publishers/src/index.js";
import { createDefaultTextProvider } from "../../providers/src/index.js";
import { createDefaultSelector } from "../../selector/src/index.js";
import { createDefaultSourceAdapters } from "../../sources/src/adapters.js";
import { createDefaultVerifier } from "../../verifier/src/index.js";
import type {
  PipelineRunRequest,
  PipelineRunResult,
  PlatformDraft,
  RunStore,
  SourceItem,
  SourceAdapter,
  VerifiedArticle,
  FullTextProvider,
  TextProvider,
  Selector
} from "./types.js";

export interface PipelineDeps {
  store: RunStore;
  sourceAdapters?: SourceAdapter[];
  fullTextProvider?: FullTextProvider;
  textProvider?: TextProvider;
  selector?: Selector;
  publisherHandoffDir?: string;
  fullTextHandoffDir?: string;
  draftArtifactDir?: string;
  fullTextArtifactDir?: string;
}

function createPlannedFullTextProvider(): FullTextProvider {
  return {
    async acquire(item, article) {
      return {
        ...article,
        failureReason: item.url.startsWith("http://") || item.url.startsWith("https://")
          ? "Original text acquisition planned for BrowserAct."
          : article.failureReason
      };
    }
  };
}

function defaultHandoffDir(runId: string, baseDir?: string): string {
  return baseDir ?? `workspace/runs/${runId}/publisher-handoffs`;
}

function defaultFullTextHandoffDir(runId: string, baseDir?: string): string {
  return baseDir ?? `workspace/runs/${runId}/full-text-handoffs`;
}

function defaultDraftArtifactDir(runId: string, baseDir?: string): string {
  return baseDir ?? `workspace/runs/${runId}/drafts`;
}

function defaultFullTextArtifactDir(runId: string, baseDir?: string): string {
  return baseDir ?? `workspace/runs/${runId}/full-text`;
}

function isHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function canGenerateFinalDraft(item: SourceItem, article: VerifiedArticle): boolean {
  if (article.status === "failed") return false;
  if (article.status === "verified" && article.fullText && article.fullText.trim().length > 0) return true;
  if (article.status === "partial" && article.fullText && article.fullText.trim().length > 0) return true;
  return !isHttpUrl(item.url) && Boolean(article.fullText?.trim());
}

async function writeDraftArtifact(runId: string, draft: PlatformDraft, baseDir?: string): Promise<PlatformDraft> {
  const dir = defaultDraftArtifactDir(runId, baseDir);
  await mkdir(dir, { recursive: true });
  const artifactPath = path.join(dir, `${draft.platform}-${draft.sourceItemId}.md`);
  const content = [
    "---",
    `id: ${draft.id}`,
    `platform: ${draft.platform}`,
    `sourceItemId: ${draft.sourceItemId}`,
    `title: ${JSON.stringify(draft.title)}`,
    draft.digest ? `digest: ${JSON.stringify(draft.digest)}` : undefined,
    draft.tone ? `tone: ${draft.tone}` : undefined,
    "---",
    "",
    `# ${draft.title}`,
    "",
    draft.body
  ].filter((line): line is string => line !== undefined).join("\n");
  await writeFile(artifactPath, `\uFEFF${content}`, "utf8");
  return { ...draft, artifactPath };
}

async function writeFullTextHandoff(
  runId: string,
  item: SourceItem,
  command: string[],
  baseDir?: string
): Promise<string> {
  const dir = defaultFullTextHandoffDir(runId, baseDir);
  await mkdir(dir, { recursive: true });
  const artifactPath = path.join(dir, `browseract-${item.id}.json`);
  await writeFile(artifactPath, JSON.stringify({
    workflow: "browseract-full-text-acquisition",
    fallbackWorkflow: "mediacrawler-full-text-fallback",
    sourceItemId: item.id,
    url: item.url,
    command,
    fallbackPolicy: "Use MediaCrawler only when explicitly enabled and compliance review passes.",
    successSignal: "VerifiedArticle.fullText is populated and fetch_full_text event status becomes verified."
  }, null, 2), "utf8");
  return artifactPath;
}

async function writeFullTextArtifact(
  runId: string,
  item: SourceItem,
  article: VerifiedArticle,
  baseDir?: string
): Promise<VerifiedArticle> {
  if (!article.fullText?.trim()) return article;

  const dir = defaultFullTextArtifactDir(runId, baseDir);
  await mkdir(dir, { recursive: true });
  const artifactPath = path.join(dir, `${item.id}.md`);
  const content = [
    "---",
    `sourceItemId: ${item.id}`,
    `title: ${JSON.stringify(item.title)}`,
    `url: ${JSON.stringify(article.evidenceUrl ?? item.url)}`,
    `method: ${article.method}`,
    `status: ${article.status}`,
    item.publishedAt ? `publishedAt: ${JSON.stringify(item.publishedAt)}` : undefined,
    "---",
    "",
    `# ${item.title}`,
    "",
    `Source: ${article.evidenceUrl ?? item.url}`,
    "",
    article.fullText
  ].filter((line): line is string => line !== undefined).join("\n");
  await writeFile(artifactPath, `\uFEFF${content}`, "utf8");
  return { ...article, fullTextArtifactPath: artifactPath };
}

export function createDefaultPipeline(deps: PipelineDeps) {
  const verifier = createDefaultVerifier();
  const selector = deps.selector ?? createDefaultSelector();
  const generator = createDefaultDraftGenerator();
  const textProvider = deps.textProvider ?? createDefaultTextProvider();
  const media = createDefaultMediaComposer();
  const publishers = createPlannedPublishers();
  const fullTextProvider = deps.fullTextProvider ?? createPlannedFullTextProvider();

  return {
    async run(request: PipelineRunRequest): Promise<PipelineRunResult> {
      const startedAt = new Date().toISOString();
      const errors: Array<{ stage: string; message: string }> = [];
      await deps.store.appendEvent(request.runId, { stage: "started", request });

      const sourceAdapters = deps.sourceAdapters ?? createDefaultSourceAdapters({
        enableMediaCrawlerFallback: request.allowMediaCrawlerFallback === true
      });
      const sourceItems: SourceItem[] = [];
      for (const adapter of sourceAdapters) {
        if (adapter.name === "browseract" && request.allowBrowserFallback === false) continue;
        if (adapter.name === "mediacrawler" && request.allowMediaCrawlerFallback !== true) continue;

        try {
          await deps.store.appendEvent(request.runId, { stage: "collect", adapter: adapter.name, status: "started" });
          const rawResults = await adapter.collect(request.query);
          const normalized = rawResults.map((raw) => adapter.normalize(raw));
          sourceItems.push(...normalized);
          await deps.store.appendEvent(request.runId, {
            stage: "collect",
            adapter: adapter.name,
            status: "finished",
            count: normalized.length
          });

          if (normalized.length > 0) break;
        } catch (error) {
          const message = adapter.explainFailure(error);
          errors.push({ stage: `collect:${adapter.name}`, message });
          await deps.store.appendEvent(request.runId, {
            stage: "collect",
            adapter: adapter.name,
            status: "failed",
            message
          });
        }
      }

      const verifiedArticles: VerifiedArticle[] = [];
      for (const item of sourceItems) {
        try {
          const verified = await verifier.verify(item);
          verifiedArticles.push(verified);
          await deps.store.appendEvent(request.runId, { stage: "verify", sourceItemId: item.id, status: verified.status });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push({ stage: "verify", message });
          await deps.store.appendEvent(request.runId, { stage: "verify", sourceItemId: item.id, status: "failed", message });
        }
      }

      const scored = [];
      for (const article of verifiedArticles) {
        const selection = await selector.score(article);
        scored.push(selection);
        await deps.store.appendEvent(request.runId, {
          stage: "score",
          sourceItemId: article.sourceItemId,
          score: selection.score
        });
      }

      const requestedTopN = request.topN ?? 5;
      const candidateSelections = selector.selectTopN(scored, scored.length);
      const selections = [];
      for (const selection of candidateSelections) {
        if (selections.length >= requestedTopN) break;
        const article = verifiedArticles.find((candidate) => candidate.sourceItemId === selection.sourceItemId);
        const item = sourceItems.find((candidate) => candidate.id === selection.sourceItemId);
        if (!article || !item) continue;
        let currentArticle = article;

        if (article.status !== "verified" && isHttpUrl(item.url) && request.allowBrowserFallback !== false) {
          const command = ["browseract", "stealth-extract", item.url];
          const artifactPath = await writeFullTextHandoff(request.runId, item, command, deps.fullTextHandoffDir);
          await deps.store.appendEvent(request.runId, {
            stage: "fetch_full_text",
            adapter: "browseract",
            status: "planned",
            sourceItemId: item.id,
            evidenceUrl: item.url,
            command,
            artifactPath,
            reason: "Original text acquisition uses BrowserAct for selected HTTP source items."
          });
          const acquired = await fullTextProvider.acquire(item, article);
          const acquiredWithArtifact = await writeFullTextArtifact(request.runId, item, acquired, deps.fullTextArtifactDir);
          verifiedArticles.splice(verifiedArticles.indexOf(article), 1, acquiredWithArtifact);
          currentArticle = acquiredWithArtifact;
          await deps.store.appendEvent(request.runId, {
            stage: "fetch_full_text",
            adapter: "browseract",
            status: acquiredWithArtifact.status,
            sourceItemId: item.id,
            evidenceUrl: acquiredWithArtifact.evidenceUrl,
            artifactPath: acquiredWithArtifact.fullTextArtifactPath,
            reason: acquiredWithArtifact.failureReason
          });
        } else if (article.status !== "verified" && isHttpUrl(item.url) && request.allowMediaCrawlerFallback === true) {
          await deps.store.appendEvent(request.runId, {
            stage: "fetch_full_text",
            adapter: "mediacrawler",
            status: "planned",
            sourceItemId: item.id,
            evidenceUrl: item.url,
            command: ["uv", "run", "main.py", "--type", "detail", "--url", item.url],
            reason: "BrowserAct disabled; MediaCrawler fallback requires explicit enablement and compliance review."
          });
        } else if (article.status !== "verified" && isHttpUrl(item.url)) {
          await deps.store.appendEvent(request.runId, {
            stage: "fetch_full_text",
            status: "skipped",
            sourceItemId: item.id,
            evidenceUrl: item.url,
            reason: "Original text acquisition requires BrowserAct or explicit MediaCrawler fallback."
          });
        }

        if (canGenerateFinalDraft(item, currentArticle)) {
          selections.push(selection);
        } else {
          await deps.store.appendEvent(request.runId, {
            stage: "select",
            status: "skipped",
            sourceItemId: item.id,
            reason: currentArticle.failureReason ?? "Full original text was not available for final summary generation."
          });
        }
      }

      if (sourceItems.length > 0 && scored.length > 0 && selections.length === 0) {
        errors.push({
          stage: "select",
          message: "No selected candidate had verified original text for final summary generation."
        });
      }

      const summaries = [];
      const drafts: PlatformDraft[] = [];
      for (const selection of selections) {
        const article = verifiedArticles.find((candidate) => candidate.sourceItemId === selection.sourceItemId);
        if (!article) continue;
        const summary = await textProvider.summarize(article, selection);
        summaries.push(summary);
        await deps.store.appendEvent(request.runId, { stage: "summarize", sourceItemId: article.sourceItemId, status: "finished" });
        if (request.requestedPlatforms.includes("review")) {
          drafts.push(await writeDraftArtifact(request.runId, await generator.generateReviewDraft(selection, article, summary), deps.draftArtifactDir));
        }
        if (request.requestedPlatforms.includes("wechat")) {
          drafts.push(await writeDraftArtifact(request.runId, await generator.generateWechatDraft(selection, article, summary), deps.draftArtifactDir));
        }
        if (request.requestedPlatforms.includes("xhs")) {
          drafts.push(await writeDraftArtifact(request.runId, await generator.generateXhsDraft(selection, article, summary), deps.draftArtifactDir));
        }
      }
      await deps.store.appendEvent(request.runId, { stage: "generate", count: drafts.length });

      const assets = [];
      for (const draft of drafts) {
        const plannedAssets = await media.planAssets(draft);
        const generatedAssets = await media.generateAssets(plannedAssets);
        assets.push(...generatedAssets);
        await media.attachAssets(draft, generatedAssets);
      }
      await deps.store.appendEvent(request.runId, { stage: "compose_media", count: assets.length });

      const publishResults = [];
      for (const draft of drafts) {
        const publisher = publishers.find((candidate) => candidate.platform === draft.platform);
        if (publisher) {
          const publishResult = await publisher.publishDraft(draft, {
            allowRealDraft: request.allowRealDraft === true,
            handoffDir: defaultHandoffDir(request.runId, deps.publisherHandoffDir)
          });
          publishResults.push(publishResult);
          await deps.store.appendEvent(request.runId, {
            stage: "publish",
            draftId: draft.id,
            platform: publisher.platform,
            status: publishResult.status,
            verificationSignal: publishResult.verificationSignal,
            artifactPath: publishResult.artifactPath,
            plannedCommands: publishResult.plannedCommands
          });
        }
      }

      const finishedAt = new Date().toISOString();
      const result: PipelineRunResult = {
        runId: request.runId,
        status: errors.length > 0 ? (sourceItems.length > 0 ? "partial" : "failed") : "success",
        startedAt,
        finishedAt,
        sourceItems,
        verifiedArticles,
        selections,
        summaries,
        drafts,
        assets,
        publishResults,
        errors
      };
      await deps.store.saveRun(result);
      await deps.store.appendEvent(request.runId, { stage: "finished", status: result.status });
      return result;
    }
  };
}
