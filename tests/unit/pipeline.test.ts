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
  assert.ok(result.publishResults.every((publishResult) => publishResult.status === "queued"));
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
    assert.ok(result.publishResults.some((publishResult) => publishResult.platform === "wechat" && publishResult.message?.includes("health gate")));
    assert.ok(result.publishResults.some((publishResult) => publishResult.platform === "xhs" && publishResult.message?.includes("health gate")));
    assert.ok(events.some((event) => event.stage === "publish" && event.platform === "wechat" && event.status === "failed"));
    assert.ok(events.some((event) => event.stage === "publish" && event.platform === "xhs" && event.status === "failed"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
