import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDefaultDraftGenerator } from "../../generator/src/index.js";
import { createDefaultMediaComposer, prepareMediaAsset } from "../../media/src/index.js";
import { createPlannedPublishers } from "../../publishers/src/index.js";
import { createDefaultTextProvider, createHttpFullTextProvider } from "../../providers/src/index.js";
import { createDefaultSelector } from "../../selector/src/index.js";
import { createDefaultSourceAdapters } from "../../sources/src/adapters.js";
import { createDefaultVerifier } from "../../verifier/src/index.js";
import { buildReviewQueue } from "./review-queue.js";
import type {
  CandidateReview,
  CandidateSelection,
  PipelineDraftRequest,
  PipelineAssetRegenerateRequest,
  PipelinePublishRequest,
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
  MediaComposer,
  MediaAsset,
  PublisherAdapter,
  TextProvider,
  Selector,
  TrendForgePipeline
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
  mediaComposer?: MediaComposer;
}

function defaultHandoffDir(runId: string, baseDir?: string, runsRoot?: string): string {
  return baseDir ?? path.join(runsRoot ?? path.resolve("workspace", "runs"), runId, "publisher-handoffs");
}

function defaultFullTextHandoffDir(runId: string, baseDir?: string, runsRoot?: string): string {
  return baseDir ?? path.join(runsRoot ?? path.resolve("workspace", "runs"), runId, "full-text-handoffs");
}

function defaultDraftArtifactDir(runId: string, baseDir?: string, runsRoot?: string): string {
  return baseDir ?? path.join(runsRoot ?? path.resolve("workspace", "runs"), runId, "drafts");
}

function defaultAssetDir(runId: string, runsRoot?: string): string {
  return path.join(runsRoot ?? path.resolve("workspace", "runs"), runId, "assets");
}

function defaultFullTextArtifactDir(runId: string, baseDir?: string, runsRoot?: string): string {
  return baseDir ?? path.join(runsRoot ?? path.resolve("workspace", "runs"), runId, "full-text");
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

function userRiskNotes(notes: string[]): string[] {
  return notes.filter((note) => note !== "Original text acquisition planned for BrowserAct.");
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

async function writeDraftArtifact(runId: string, draft: PlatformDraft, baseDir?: string, runsRoot?: string): Promise<PlatformDraft> {
  const dir = defaultDraftArtifactDir(runId, baseDir, runsRoot);
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
  baseDir?: string,
  runsRoot?: string
): Promise<string> {
  const dir = defaultFullTextHandoffDir(runId, baseDir, runsRoot);
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
  baseDir?: string,
  runsRoot?: string
): Promise<VerifiedArticle> {
  if (!article.fullText?.trim()) return article;

  const dir = defaultFullTextArtifactDir(runId, baseDir, runsRoot);
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

export function createDefaultPipeline(deps: PipelineDeps): TrendForgePipeline {
  const verifier = createDefaultVerifier();
  const selector = deps.selector ?? createDefaultSelector();
  const generator = createDefaultDraftGenerator();
  const textProvider = deps.textProvider ?? createDefaultTextProvider();
  const media = deps.mediaComposer ?? createDefaultMediaComposer();
  const publishers = deps.publishers ?? createPlannedPublishers();
  const fullTextProvider = deps.fullTextProvider ?? createHttpFullTextProvider();

  async function acquireFullTextForItem(item: SourceItem, article: VerifiedArticle): Promise<VerifiedArticle> {
    try {
      return await fullTextProvider.acquire(item, article);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ...article,
        status: "failed",
        method: "http",
        evidenceUrl: item.url,
        failureReason: `HTTP 原文获取失败：${message}`
      };
    }
  }

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

  async function fetchSelectedFullText(runId: string, sourceItems: SourceItem[], verifiedArticles: VerifiedArticle[], selected: CandidateSelection[], request: { allowBrowserFallback?: boolean; allowMediaCrawlerFallback?: boolean }, errors?: Array<{ stage: string; message: string }>, targetCount?: number) {
    const usableSelections: CandidateSelection[] = [];
    for (const selection of selected) {
      if (targetCount !== undefined && usableSelections.length >= targetCount) break;
      const article = verifiedArticles.find((candidate) => candidate.sourceItemId === selection.sourceItemId);
      const item = sourceItems.find((candidate) => candidate.id === selection.sourceItemId);
      if (!article || !item) continue;
      let currentArticle = article;

      if (article.status !== "verified" && isHttpUrl(item.url)) {
        await deps.store.appendEvent(runId, {
          stage: "fetch_full_text",
          adapter: "http",
          status: "started",
          sourceItemId: item.id,
          evidenceUrl: item.url
        });
        const acquired = await acquireFullTextForItem(item, article);
        const acquiredWithArtifact = await writeFullTextArtifact(runId, item, acquired, deps.fullTextArtifactDir, deps.store.rootDir);
        verifiedArticles.splice(verifiedArticles.indexOf(article), 1, acquiredWithArtifact);
        currentArticle = acquiredWithArtifact;
        const browserActHandoffPath = acquiredWithArtifact.method === "browseract"
          ? await writeFullTextHandoff(runId, item, ["browseract", "stealth-extract", item.url], deps.fullTextHandoffDir, deps.store.rootDir)
          : undefined;
        await deps.store.appendEvent(runId, {
          stage: "fetch_full_text",
          adapter: acquiredWithArtifact.method,
          status: acquiredWithArtifact.status,
          sourceItemId: item.id,
          evidenceUrl: acquiredWithArtifact.evidenceUrl,
          artifactPath: acquiredWithArtifact.fullTextArtifactPath ?? browserActHandoffPath,
          reason: acquiredWithArtifact.failureReason
        });
        if (acquiredWithArtifact.status === "failed" && request.allowMediaCrawlerFallback === true) {
          await deps.store.appendEvent(runId, {
            stage: "fetch_full_text",
            adapter: "mediacrawler",
            status: "planned",
            sourceItemId: item.id,
            evidenceUrl: item.url,
            command: ["uv", "run", "main.py", "--type", "detail", "--url", item.url],
            reason: "HTTP 原文获取失败；MediaCrawler fallback 需要显式启用并完成合规检查。"
          });
        }
      }

      if (canGenerateFinalDraft(item, currentArticle)) {
        usableSelections.push(selection);
      } else {
        const reason = currentArticle.failureReason ?? "Full original text was not available for final summary generation.";
        errors?.push({ stage: `select:${item.id}`, message: reason });
        await deps.store.appendEvent(runId, {
          stage: "select",
          status: "skipped",
          sourceItemId: item.id,
          score: 0,
          reason
        });
      }
    }
    return usableSelections;
  }

  async function summarizeSelections(runId: string, sourceItems: SourceItem[], verifiedArticles: VerifiedArticle[], selections: CandidateSelection[], errors?: Array<{ stage: string; message: string }>) {
    const summaries = [];
    const candidateReviews: CandidateReview[] = [];
    for (const selection of selections) {
      const article = verifiedArticles.find((candidate) => candidate.sourceItemId === selection.sourceItemId);
      const item = sourceItems.find((candidate) => candidate.id === selection.sourceItemId);
      if (!article || !item) continue;
      try {
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
          riskNotes: userRiskNotes(summary.riskNotes)
        });
        await deps.store.appendEvent(runId, { stage: "summarize", sourceItemId: article.sourceItemId, status: "finished" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors?.push({ stage: `summarize:${item.id}`, message });
        await deps.store.appendEvent(runId, { stage: "summarize", sourceItemId: article.sourceItemId, status: "skipped", message });
      }
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
        drafts.push(await writeDraftArtifact(runId, await generator.generateReviewDraft(selection, article, summary), deps.draftArtifactDir, deps.store.rootDir));
      }
      if (requestedPlatforms.includes("wechat")) {
        drafts.push(await writeDraftArtifact(runId, await generator.generateWechatDraft(selection, article, summary), deps.draftArtifactDir, deps.store.rootDir));
      }
      if (requestedPlatforms.includes("xhs")) {
        drafts.push(await writeDraftArtifact(runId, await generator.generateXhsDraft(selection, article, summary), deps.draftArtifactDir, deps.store.rootDir));
      }
    }
    await deps.store.appendEvent(runId, { stage: "generate", count: drafts.length });
    return drafts;
  }

  async function composeMedia(runId: string, drafts: PlatformDraft[]) {
    const assets = [];
    await deps.store.appendEvent(runId, {
      stage: "compose_media",
      status: "started",
      processedCount: 0,
      totalDrafts: drafts.length
    });
    let processedDrafts = 0;
    for (const draft of drafts) {
      await deps.store.appendEvent(runId, {
        stage: "compose_media",
        status: "draft_started",
        draftId: draft.id,
        platform: draft.platform,
        processedCount: processedDrafts,
        totalDrafts: drafts.length
      });
      const plannedAssets = await media.planAssets(draft);
      const preparedAssets = plannedAssets.map((asset, index) => prepareMediaAsset(
        runId,
        draft,
        asset,
        asset.index ?? index + 1,
        defaultAssetDir(runId, deps.store.rootDir)
      ));
      const generatedAssets = await media.generateAssets(preparedAssets);
      assets.push(...generatedAssets);
      await media.attachAssets(draft, generatedAssets);
      processedDrafts += 1;
      await deps.store.appendEvent(runId, {
        stage: "compose_media",
        status: "draft_finished",
        draftId: draft.id,
        platform: draft.platform,
        processedCount: processedDrafts,
        totalDrafts: drafts.length,
        count: assets.length
      });
    }
    await deps.store.appendEvent(runId, {
      stage: "compose_media",
      status: "finished",
      processedCount: processedDrafts,
      totalDrafts: drafts.length,
      count: assets.length
    });
    return assets;
  }

  async function publishExistingDrafts(runId: string, drafts: PlatformDraft[], assets: MediaAsset[], request: { allowRealDraft?: boolean }) {
    const publishResults = [];
    for (const draft of drafts) {
      const publisher = publishers.find((candidate) => candidate.platform === draft.platform);
      if (publisher) {
        const publishResult = await publisher.publishDraft(draft, {
          allowRealDraft: request.allowRealDraft === true,
          handoffDir: defaultHandoffDir(runId, deps.publisherHandoffDir, deps.store.rootDir),
          assets: assets.filter((asset) => asset.draftId === draft.id || draft.assetIds?.includes(asset.id))
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
    return publishResults;
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
      const ranked = selector.selectTopN(scored, scored.length);
      const selections = await fetchSelectedFullText(request.runId, sourceItems, verifiedArticles, ranked, request, errors, request.candidateCount);
      if (sourceItems.length > 0 && scored.length > 0 && selections.length === 0) {
        errors.push({ stage: "select", message: "No selected candidate had verified original text for candidate review." });
      }
      const { summaries, candidateReviews } = await summarizeSelections(request.runId, sourceItems, verifiedArticles, selections, errors);
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
      const assets = await composeMedia(request.runId, drafts);
      const result: PipelineRunResult = {
        ...existing,
        status: existing.errors.length > 0 ? "partial" : "success",
        finishedAt: new Date().toISOString(),
        drafts,
        assets,
        publishResults: existing.publishResults ?? []
      };
      result.reviewQueue = buildReviewQueue(result);
      await deps.store.saveRun(result);
      await deps.store.appendEvent(request.runId, { stage: "finished", status: result.status });
      return result;
    },
    async publishDrafts(request: PipelinePublishRequest): Promise<PipelineRunResult> {
      const existing = await deps.store.readRun(request.runId);
      if (!existing) {
        throw new Error(`Run ${request.runId} not found.`);
      }
      await deps.store.appendEvent(request.runId, { stage: "platform_publish", status: "started", request });
      const draftIds = new Set(request.draftIds ?? []);
      const sourceItemIds = new Set(request.sourceItemIds ?? []);
      const requestedPlatforms = new Set(request.requestedPlatforms?.filter((platform) => platform !== "review") ?? ["wechat", "xhs"]);
      const drafts = existing.drafts.filter((draft) => {
        if (draft.platform === "review") return false;
        if (!requestedPlatforms.has(draft.platform)) return false;
        if (draftIds.size > 0 && !draftIds.has(draft.id)) return false;
        if (sourceItemIds.size > 0 && !sourceItemIds.has(draft.sourceItemId)) return false;
        return true;
      });
      const nextPublishResults = await publishExistingDrafts(request.runId, drafts, existing.assets ?? [], request);
      const replacedKeys = new Set(nextPublishResults.map((result) => `${result.platform}:${result.draftId}`));
      const previousPublishResults = (existing.publishResults ?? []).filter((result) => !replacedKeys.has(`${result.platform}:${result.draftId}`));
      const result: PipelineRunResult = {
        ...existing,
        status: existing.errors.length > 0 ? "partial" : "success",
        finishedAt: new Date().toISOString(),
        publishResults: [...previousPublishResults, ...nextPublishResults]
      };
      result.reviewQueue = buildReviewQueue(result);
      await deps.store.saveRun(result);
      await deps.store.appendEvent(request.runId, { stage: "platform_publish", status: "finished", count: nextPublishResults.length });
      await deps.store.appendEvent(request.runId, { stage: "finished", status: result.status });
      return result;
    },
    async regenerateAsset(request: PipelineAssetRegenerateRequest): Promise<PipelineRunResult> {
      const existing = await deps.store.readRun(request.runId);
      if (!existing) {
        throw new Error(`Run ${request.runId} not found.`);
      }
      const assetIndex = existing.assets.findIndex((asset) => asset.id === request.assetId);
      if (assetIndex < 0) {
        throw new Error(`Asset ${request.assetId} not found.`);
      }
      const currentAsset = existing.assets[assetIndex];
      const draft = existing.drafts.find((candidate) => candidate.id === currentAsset.draftId);
      if (!draft) {
        throw new Error(`Draft ${currentAsset.draftId} not found for asset ${request.assetId}.`);
      }
      await deps.store.appendEvent(request.runId, {
        stage: "asset_regenerate",
        assetId: request.assetId,
        status: "started"
      });
      const nextRevision = (currentAsset.revision ?? 1) + 1;
      const preparedAsset = prepareMediaAsset(
        request.runId,
        draft,
        {
          ...currentAsset,
          revision: nextRevision,
          filename: undefined,
          path: undefined,
          status: "planned",
          source: "placeholder",
          errorMessage: undefined
        },
        currentAsset.index ?? 1,
        defaultAssetDir(request.runId, deps.store.rootDir)
      );
      const draftCopy = { ...draft, assetIds: draft.assetIds ? [...draft.assetIds] : undefined };
      await media.attachAssets(draftCopy, [preparedAsset]);
      existing.assets[assetIndex] = preparedAsset;
      existing.finishedAt = new Date().toISOString();
      existing.reviewQueue = buildReviewQueue(existing);
      await deps.store.saveRun(existing);
      await deps.store.appendEvent(request.runId, {
        stage: "asset_regenerate",
        assetId: request.assetId,
        revision: preparedAsset.revision,
        status: preparedAsset.status
      });
      return existing;
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

        if (article.status !== "verified" && isHttpUrl(item.url)) {
          await deps.store.appendEvent(request.runId, {
            stage: "fetch_full_text",
            adapter: "http",
            status: "started",
            sourceItemId: item.id,
            evidenceUrl: item.url
          });
          const acquired = await acquireFullTextForItem(item, article);
          const acquiredWithArtifact = await writeFullTextArtifact(request.runId, item, acquired, deps.fullTextArtifactDir, deps.store.rootDir);
          verifiedArticles.splice(verifiedArticles.indexOf(article), 1, acquiredWithArtifact);
          currentArticle = acquiredWithArtifact;
          const browserActHandoffPath = acquiredWithArtifact.method === "browseract"
            ? await writeFullTextHandoff(request.runId, item, ["browseract", "stealth-extract", item.url], deps.fullTextHandoffDir, deps.store.rootDir)
            : undefined;
          await deps.store.appendEvent(request.runId, {
            stage: "fetch_full_text",
            adapter: acquiredWithArtifact.method,
            status: acquiredWithArtifact.status,
            sourceItemId: item.id,
            evidenceUrl: acquiredWithArtifact.evidenceUrl,
            artifactPath: acquiredWithArtifact.fullTextArtifactPath ?? browserActHandoffPath,
            reason: acquiredWithArtifact.failureReason
          });
          if (acquiredWithArtifact.status === "failed" && request.allowMediaCrawlerFallback === true) {
            await deps.store.appendEvent(request.runId, {
              stage: "fetch_full_text",
              adapter: "mediacrawler",
              status: "planned",
              sourceItemId: item.id,
              evidenceUrl: item.url,
              command: ["uv", "run", "main.py", "--type", "detail", "--url", item.url],
              reason: "HTTP 原文获取失败；MediaCrawler fallback 需要显式启用并完成合规检查。"
            });
          }
        }

        if (canGenerateFinalDraft(item, currentArticle)) {
          selections.push(selection);
        } else {
          const reason = currentArticle.failureReason ?? "Full original text was not available for final summary generation.";
          errors.push({ stage: `select:${item.id}`, message: reason });
          await deps.store.appendEvent(request.runId, {
            stage: "select",
            status: "skipped",
            sourceItemId: item.id,
            score: 0,
            reason
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
        try {
          const summary = await textProvider.summarize(article, selection);
          summaries.push(summary);
          await deps.store.appendEvent(request.runId, { stage: "summarize", sourceItemId: article.sourceItemId, status: "finished" });
          if (request.requestedPlatforms.includes("review")) {
            drafts.push(await writeDraftArtifact(request.runId, await generator.generateReviewDraft(selection, article, summary), deps.draftArtifactDir, deps.store.rootDir));
          }
          if (request.requestedPlatforms.includes("wechat")) {
            drafts.push(await writeDraftArtifact(request.runId, await generator.generateWechatDraft(selection, article, summary), deps.draftArtifactDir, deps.store.rootDir));
          }
          if (request.requestedPlatforms.includes("xhs")) {
            drafts.push(await writeDraftArtifact(request.runId, await generator.generateXhsDraft(selection, article, summary), deps.draftArtifactDir, deps.store.rootDir));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push({ stage: `summarize:${article.sourceItemId}`, message });
          await deps.store.appendEvent(request.runId, { stage: "summarize", sourceItemId: article.sourceItemId, status: "skipped", message });
        }
      }
      await deps.store.appendEvent(request.runId, { stage: "generate", count: drafts.length });

      const assets = await composeMedia(request.runId, drafts);

      const publishResults = [];
      for (const draft of drafts) {
        const publisher = publishers.find((candidate) => candidate.platform === draft.platform);
        if (publisher) {
          const publishResult = await publisher.publishDraft(draft, {
            allowRealDraft: request.allowRealDraft === true,
            handoffDir: defaultHandoffDir(request.runId, deps.publisherHandoffDir, deps.store.rootDir),
            assets: assets.filter((asset) => asset.draftId === draft.id || draft.assetIds?.includes(asset.id))
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
