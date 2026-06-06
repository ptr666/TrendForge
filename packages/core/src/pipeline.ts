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
  FullTextProvider
} from "./types.js";

export interface PipelineDeps {
  store: RunStore;
  sourceAdapters?: SourceAdapter[];
  fullTextProvider?: FullTextProvider;
  publisherHandoffDir?: string;
  fullTextHandoffDir?: string;
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

export function createDefaultPipeline(deps: PipelineDeps) {
  const verifier = createDefaultVerifier();
  const selector = createDefaultSelector();
  const generator = createDefaultDraftGenerator();
  const textProvider = createDefaultTextProvider();
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

      const selections = selector.selectTopN(scored, request.topN ?? 5);
      for (const selection of selections) {
        const article = verifiedArticles.find((candidate) => candidate.sourceItemId === selection.sourceItemId);
        const item = sourceItems.find((candidate) => candidate.id === selection.sourceItemId);
        if (!article || !item || article.status === "verified") continue;
        if (!item.url.startsWith("http://") && !item.url.startsWith("https://")) continue;

        if (request.allowBrowserFallback !== false) {
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
          verifiedArticles.splice(verifiedArticles.indexOf(article), 1, acquired);
          await deps.store.appendEvent(request.runId, {
            stage: "fetch_full_text",
            adapter: "browseract",
            status: acquired.status,
            sourceItemId: item.id,
            evidenceUrl: acquired.evidenceUrl,
            reason: acquired.failureReason
          });
        } else if (request.allowMediaCrawlerFallback === true) {
          await deps.store.appendEvent(request.runId, {
            stage: "fetch_full_text",
            adapter: "mediacrawler",
            status: "planned",
            sourceItemId: item.id,
            evidenceUrl: item.url,
            command: ["uv", "run", "main.py", "--type", "detail", "--url", item.url],
            reason: "BrowserAct disabled; MediaCrawler fallback requires explicit enablement and compliance review."
          });
        } else {
          await deps.store.appendEvent(request.runId, {
            stage: "fetch_full_text",
            status: "skipped",
            sourceItemId: item.id,
            evidenceUrl: item.url,
            reason: "Original text acquisition requires BrowserAct or explicit MediaCrawler fallback."
          });
        }
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
          drafts.push(await generator.generateReviewDraft(selection, article, summary));
        }
        if (request.requestedPlatforms.includes("wechat")) {
          drafts.push(await generator.generateWechatDraft(selection, article, summary));
        }
        if (request.requestedPlatforms.includes("xhs")) {
          drafts.push(await generator.generateXhsDraft(selection, article, summary));
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
