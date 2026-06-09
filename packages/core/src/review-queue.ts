import type { PipelineRunResult, ReviewQueueItem } from "./types.js";

function itemTitle(result: PipelineRunResult, sourceItemId: string): string {
  return safeArray(result.sourceItems).find((item) => item.id === sourceItemId)?.title ?? sourceItemId;
}

function safeArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function buildReviewQueue(result: PipelineRunResult): ReviewQueueItem[] {
  const createdAt = result.finishedAt;
  const queue: ReviewQueueItem[] = [];
  const candidateIds = new Set(safeArray(result.candidateReviews).map((candidate) => candidate.sourceItemId));

  for (const error of safeArray(result.errors)) {
    if (error.stage.startsWith("select:")) continue;
    queue.push({
      id: `${result.runId}:pipeline:${error.stage}`,
      runId: result.runId,
      status: "blocked",
      category: "pipeline",
      title: `Pipeline issue: ${error.stage}`,
      reason: error.message,
      action: "Inspect run events, fix the failed stage, then rerun this slice.",
      priority: "high",
      createdAt
    });
  }

  for (const article of safeArray(result.verifiedArticles)) {
    if (!candidateIds.has(article.sourceItemId)) continue;
    if (article.status === "failed" || !article.fullText?.trim()) {
      queue.push({
        id: `${result.runId}:original-text:${article.sourceItemId}`,
        runId: result.runId,
        status: article.status === "failed" ? "blocked" : "waiting",
        category: "original-text",
        title: itemTitle(result, article.sourceItemId),
        reason: article.failureReason ?? "Full original text is not available yet.",
        action: article.status === "failed"
          ? "Retry BrowserAct or explicitly enable a compliant MediaCrawler fallback."
          : "Review the BrowserAct planned command or fetch the full original text.",
        sourceItemId: article.sourceItemId,
        evidenceUrl: article.evidenceUrl,
        artifactPath: article.fullTextArtifactPath,
        priority: "high",
        createdAt
      });
    }
  }

  for (const asset of safeArray(result.assets)) {
    if (asset.status === "blocked" || asset.status === "failed") {
      const draft = safeArray(result.drafts).find((candidate) => candidate.id === asset.draftId);
      queue.push({
        id: `${result.runId}:asset:${asset.id}`,
        runId: result.runId,
        status: "blocked",
        category: "asset",
        title: `${draft?.platform ?? "platform"} image ${asset.type}`,
        reason: asset.errorMessage ?? `Image generation failed. Ratio: ${asset.ratio ?? "platform default"}.`,
        action: "Open the draft image panel, regenerate this image, or continue with text-only draft if acceptable.",
        sourceItemId: draft?.sourceItemId,
        draftId: asset.draftId,
        platform: draft?.platform,
        artifactPath: asset.path,
        priority: "high",
        createdAt
      });
    }
  }

  for (const publishResult of safeArray(result.publishResults)) {
    if (publishResult.status !== "failed") continue;
    queue.push({
      id: `${result.runId}:publisher:${publishResult.draftId}:${publishResult.platform}`,
      runId: result.runId,
      status: "blocked",
      category: "publisher",
      title: `${publishResult.platform} handoff for ${publishResult.draftId}`,
      reason: publishResult.message ?? publishResult.verificationSignal ?? "Publisher health gate failed.",
      action: "Resolve health gate requirements before retrying real draft creation.",
      draftId: publishResult.draftId,
      platform: publishResult.platform,
      artifactPath: publishResult.artifactPath,
      priority: "high",
      createdAt
    });
  }

  return queue;
}
