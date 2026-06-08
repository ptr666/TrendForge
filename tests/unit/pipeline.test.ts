import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDefaultPipeline } from "../../packages/core/src/pipeline.js";
import { buildReviewQueue } from "../../packages/core/src/review-queue.js";
import { createDefaultMediaComposer } from "../../packages/media/src/index.js";
import { createRunStore } from "../../packages/storage/src/run-store.js";
import type { PipelineRunResult } from "../../packages/core/src/types.js";

test("pipeline runs from AIHot source to platform draft plans and events", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-pipeline-"));
  const store = createRunStore({ rootDir });
  const pipeline = createDefaultPipeline({ store });

  try {
    const result = await pipeline.run({
      runId: "run-aihot",
      query: JSON.stringify({
        items: [{
          title: "AI search gets agentic",
          url: "about:blank",
          summary: "New AI search tools increasingly summarize, compare, and execute tasks for users.",
          tags: ["featured"]
        }]
      }),
      requestedPlatforms: ["review", "wechat", "xhs"],
      topN: 1
    });

    assert.equal(result.status, "success");
    assert.equal(result.sourceItems[0]?.collectorAdapter, "aihot");
    assert.equal(result.summaries.length, 1);
    assert.equal(result.drafts.length, 3);
    assert.deepEqual(result.assets, []);
    assert.ok(result.publishResults.every((publishResult) => publishResult.status === "queued"));
    assert.ok(result.reviewQueue?.some((item) => item.category === "publisher" && item.platform === "xhs"));
    assert.equal(result.reviewQueue?.some((item) => item.category === "asset"), false);

    const events = await store.readEvents("run-aihot");
    assert.ok(events.some((event) => event.stage === "summarize"));
    assert.ok(events.some((event) => event.stage === "publish" && event.platform === "wechat" && event.status === "queued"));
    assert.ok(events.some((event) => event.stage === "finished"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("pipeline only plans image assets when an image provider is configured", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-image-provider-"));
  const store = createRunStore({ rootDir });
  const pipeline = createDefaultPipeline({
    store,
    mediaComposer: createDefaultMediaComposer({
      async planPrompt(_draft, asset) {
        return {
          ...asset,
          source: "placeholder",
          prompt: `测试图片提示：${asset.type}`
        };
      }
    })
  });

  try {
    const result = await pipeline.run({
      runId: "run-image-provider",
      query: JSON.stringify({
        items: [{
          title: "AI publishing workflow with images",
          url: "about:blank",
          summary: "A signal for testing explicit image provider configuration.",
          tags: ["featured"]
        }]
      }),
      requestedPlatforms: ["wechat", "xhs"],
      topN: 1
    });

    assert.ok(result.assets.some((asset) => asset.type === "cover" && asset.ratio === "16:9"));
    assert.ok(result.assets.some((asset) => asset.type === "xhs_image" && asset.ratio === "3:4"));
    assert.ok(result.assets.every((asset) => asset.status === "needs-approval"));
    assert.ok(result.reviewQueue?.some((item) => item.category === "asset"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("review queue tolerates older saved runs with missing arrays", () => {
  const queue = buildReviewQueue({
    runId: "legacy-run",
    status: "success",
    startedAt: "2026-06-06T00:00:00.000Z",
    finishedAt: "2026-06-06T00:01:00.000Z",
    sourceItems: []
  } as unknown as PipelineRunResult);

  assert.deepEqual(queue, []);
});

test("pipeline screen only analyzes selected AIHot source item ids", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-screen-selected-aihot-"));
  const store = createRunStore({ rootDir });
  const pipeline = createDefaultPipeline({
    store,
    sourceAdapters: [{
      name: "aihot",
      async healthcheck() {
        return { ok: true };
      },
      async collect() {
        return [{
          id: "skip-me",
          title: "Ignored AIHot signal",
          url: "about:blank",
          summary: "This item should not enter scoring."
        }, {
          id: "keep-me",
          title: "Selected AIHot signal",
          url: "about:blank",
          summary: "This selected item should enter scoring."
        }];
      },
      normalize(raw) {
        const item = raw as { id: string; title: string; url: string; summary: string };
        return {
          id: item.id,
          sourceType: "aihot",
          collectorAdapter: "aihot",
          complianceStatus: "not_required",
          title: item.title,
          url: item.url,
          summary: item.summary,
          tags: ["aihot"]
        };
      },
      explainFailure(error) {
        return error instanceof Error ? error.message : String(error);
      }
    }]
  });

  try {
    const result = await pipeline.screen({
      runId: "screen-selected-aihot",
      sources: [{
        id: "aihot-default",
        title: "AIHot",
        type: "aihot",
        source: "fixture",
        enabled: true
      }],
      sourceItemIds: ["keep-me"],
      candidateCount: 3
    });
    const events = await store.readEvents("screen-selected-aihot");

    assert.equal(result.sourceItems.length, 1);
    assert.equal(result.sourceItems[0]?.id, "keep-me");
    assert.equal(result.candidateReviews?.[0]?.sourceItemId, "keep-me");
    assert.ok(events.some((event) => event.stage === "collect" && event.status === "filtered" && event.count === 1));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("pipeline attempts HTTP full-text acquisition and does not show BrowserAct planned as user risk", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-http-fulltext-"));
  const store = createRunStore({ rootDir });
  const pipeline = createDefaultPipeline({
    store,
    fullTextProvider: {
      async acquire(item, article) {
        return {
          ...article,
          status: "failed",
          method: "http",
          evidenceUrl: item.url,
          failureReason: "HTTP 原文获取失败：network blocked"
        };
      }
    }
  });

  try {
    const result = await pipeline.run({
      runId: "run-http-fulltext",
      query: JSON.stringify({
        items: [{
          title: "AI model ships new agent runtime",
          url: "https://example.com/agent-runtime",
          summary: "Brief AIHot signal that needs original article acquisition before final content.",
          tags: ["featured"]
        }]
      }),
      requestedPlatforms: ["review"],
      topN: 1
    });

    const events = await store.readEvents("run-http-fulltext");
    const httpResult = events.find((event) => event.stage === "fetch_full_text" && event.adapter === "http" && event.status === "failed");

    assert.equal(result.status, "partial");
    assert.equal(result.verifiedArticles[0]?.status, "failed");
    assert.equal(result.verifiedArticles[0]?.method, "http");
    assert.match(result.verifiedArticles[0]?.failureReason ?? "", /HTTP/);
    assert.ok(httpResult);
    assert.equal(result.candidateReviews?.some((candidate) => candidate.riskNotes.includes("Original text acquisition planned for BrowserAct.")) ?? false, false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("pipeline can use an injected BrowserAct provider before summary and drafts", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-browseract-provider-"));
  const store = createRunStore({ rootDir });
  const pipeline = createDefaultPipeline({
    store,
    fullTextProvider: {
      async acquire(item, article) {
        return {
          ...article,
          status: "verified",
          method: "browseract",
          evidenceUrl: item.url,
          fullText: "Complete BrowserAct article text with enough detail for summary and drafts."
        };
      }
    }
  });

  try {
    const result = await pipeline.run({
      runId: "run-browseract-provider",
      query: JSON.stringify({
        items: [{
          title: "AI workflow automation",
          url: "https://example.com/workflow",
          summary: "Brief signal.",
          tags: ["featured"]
        }]
      }),
      requestedPlatforms: ["review", "wechat", "xhs"],
      topN: 1
    });
    const events = await store.readEvents("run-browseract-provider");

    assert.equal(result.verifiedArticles[0]?.status, "verified");
    assert.equal(result.verifiedArticles[0]?.method, "browseract");
    assert.equal(typeof result.verifiedArticles[0]?.fullTextArtifactPath, "string");
    assert.ok(result.drafts.some((draft) => draft.body.includes("Complete BrowserAct article text")));
    assert.ok(events.some((event) => event.stage === "fetch_full_text" && event.adapter === "browseract" && event.status === "verified" && typeof event.artifactPath === "string"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("pipeline does not plan MediaCrawler full-text acquisition unless explicitly enabled", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-mediacrawler-gate-"));
  const store = createRunStore({ rootDir });
  const pipeline = createDefaultPipeline({
    store,
    fullTextProvider: {
      async acquire(item, article) {
        return {
          ...article,
          status: "failed",
          method: "http",
          evidenceUrl: item.url,
          failureReason: "HTTP 原文获取失败：network blocked"
        };
      }
    }
  });

  try {
    await pipeline.run({
      runId: "run-mediacrawler-gate",
      query: JSON.stringify({
        items: [{
          title: "AI app adds workflow automation",
          url: "https://example.com/workflow-automation",
          summary: "Brief signal that still needs original text.",
          tags: ["featured"]
        }]
      }),
      requestedPlatforms: ["review"],
      topN: 1
    });

    const events = await store.readEvents("run-mediacrawler-gate");
    const mediaCrawlerPlan = events.find((event) => event.stage === "fetch_full_text" && event.adapter === "mediacrawler");
    const httpFailure = events.find((event) => event.stage === "fetch_full_text" && event.adapter === "http" && event.status === "failed");

    assert.equal(mediaCrawlerPlan, undefined);
    assert.ok(httpFailure);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("pipeline blocks real platform draft creation when publisher health gates are not ready", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-real-draft-gate-"));
  const store = createRunStore({ rootDir });
  const pipeline = createDefaultPipeline({ store });

  try {
    const result = await pipeline.run({
      runId: "run-real-draft-gate",
      query: JSON.stringify({
        items: [{
          title: "AI publishing workflow",
          url: "about:blank",
          summary: "A signal for testing explicit platform draft creation gates.",
          tags: ["featured"]
        }]
      }),
      requestedPlatforms: ["wechat", "xhs"],
      allowRealDraft: true,
      topN: 1
    });

    const events = await store.readEvents("run-real-draft-gate");

    assert.ok(result.publishResults.every((publishResult) => publishResult.status === "failed"));
    assert.ok(result.reviewQueue?.some((item) => item.category === "publisher" && item.platform === "wechat" && item.status === "blocked"));
    assert.ok(result.reviewQueue?.some((item) => item.category === "publisher" && item.platform === "xhs" && item.status === "blocked"));
    assert.ok(events.some((event) => event.stage === "publish" && event.platform === "wechat" && event.status === "failed"));
    assert.ok(events.some((event) => event.stage === "publish" && event.platform === "xhs" && event.status === "failed"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("draft generation is separated from platform draft publishing", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-draft-publish-split-"));
  const store = createRunStore({ rootDir });
  const pipeline = createDefaultPipeline({ store });

  try {
    const screened = await pipeline.screen({
      runId: "run-draft-publish-split",
      sources: [{
        id: "manual-aihot",
        title: "Manual AIHot",
        type: "aihot",
        source: JSON.stringify({
          items: [{
            title: "AI content operations",
            url: "about:blank",
            summary: "A verified signal for split draft and publish flow.",
            tags: ["featured"]
          }]
        }),
        enabled: true
      }],
      candidateCount: 1
    });
    const drafted = await pipeline.generateDrafts({
      runId: screened.runId,
      sourceItemIds: screened.candidateReviews?.map((candidate) => candidate.sourceItemId) ?? [],
      requestedPlatforms: ["review", "wechat", "xhs"],
      allowRealDraft: true
    });

    assert.deepEqual(drafted.drafts.map((draft) => draft.platform).sort(), ["review", "wechat", "xhs"]);
    assert.deepEqual(drafted.publishResults, []);
    assert.equal(drafted.reviewQueue?.some((item) => item.category === "publisher"), false);

    const published = await pipeline.publishDrafts({
      runId: screened.runId,
      requestedPlatforms: ["wechat", "xhs"],
      allowRealDraft: false
    });
    const events = await store.readEvents(screened.runId);

    assert.ok(published.publishResults.some((result) => result.platform === "wechat" && result.status === "queued"));
    assert.ok(published.publishResults.some((result) => result.platform === "xhs" && result.status === "queued"));
    assert.ok(published.reviewQueue?.some((item) => item.category === "publisher" && item.platform === "wechat"));
    assert.ok(events.some((event) => event.stage === "platform_publish" && event.status === "finished"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
