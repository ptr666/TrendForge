import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDefaultPipeline } from "../../packages/core/src/pipeline.js";
import { createRunStore } from "../../packages/storage/src/run-store.js";

test("pipeline runs from AI HOT source to platform draft plans and events", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-pipeline-"));
  const store = createRunStore({ rootDir });
  const pipeline = createDefaultPipeline({ store });

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
  assert.ok(result.drafts.some((draft) => draft.platform === "wechat" && draft.body.includes("## 为什么值得关注")));
  assert.ok(result.drafts.some((draft) => draft.platform === "xhs" && draft.body.includes("#AI热点")));
  assert.ok(result.assets.some((asset) => asset.type === "cover"));
  assert.ok(result.assets.some((asset) => asset.type === "xhs_image"));
  assert.ok(result.assets.every((asset) => typeof asset.prompt === "string" && asset.prompt.length > 0));
  assert.ok(result.assets.some((asset) => asset.type === "cover" && asset.ratio === "16:9" && asset.status === "needs-approval"));
  assert.ok(result.assets.some((asset) => asset.type === "xhs_image" && asset.ratio === "3:4" && asset.status === "needs-approval"));
  assert.ok(result.publishResults.every((publishResult) => publishResult.status === "queued"));
  assert.ok(result.reviewQueue?.some((item) => item.category === "summary" && item.status === "needs-review"));
  assert.ok(result.reviewQueue?.some((item) => item.category === "draft" && item.platform === "wechat"));
  assert.ok(result.reviewQueue?.some((item) => item.category === "asset" && item.platform === "wechat" && item.status === "needs-review"));
  assert.ok(result.reviewQueue?.some((item) => item.category === "asset" && item.platform === "xhs" && item.status === "needs-review"));
  assert.ok(result.reviewQueue?.some((item) => item.category === "publisher" && item.platform === "xhs" && item.status === "waiting"));
  assert.ok(result.publishResults.some((publishResult) => publishResult.platform === "wechat" && publishResult.verificationSignal?.includes("state/published.json")));
  assert.ok(result.publishResults.some((publishResult) => publishResult.platform === "xhs" && publishResult.verificationSignal?.includes("draft-saved")));

  const events = await store.readEvents("run-aihot");
  assert.ok(events.some((event) => event.stage === "summarize"));
  assert.ok(events.some((event) => event.stage === "publish" && event.platform === "wechat" && event.status === "queued"));
  assert.ok(events.some((event) => event.stage === "publish" && event.platform === "xhs" && event.status === "queued"));
  assert.ok(events.some((event) => event.stage === "finished"));

  await rm(rootDir, { recursive: true, force: true });
});

test("pipeline plans BrowserAct full-text acquisition for selected HTTP source items", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-browseract-plan-"));
  const store = createRunStore({ rootDir });
  const pipeline = createDefaultPipeline({ store });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("HTTP fetch should not be used for original-text acquisition.");
  }) as typeof fetch;

  try {
    const result = await pipeline.run({
      runId: "run-browseract-plan",
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

    const events = await store.readEvents("run-browseract-plan");
    const browserActPlan = events.find((event) => event.stage === "fetch_full_text" && event.adapter === "browseract");

    assert.equal(result.status, "success");
    assert.equal(result.verifiedArticles[0]?.status, "partial");
    assert.equal(result.verifiedArticles[0]?.method, "aihot");
    assert.ok(browserActPlan);
    assert.equal(browserActPlan?.status, "planned");
    assert.equal(browserActPlan?.sourceItemId, result.sourceItems[0]?.id);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("pipeline tries the next scored candidate when BrowserAct cannot fetch the first original article", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-browseract-next-candidate-"));
  const store = createRunStore({ rootDir });
  const pipeline = createDefaultPipeline({
    store,
    fullTextProvider: {
      async acquire(item, article) {
        if (item.url.includes("blocked")) {
          return {
            ...article,
            status: "failed",
            method: "browseract",
            evidenceUrl: item.url,
            fullText: undefined,
            failureReason: "BrowserAct extraction failed: blocked by site."
          };
        }
        return {
          ...article,
          status: "verified",
          method: "browseract",
          evidenceUrl: item.url,
          fullText: "这是 BrowserAct 获取到的完整中文原文。它包含足够的信息用于后续中文总结和平台成稿。"
        };
      }
    },
    selector: {
      async score(article) {
        return {
          sourceItemId: article.sourceItemId,
          score: article.evidenceUrl?.includes("blocked") ? 100 : 90,
          reason: article.evidenceUrl?.includes("blocked")
            ? "AI 选择：第一候选分数最高。"
            : "AI 选择：备用候选也适合发布。",
          targetPlatforms: ["review", "wechat", "xhs"],
          angle: "用中文解释 AI 热点的实际影响。",
          tags: ["aihot"]
        };
      },
      selectTopN(selections, limit) {
        return [...selections].sort((a, b) => b.score - a.score).slice(0, limit);
      }
    }
  });

  try {
    const result = await pipeline.run({
      runId: "run-browseract-next-candidate",
      query: JSON.stringify({
        items: [{
          id: "blocked",
          title: "高分但无法访问的 AIHot 信号",
          url: "https://example.com/blocked",
          summary: "这个候选会被 AI 先选中，但原文获取失败。"
        }, {
          id: "accessible",
          title: "可访问的 AIHot 信号",
          url: "https://example.com/accessible",
          summary: "这个候选原文可以成功获取。"
        }]
      }),
      requestedPlatforms: ["review", "wechat", "xhs"],
      topN: 1
    });

    const selectedDraft = result.drafts[0];
    const selectedItem = result.sourceItems.find((item) => item.id === selectedDraft?.sourceItemId);
    const events = await store.readEvents("run-browseract-next-candidate");

    assert.equal(result.status, "success");
    assert.equal(result.selections.length, 1);
    assert.equal(result.verifiedArticles.find((article) => article.evidenceUrl?.includes("blocked"))?.status, "failed");
    assert.equal(selectedItem?.title, "可访问的 AIHot 信号");
    assert.ok(result.summaries[0]?.summary.includes("这是 BrowserAct 获取到的完整中文原文"));
    assert.ok(result.reviewQueue?.some((item) => item.category === "original-text" && item.status === "blocked"));
    assert.ok(result.reviewQueue?.some((item) => item.category === "summary" && item.status === "needs-review"));
    assert.ok(result.drafts.some((draft) => draft.platform === "review" && draft.body.includes("### 原文摘录")));
    assert.ok(result.drafts.some((draft) => draft.platform === "wechat" && draft.body.includes("## 为什么值得关注")));
    assert.ok(result.drafts.some((draft) => draft.platform === "xhs" && draft.body.includes("#AI热点")));
    assert.ok(events.some((event) => event.stage === "select" && event.status === "skipped" && String(event.reason).includes("BrowserAct extraction failed")));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("pipeline can use injected AI selector scores before choosing top items", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-ai-selector-"));
  const store = createRunStore({ rootDir });
  const pipeline = createDefaultPipeline({
    store,
    selector: {
      async score(article) {
        const highPriority = article.fullText?.includes("更适合发布");
        return {
          sourceItemId: article.sourceItemId,
          score: highPriority ? 99 : 10,
          reason: highPriority ? "AI 选择：更适合发布。" : "AI 选择：优先级较低。",
          targetPlatforms: ["review", "wechat", "xhs"],
          angle: "AI 选题角度",
          tags: ["ai-selector"]
        };
      },
      selectTopN(selections, limit) {
        return [...selections].sort((a, b) => b.score - a.score).slice(0, limit);
      }
    }
  });

  try {
    const result = await pipeline.run({
      runId: "run-ai-selector",
      query: JSON.stringify({
        items: [{
          id: "low",
          title: "普通 AI 热点",
          url: "about:blank",
          summary: "普通信号。"
        }, {
          id: "preferred",
          title: "优先 AI 热点",
          url: "about:blank",
          summary: "更适合发布的信号。"
        }]
      }),
      requestedPlatforms: ["review"],
      topN: 1
    });

    const selectedItem = result.sourceItems.find((item) => item.title === "优先 AI 热点");
    assert.equal(result.selections[0]?.sourceItemId, selectedItem?.id);
    assert.equal(result.selections[0]?.reason, "AI 选择：更适合发布。");
    assert.equal(result.drafts[0]?.sourceItemId, selectedItem?.id);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("pipeline does not plan MediaCrawler full-text acquisition unless explicitly enabled", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-mediacrawler-gate-"));
  const store = createRunStore({ rootDir });
  const pipeline = createDefaultPipeline({ store });

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
      allowBrowserFallback: false,
      topN: 1
    });

    const events = await store.readEvents("run-mediacrawler-gate");
    const mediaCrawlerPlan = events.find((event) => event.stage === "fetch_full_text" && event.adapter === "mediacrawler");
    const skippedPlan = events.find((event) => event.stage === "fetch_full_text" && event.status === "skipped");

    assert.equal(mediaCrawlerPlan, undefined);
    assert.ok(skippedPlan);
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
    assert.ok(result.publishResults.some((publishResult) => publishResult.platform === "wechat" && publishResult.message?.includes("health gate")));
    assert.ok(result.publishResults.some((publishResult) => publishResult.platform === "xhs" && publishResult.message?.includes("health gate")));
    assert.ok(events.some((event) => event.stage === "publish" && event.platform === "wechat" && event.status === "failed"));
    assert.ok(events.some((event) => event.stage === "publish" && event.platform === "xhs" && event.status === "failed"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
