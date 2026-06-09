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
    assert.equal(result.reviewQueue?.some((item) => item.category === "publisher"), false);
    assert.equal(result.reviewQueue?.some((item) => item.category === "asset"), false);

    const events = await store.readEvents("run-aihot");
    assert.ok(events.some((event) => event.stage === "summarize"));
    assert.ok(events.some((event) => event.stage === "compose_media" && event.status === "started"));
    assert.ok(events.some((event) => event.stage === "compose_media" && event.status === "finished"));
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

    assert.equal(result.assets.filter((asset) => asset.type === "cover").length, 2);
    assert.equal(result.assets.filter((asset) => asset.type === "inline_image").length, 1);
    assert.equal(result.assets.filter((asset) => asset.type === "xhs_image").length, 1);
    assert.ok(result.assets.some((asset) => asset.platform === "wechat" && asset.type === "cover" && asset.ratio === "16:9"));
    assert.ok(result.assets.some((asset) => asset.platform === "xhs" && asset.type === "cover" && asset.ratio === "3:4"));
    assert.ok(result.assets.every((asset) => asset.id.startsWith("tf-run-image-provider-")));
    assert.ok(result.assets.every((asset) => String(asset.metadata?.outputDir ?? "").includes(path.join(rootDir, "run-image-provider", "assets"))));
    assert.ok(result.assets.every((asset) => asset.status === "ready"));
    assert.equal(result.reviewQueue?.some((item) => item.category === "asset"), false);

    const events = await store.readEvents("run-image-provider");
    assert.ok(events.some((event) => event.stage === "compose_media" && event.status === "draft_finished" && event.platform === "wechat" && event.processedCount === 1));
    assert.ok(events.some((event) => event.stage === "compose_media" && event.status === "finished" && event.processedCount === 2 && event.count === 4));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("pipeline isolates one scoring failure and continues screening other items", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-score-failure-isolated-"));
  const store = createRunStore({ rootDir });
  let scoreCalls = 0;
  const pipeline = createDefaultPipeline({
    store,
    selector: {
      async score(article) {
        scoreCalls += 1;
        if (scoreCalls === 1) {
          throw new Error("model 504");
        }
        return {
          sourceItemId: article.sourceItemId,
          score: scoreCalls === 2 ? 90 : 80,
          reason: "可用评分",
          targetPlatforms: ["review"],
          angle: "稳定性",
          tags: ["test"]
        };
      },
      selectTopN(scored, limit) {
        return scored.slice().sort((a, b) => b.score - a.score).slice(0, limit);
      }
    }
  });

  try {
    const result = await pipeline.screen({
      runId: "run-score-failure-isolated",
      sources: [{
        id: "manual-aihot",
        title: "Manual AIHot",
        type: "aihot",
        source: JSON.stringify({
          items: [{
            id: "score-fails",
            title: "Scoring failure",
            url: "about:blank",
            summary: "This item triggers a scoring failure.",
            tags: ["featured"]
          }, {
            id: "best",
            title: "Best usable signal",
            url: "about:blank",
            summary: "This item should become the top candidate.",
            tags: ["featured"]
          }, {
            id: "backup",
            title: "Backup usable signal",
            url: "about:blank",
            summary: "This item should remain available.",
            tags: ["featured"]
          }]
        }),
        enabled: true
      }],
      candidateCount: 2
    });
    const events = await store.readEvents("run-score-failure-isolated");

    assert.equal(result.status, "partial");
    assert.equal(result.candidateReviews?.length, 2);
    assert.equal(result.candidateReviews?.[0]?.title, "Best usable signal");
    assert.equal(result.candidateReviews?.[1]?.title, "Backup usable signal");
    assert.ok(events.some((event) => event.stage === "score_failed" && event.score === 0));
    assert.ok(events.some((event) => event.stage === "screen_item_skipped" && /model 504/.test(String(event.reason))));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("pipeline uses a deterministic Chinese summary fallback when the text model fails", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-summary-fallback-"));
  const store = createRunStore({ rootDir });
  const pipeline = createDefaultPipeline({
    store,
    textProvider: {
      async summarize() {
        throw new Error("summary model 504");
      }
    }
  });

  try {
    const result = await pipeline.screen({
      runId: "run-summary-fallback",
      sources: [{
        id: "manual-aihot",
        title: "Manual AIHot",
        type: "aihot",
        source: JSON.stringify({
          items: [{
            id: "summary-fallback",
            title: "AI infrastructure signal",
            url: "about:blank",
            summary: "A detailed signal about AI infrastructure investment and platform implications.",
            tags: ["featured", "infrastructure"]
          }]
        }),
        enabled: true
      }],
      candidateCount: 1
    });
    const events = await store.readEvents("run-summary-fallback");

    assert.equal(result.status, "partial");
    assert.equal(result.candidateReviews?.length, 1);
    assert.equal(result.candidateReviews?.[0]?.summaryFallback, true);
    assert.match(result.candidateReviews?.[0]?.summary.summary ?? "", /模型总结失败/);
    assert.ok(events.some((event) => event.stage === "summary_fallback"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("review queue only surfaces blocked image assets as exceptions", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-image-exception-"));
  const store = createRunStore({ rootDir });
  const pipeline = createDefaultPipeline({
    store,
    mediaComposer: createDefaultMediaComposer({
      async planPrompt() {
        throw new Error("image provider failed");
      }
    })
  });

  try {
    const result = await pipeline.run({
      runId: "run-image-exception",
      query: JSON.stringify({
        items: [{
          title: "AI publishing workflow with image failure",
          url: "about:blank",
          summary: "A signal for testing image exception reminders.",
          tags: ["featured"]
        }]
      }),
      requestedPlatforms: ["wechat"],
      topN: 1
    });

    assert.ok(result.assets.every((asset) => asset.status === "failed"));
    assert.ok(result.reviewQueue?.some((item) => item.category === "asset" && item.status === "blocked" && /image provider failed/.test(item.reason)));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("pipeline scores source items with bounded concurrency", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-score-concurrency-"));
  const store = createRunStore({ rootDir });
  let active = 0;
  let maxActive = 0;
  const pipeline = createDefaultPipeline({
    store,
    scoreConcurrency: 3,
    selector: {
      async score(article) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 15));
        active -= 1;
        return {
          sourceItemId: article.sourceItemId,
          score: 80,
          reason: "并发评分测试。",
          angle: "并发评分",
          tags: ["test"],
          targetPlatforms: ["review"]
        };
      },
      selectTopN(scored, count) {
        return scored.slice(0, count);
      }
    }
  });

  try {
    const result = await pipeline.screen({
      runId: "run-score-concurrency",
      sources: [{
        id: "manual-aihot",
        title: "Manual AIHot",
        type: "aihot",
        source: JSON.stringify({
          items: Array.from({ length: 8 }, (_, index) => ({
            title: `AI signal ${index + 1}`,
            url: "about:blank",
            summary: "A signal for testing bounded concurrent scoring.",
            tags: ["featured"]
          }))
        }),
        enabled: true
      }],
      candidateCount: 2
    });

    assert.equal(result.selections.length, 2);
    assert.equal(maxActive, 3);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("pipeline regenerates one image asset with a new revision", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-image-regenerate-"));
  const store = createRunStore({ rootDir });
  const pipeline = createDefaultPipeline({
    store,
    mediaComposer: createDefaultMediaComposer({
      async planPrompt(_draft, asset) {
        return {
          ...asset,
          source: "placeholder",
          prompt: `revision-${asset.revision}`
        };
      }
    })
  });

  try {
    const result = await pipeline.run({
      runId: "run-regenerate",
      query: JSON.stringify({
        items: [{
          title: "AI publishing workflow with regenerated images",
          url: "about:blank",
          summary: "A signal for testing image regeneration.",
          tags: ["featured"]
        }]
      }),
      requestedPlatforms: ["wechat"],
      topN: 1
    });
    const target = result.assets.find((asset) => asset.type === "cover");
    const untouched = result.assets.find((asset) => asset.type === "inline_image");
    assert.ok(target);
    assert.ok(untouched);

    const regenerated = await pipeline.regenerateAsset({ runId: "run-regenerate", assetId: target.id });
    const nextTarget = regenerated.assets.find((asset) => asset.id === target.id);
    const nextUntouched = regenerated.assets.find((asset) => asset.id === untouched.id);

    assert.equal(nextTarget?.revision, 2);
    assert.equal(nextTarget?.prompt, "revision-2");
    assert.equal(nextTarget?.filename?.endsWith("-r2"), true);
    assert.equal(nextUntouched?.revision, untouched.revision);
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

test("pipeline skips one item when original text is too short and continues other candidates", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-skip-short-original-"));
  const store = createRunStore({ rootDir });
  const pipeline = createDefaultPipeline({
    store,
    fullTextProvider: {
      async acquire(item, article) {
        if (item.title.includes("Short original")) {
          throw new Error("抽取出的正文太短：76 字符。");
        }
        return article;
      }
    },
    textProvider: {
      async summarize(article, selection) {
        if (article.status === "failed") throw new Error(article.failureReason ?? "original failed");
        return {
          sourceItemId: article.sourceItemId,
          title: `总结 ${article.sourceItemId}`,
          translatedOriginal: "中文译文",
          summary: "中文总结",
          angle: selection.angle ?? "角度",
          keyPoints: ["要点"],
          riskNotes: []
        };
      }
    },
    selector: {
      async score(article) {
        return {
          sourceItemId: article.sourceItemId,
          score: article.sourceItemId === "short-original" ? 100 : 95,
          reason: "测试用确定性评分",
          targetPlatforms: ["review", "wechat", "xhs"],
          angle: "测试角度",
          tags: ["test"]
        };
      },
      selectTopN(selections, limit) {
        return selections.slice(0, limit);
      }
    }
  });

  try {
    const result = await pipeline.screen({
      runId: "run-skip-short-original",
      sources: [{
        id: "manual-aihot",
        title: "Manual AIHot",
        type: "aihot",
        source: JSON.stringify({
          items: [
            {
              id: "short-original",
              title: "Short original article",
              url: "https://example.com/short",
              summary: "This one has a short extracted original text.",
              tags: ["featured"]
            },
            {
              id: "good-original",
              title: "Good original article",
              url: "about:blank",
              summary: "This one should still become a candidate.",
              tags: ["featured"]
            },
            {
              id: "backup-original",
              title: "Backup original article",
              url: "about:blank",
              summary: "This one should replace the short original.",
              tags: ["featured"]
            }
          ]
        }),
        enabled: true
      }],
      candidateCount: 2
    });

    const events = await store.readEvents("run-skip-short-original");

    assert.equal(result.status, "partial");
    assert.equal(result.candidateReviews?.length, 2);
    assert.equal(result.candidateReviews?.[0]?.title, "Good original article");
    assert.equal(result.candidateReviews?.[1]?.title, "Backup original article");
    assert.equal(result.errors.some((error) => /short-original/.test(error.stage) || /正文太短/.test(error.message)), true);
    assert.ok(events.some((event) => event.stage === "screen_item_skipped" && event.status === "skipped" && event.score === 0 && /正文太短/.test(String(event.reason))));
    assert.equal(result.reviewQueue?.some((item) => item.category === "original-text" && item.sourceItemId === "short-original"), false);
    assert.equal(result.reviewQueue?.some((item) => item.category === "pipeline" && item.id.includes(":pipeline:select:")), false);
    assert.ok(events.some((event) => event.stage === "summarize" && event.status === "finished"));
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
    const draftEvents = await store.readEvents(screened.runId);
    assert.ok(draftEvents.some((event) => event.stage === "draft_generation" && event.status === "started"));
    assert.ok(draftEvents.some((event) => event.stage === "compose_media" && event.status === "finished" && event.processedCount === 3));

    const published = await pipeline.publishDrafts({
      runId: screened.runId,
      requestedPlatforms: ["wechat", "xhs"],
      allowRealDraft: false
    });
    const events = await store.readEvents(screened.runId);

    assert.ok(published.publishResults.some((result) => result.platform === "wechat" && result.status === "queued"));
    assert.ok(published.publishResults.some((result) => result.platform === "xhs" && result.status === "queued"));
    assert.equal(published.reviewQueue?.some((item) => item.category === "publisher"), false);
    assert.ok(events.some((event) => event.stage === "platform_publish" && event.status === "finished"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
