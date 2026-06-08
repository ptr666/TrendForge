import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDefaultDraftGenerator } from "../../generator/src/index.js";
import { createDefaultMediaComposer } from "../../media/src/index.js";
import { createPlannedPublishers } from "../../publishers/src/index.js";
import { createDefaultTextProvider } from "../../providers/src/index.js";
import { createDefaultSelector } from "../../selector/src/index.js";
import { createDefaultSourceAdapters } from "../../sources/src/adapters.js";
import { createDefaultVerifier } from "../../verifier/src/index.js";
import { buildReviewQueue } from "./review-queue.js";
import type {
  CandidateReview,
  CandidateSelection,
  PipelineDraftRequest,
  PipelineRunRequest,
  PipelineRunResult,
  PipelineScreenRequest,
  PlatformDraft,
  RunStore,
  SourceItem,
  SourceSubscription,
  SourceAdapter,
  VerifiedArticle,
  FullTextProvider,
  PublisherAdapter,
  TextProvider,
  Selector
} from "./types.js";

export interface PipelineDeps {
  store: RunStore;
  sourceAdapters?: SourceAdapter[];
  fullTextProvider?: FullTextProvider;
  textProvider?: TextProvider;
  selector?: Selector;
  publishers?: PublisherAdapter[];
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

function emptyRun(runId: string, startedAt = new Date().toISOString()): PipelineRunResult {
  return {
    runId,
    status: "success",
    startedAt,
    finishedAt: startedAt,
    sourceItems: [],
    verifiedArticles: [],
    selections: [],
    candidateReviews: [],
    summaries: [],
    drafts: [],
    assets: [],
    publishResults: [],
    errors: []
  };
}

function dedupeSourceItems(items: SourceItem[]): SourceItem[] {
  const seen = new Set<string>();
  const deduped = [];
  for (const item of items) {
    const key = item.url && item.url !== "about:blank" ? `url:${item.url}` : `title:${item.title}:${item.collectorAdapter}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
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
  const publishers = deps.publishers ?? createPlannedPublishers();
  const fullTextProvider = deps.fullTextProvider ?? createPlannedFullTextProvider();

  async function collectFromQuery(runId: string, query: string, request: { allowBrowserFallback?: boolean; allowMediaCrawlerFallback?: boolean }, errors: Array<{ stage: string; message: string }>): Promise<SourceItem[]> {
    const sourceAdapters = deps.sourceAdapters ?? createDefaultSourceAdapters({
      enableMediaCrawlerFallback: request.allowMediaCrawlerFallback === true
    });
    const sourceItems: SourceItem[] = [];
    for (const adapter of sourceAdapters) {
      if (adapter.name === "browseract" && request.allowBrowserFallback === false) continue;
      if (adapter.name === "mediacrawler" && request.allowMediaCrawlerFallback !== true) continue;

      try {
        await deps.store.appendEvent(runId, { stage: "collect", adapter: adapter.name, status: "started" });
        const rawResults = await adapter.collect(query);
        const normalized = rawResults.map((raw) => adapter.normalize(raw));
        sourceItems.push(...normalized);
        await deps.store.appendEvent(runId, {
          stage: "collect",
          adapter: adapter.name,
          status: "finished",
          count: normalized.length
        });

        if (normalized.length > 0) break;
      } catch (error) {
        const message = adapter.explainFailure(error);
        errors.push({ stage: `collect:${adapter.name}`, message });
        await deps.store.appendEvent(runId, {
          stage: "collect",
          adapter: adapter.name,
          status: "failed",
          message
        });
      }
    }
    return sourceItems;
  }

  async function collectFromSources(runId: string, sources: SourceSubscription[], errors: Array<{ stage: string; message: string }>): Promise<SourceItem[]> {
    const sourceAdapters = deps.sourceAdapters ?? createDefaultSourceAdapters();
    const items = [];
    for (const source of sources.filter((candidate) => candidate.enabled)) {
      const adapter = source.type === "aihot"
        ? sourceAdapters.find((candidate) => candidate.name === "aihot")
        : sourceAdapters.find((candidate) => candidate.name === "rsshub");
      if (!adapter) continue;
      try {
        await deps.store.appendEvent(runId, { stage: "collect", adapter: adapter.name, sourceId: source.id, status: "started" });
        const rawResults = await adapter.collect(source.source);
        const normalized = rawResults.map((raw) => ({
          ...adapter.normalize(raw),
          metadata: {
            ...adapter.normalize(raw).metadata,
            subscriptionId: source.id,
            subscriptionTitle: source.title,
            subscriptionType: source.type
          }
        }));
        items.push(...normalized);
        await deps.store.appendEvent(runId, { stage: "collect", adapter: adapter.name, sourceId: source.id, status: "finished", count: normalized.length });
      } catch (error) {
        const message = adapter.explainFailure(error);
        errors.push({ stage: `collect:${source.id}`, message });
        await deps.store.appendEvent(runId, { stage: "collect", adapter: adapter.name, sourceId: source.id, status: "failed", message });
      }
    }
    return dedupeSourceItems(items);
  }

  async function verifyAndScore(runId: string, sourceItems: SourceItem[], errors: Array<{ stage: string; message: string }>) {
    const verifiedArticles: VerifiedArticle[] = [];
    for (const item of sourceItems) {
      try {
        const verified = await verifier.verify(item);
        verifiedArticles.push(verified);
        await deps.store.appendEvent(runId, { stage: "verify", sourceItemId: item.id, status: verified.status });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ stage: "verify", message });
        await deps.store.appendEvent(runId, { stage: "verify", sourceItemId: item.id, status: "failed", message });
      }
    }

    const scored: CandidateSelection[] = [];
    for (const article of verifiedArticles) {
      const selection = await selector.score(article);
      scored.push(selection);
      await deps.store.appendEvent(runId, {
        stage: "score",
        sourceItemId: article.sourceItemId,
        score: selection.score
      });
    }
    return { verifiedArticles, scored };
  }

  async function fetchSelectedFullText(runId: string, sourceItems: SourceItem[], verifiedArticles: VerifiedArticle[], selected: CandidateSelection[], request: { allowBrowserFallback?: boolean; allowMediaCrawlerFallback?: boolean }) {
    const usableSelections: CandidateSelection[] = [];
    for (const selection of selected) {
      const article = verifiedArticles.find((candidate) => candidate.sourceItemId === selection.sourceItemId);
      const item = sourceItems.find((candidate) => candidate.id === selection.sourceItemId);
      if (!article || !item) continue;
      let currentArticle = article;

      if (article.status !== "verified" && isHttpUrl(item.url) && request.allowBrowserFallback !== false) {
        const command = ["browseract", "stealth-extract", item.url];
        const artifactPath = await writeFullTextHandoff(runId, item, command, deps.fullTextHandoffDir);
        await deps.store.appendEvent(runId, {
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
        const acquiredWithArtifact = await writeFullTextArtifact(runId, item, acquired, deps.fullTextArtifactDir);
        verifiedArticles.splice(verifiedArticles.indexOf(article), 1, acquiredWithArtifact);
        currentArticle = acquiredWithArtifact;
        await deps.store.appendEvent(runId, {
          stage: "fetch_full_text",
          adapter: "browseract",
          status: acquiredWithArtifact.status,
          sourceItemId: item.id,
          evidenceUrl: acquiredWithArtifact.evidenceUrl,
          artifactPath: acquiredWithArtifact.fullTextArtifactPath,
          reason: acquiredWithArtifact.failureReason
        });
      } else if (article.status !== "verified" && isHttpUrl(item.url) && request.allowMediaCrawlerFallback === true) {
        await deps.store.appendEvent(runId, {
          stage: "fetch_full_text",
          adapter: "mediacrawler",
          status: "planned",
          sourceItemId: item.id,
          evidenceUrl: item.url,
          command: ["uv", "run", "main.py", "--type", "detail", "--url", item.url],
          reason: "BrowserAct disabled; MediaCrawler fallback requires explicit enablement and compliance review."
        });
      } else if (article.status !== "verified" && isHttpUrl(item.url)) {
        await deps.store.appendEvent(runId, {
          stage: "fetch_full_text",
          status: "skipped",
          sourceItemId: item.id,
          evidenceUrl: item.url,
          reason: "Original text acquisition requires BrowserAct or explicit MediaCrawler fallback."
        });
      }

      if (canGenerateFinalDraft(item, currentArticle)) {
        usableSelections.push(selection);
      } else {
        await deps.store.appendEvent(runId, {
          stage: "select",
          status: "skipped",
          sourceItemId: item.id,
          reason: currentArticle.failureReason ?? "Full original text was not available for final summary generation."
        });
      }
    }
    return usableSelections;
  }

  async function summarizeSelections(runId: string, sourceItems: SourceItem[], verifiedArticles: VerifiedArticle[], selections: CandidateSelection[]) {
    const summaries = [];
    const candidateReviews: CandidateReview[] = [];
    for (const selection of selections) {
      const article = verifiedArticles.find((candidate) => candidate.sourceItemId === selection.sourceItemId);
      const item = sourceItems.find((candidate) => candidate.id === selection.sourceItemId);
      if (!article || !item) continue;
      const summary = await textProvider.summarize(article, selection);
      summaries.push(summary);
      candidateReviews.push({
        sourceItemId: item.id,
        title: item.title,
        url: item.url,
        sourceType: item.sourceType,
        collectorAdapter: item.collectorAdapter,
        publishedAt: item.publishedAt,
        brief: item.summary ?? item.rawText,
        score: selection.score,
        reason: selection.reason,
        angle: selection.angle,
        tags: selection.tags,
        originalStatus: article.status,
        originalMethod: article.method,
        originalArtifactPath: article.fullTextArtifactPath,
        originalPreview: article.fullText?.slice(0, 1200),
        summary,
        riskNotes: summary.riskNotes
      });
      await deps.store.appendEvent(runId, { stage: "summarize", sourceItemId: article.sourceItemId, status: "finished" });
    }
    return { summaries, candidateReviews };
  }

  async function generateDraftArtifacts(runId: string, sourceItems: SourceItem[], verifiedArticles: VerifiedArticle[], summaries: Awaited<ReturnType<typeof summarizeSelections>>["summaries"], selections: CandidateSelection[], requestedPlatforms: PipelineDraftRequest["requestedPlatforms"]) {
    const drafts: PlatformDraft[] = [];
    for (const selection of selections) {
      const article = verifiedArticles.find((candidate) => candidate.sourceItemId === selection.sourceItemId);
      const summary = summaries.find((candidate) => candidate.sourceItemId === selection.sourceItemId);
      if (!article || !summary) continue;
      if (requestedPlatforms.includes("review")) {
        drafts.push(await writeDraftArtifact(runId, await generator.generateReviewDraft(selection, article, summary), deps.draftArtifactDir));
      }
      if (requestedPlatforms.includes("wechat")) {
        drafts.push(await writeDraftArtifact(runId, await generator.generateWechatDraft(selection, article, summary), deps.draftArtifactDir));
      }
      if (requestedPlatforms.includes("xhs")) {
        drafts.push(await writeDraftArtifact(runId, await generator.generateXhsDraft(selection, article, summary), deps.draftArtifactDir));
      }
    }
    await deps.store.appendEvent(runId, { stage: "generate", count: drafts.length });
    return drafts;
  }

  async function composeAndPublish(runId: string, drafts: PlatformDraft[], request: { allowRealDraft?: boolean }) {
    const assets = [];
    for (const draft of drafts) {
      const plannedAssets = await media.planAssets(draft);
      const generatedAssets = await media.generateAssets(plannedAssets);
      assets.push(...generatedAssets);
      await media.attachAssets(draft, generatedAssets);
    }
    await deps.store.appendEvent(runId, { stage: "compose_media", count: assets.length });

    const publishResults = [];
    for (const draft of drafts) {
      const publisher = publishers.find((candidate) => candidate.platform === draft.platform);
      if (publisher) {
        const publishResult = await publisher.publishDraft(draft, {
          allowRealDraft: request.allowRealDraft === true,
          handoffDir: defaultHandoffDir(runId, deps.publisherHandoffDir)
        });
        publishResults.push(publishResult);
        await deps.store.appendEvent(runId, {
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
    return { assets, publishResults };
  }

  return {
    async screen(request: PipelineScreenRequest): Promise<PipelineRunResult> {
      const startedAt = new Date().toISOString();
      const errors: Array<{ stage: string; message: string }> = [];
      await deps.store.appendEvent(request.runId, { stage: "started", mode: "screen", request });
      const collectedSourceItems = await collectFromSources(request.runId, request.sources, errors);
      const requestedSourceItemIds = new Set(request.sourceItemIds ?? []);
      const sourceItems = requestedSourceItemIds.size > 0
        ? collectedSourceItems.filter((item) => requestedSourceItemIds.has(item.id))
        : collectedSourceItems;
      if (requestedSourceItemIds.size > 0) {
        await deps.store.appendEvent(request.runId, {
          stage: "collect",
          status: "filtered",
          requestedCount: requestedSourceItemIds.size,
          count: sourceItems.length
        });
      }
      const { verifiedArticles, scored } = await verifyAndScore(request.runId, sourceItems, errors);
      const selected = selector.selectTopN(scored, request.candidateCount);
      const selections = await fetchSelectedFullText(request.runId, sourceItems, verifiedArticles, selected, request);
      if (sourceItems.length > 0 && scored.length > 0 && selections.length === 0) {
        errors.push({ stage: "select", message: "No selected candidate had verified original text for candidate review." });
      }
      const { summaries, candidateReviews } = await summarizeSelections(request.runId, sourceItems, verifiedArticles, selections);
      const finishedAt = new Date().toISOString();
      const result: PipelineRunResult = {
        ...emptyRun(request.runId, startedAt),
        status: errors.length > 0 ? (sourceItems.length > 0 ? "partial" : "failed") : "success",
        finishedAt,
        sourceItems,
        verifiedArticles,
        selections,
        candidateReviews,
        summaries,
        errors
      };
      result.reviewQueue = buildReviewQueue(result);
      await deps.store.saveRun(result);
      await deps.store.appendEvent(request.runId, { stage: "candidate_review", count: candidateReviews.length });
      await deps.store.appendEvent(request.runId, { stage: "finished", status: result.status });
      return result;
    },
    async generateDrafts(request: PipelineDraftRequest): Promise<PipelineRunResult> {
      const existing = await deps.store.readRun(request.runId);
      if (!existing) {
        throw new Error(`Run ${request.runId} not found.`);
      }
      await deps.store.appendEvent(request.runId, { stage: "draft_generation", status: "started", request });
      const selectedIds = new Set(request.sourceItemIds);
      const selections = existing.selections.filter((selection) => selectedIds.has(selection.sourceItemId));
      const drafts = await generateDraftArtifacts(request.runId, existing.sourceItems, existing.verifiedArticles, existing.summaries, selections, request.requestedPlatforms);
      const { assets, publishResults } = await composeAndPublish(request.runId, drafts, request);
      const result: PipelineRunResult = {
        ...existing,
        status: existing.errors.length > 0 ? "partial" : "success",
        finishedAt: new Date().toISOString(),
        drafts,
        assets,
        publishResults
      };
      result.reviewQueue = buildReviewQueue(result);
      await deps.store.saveRun(result);
      await deps.store.appendEvent(request.runId, { stage: "finished", status: result.status });
      return result;
    },
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
      result.reviewQueue = buildReviewQueue(result);
      await deps.store.saveRun(result);
      await deps.store.appendEvent(request.runId, { stage: "review_queue", count: result.reviewQueue.length });
      await deps.store.appendEvent(request.runId, { stage: "finished", status: result.status });
      return result;
    }
  };
}
