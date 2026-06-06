import { createDefaultDraftGenerator } from "../../generator/src/index.js";
import { createDefaultMediaComposer } from "../../media/src/index.js";
import { createNoopPublishers } from "../../publishers/src/index.js";
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
  VerifiedArticle
} from "./types.js";

export interface PipelineDeps {
  store: RunStore;
  sourceAdapters?: SourceAdapter[];
}

export function createDefaultPipeline(deps: PipelineDeps) {
  const verifier = createDefaultVerifier();
  const selector = createDefaultSelector();
  const generator = createDefaultDraftGenerator();
  const textProvider = createDefaultTextProvider();
  const media = createDefaultMediaComposer();
  const publishers = createNoopPublishers();

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
          const publishResult = request.dryRunPublish === false || request.allowRealDraft === true
            ? await publisher.publishDraft(draft)
            : {
                draftId: draft.id,
                platform: publisher.platform,
                status: "skipped" as const,
                message: "Dry-run publish. Real publishing requires dryRunPublish=false."
              };
          publishResults.push(publishResult);
          await deps.store.appendEvent(request.runId, {
            stage: "publish",
            draftId: draft.id,
            platform: publisher.platform,
            status: publishResult.status
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
