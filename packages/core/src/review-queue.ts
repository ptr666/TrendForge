import type { PipelineRunResult, ReviewQueueItem } from "./types.js";

function itemTitle(result: PipelineRunResult, sourceItemId: string): string {
  return result.sourceItems.find((item) => item.id === sourceItemId)?.title ?? sourceItemId;
}

export function buildReviewQueue(result: PipelineRunResult): ReviewQueueItem[] {
  const createdAt = result.finishedAt;
  const queue: ReviewQueueItem[] = [];

  for (const error of result.errors) {
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

  for (const article of result.verifiedArticles) {
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

  for (const summary of result.summaries) {
    queue.push({
      id: `${result.runId}:summary:${summary.sourceItemId}`,
      runId: result.runId,
      status: "needs-review",
      category: "summary",
      title: summary.title,
      reason: "Generated Chinese summary should be checked before platform draft approval.",
      action: "Review angle, key points, and risk notes; rerun summary if the angle is weak.",
      sourceItemId: summary.sourceItemId,
      priority: summary.riskNotes.length > 0 ? "high" : "normal",
      createdAt
    });
  }

  for (const draft of result.drafts) {
    queue.push({
      id: `${result.runId}:draft:${draft.id}`,
      runId: result.runId,
      status: "needs-review",
      category: "draft",
      title: draft.title,
      reason: `${draft.platform} draft is generated and needs human approval before real platform draft creation.`,
      action: "Open the draft artifact, edit if needed, then approve the platform handoff.",
      sourceItemId: draft.sourceItemId,
      draftId: draft.id,
      platform: draft.platform,
      artifactPath: draft.artifactPath,
      priority: "normal",
      createdAt
    });
  }

  for (const asset of result.assets) {
    if (asset.approvalRequired || asset.status === "needs-approval") {
      const draft = result.drafts.find((candidate) => candidate.id === asset.draftId);
      queue.push({
        id: `${result.runId}:asset:${asset.id}`,
        runId: result.runId,
        status: asset.status === "blocked" ? "blocked" : "needs-review",
        category: "asset",
        title: `${draft?.platform ?? "platform"} asset ${asset.type}`,
        reason: `Asset plan requires approval before real platform draft creation. Ratio: ${asset.ratio ?? "platform default"}.`,
        action: "Review the prompt or generated asset; approve, regenerate, or attach a local asset before real draft creation.",
        sourceItemId: draft?.sourceItemId,
        draftId: asset.draftId,
        platform: draft?.platform,
        artifactPath: asset.path,
        priority: "normal",
        createdAt
      });
    }
  }

  for (const publishResult of result.publishResults) {
    queue.push({
      id: `${result.runId}:publisher:${publishResult.draftId}:${publishResult.platform}`,
      runId: result.runId,
      status: publishResult.status === "failed" ? "blocked" : publishResult.status === "success" ? "ready" : "waiting",
      category: "publisher",
      title: `${publishResult.platform} handoff for ${publishResult.draftId}`,
      reason: publishResult.message ?? publishResult.verificationSignal ?? "Publisher handoff is waiting for explicit action.",
      action: publishResult.status === "failed"
        ? "Resolve health gate requirements before retrying real draft creation."
        : "Run preview/check commands and create a real platform draft only after explicit approval.",
      draftId: publishResult.draftId,
      platform: publishResult.platform,
      artifactPath: publishResult.artifactPath,
      priority: publishResult.status === "failed" ? "high" : "normal",
      createdAt
    });
  }

  return queue;
}
