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
  assert.ok(result.assets.some((asset) => asset.type === "cover"));
  assert.ok(result.assets.some((asset) => asset.type === "xhs_image"));
  assert.ok(result.assets.every((asset) => typeof asset.prompt === "string" && asset.prompt.length > 0));
  assert.ok(result.publishResults.every((publishResult) => publishResult.status === "skipped"));

  const events = await store.readEvents("run-aihot");
  assert.ok(events.some((event) => event.stage === "summarize"));
  assert.ok(events.some((event) => event.stage === "finished"));

  await rm(rootDir, { recursive: true, force: true });
});
