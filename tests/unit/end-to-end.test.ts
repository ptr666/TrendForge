import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDefaultPipeline } from "../../packages/core/src/pipeline.js";
import { createRunStore } from "../../packages/storage/src/run-store.js";

const rss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>AI agents reshape product research</title>
      <link>https://example.com/ai-agents-research</link>
      <description><![CDATA[<p>AI agents are being used to collect signals, compare products, and draft research notes.</p>]]></description>
      <pubDate>Sat, 06 Jun 2026 00:00:00 GMT</pubDate>
      <guid>ai-agents-research</guid>
    </item>
  </channel>
</rss>`;

test("RSS pipeline run can be read back with end-to-end draft evidence", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-e2e-"));
  const store = createRunStore({ rootDir });
  const pipeline = createDefaultPipeline({ store });

  try {
    const result = await pipeline.run({
      runId: "run-rss-e2e",
      query: rss,
      requestedPlatforms: ["review", "wechat", "xhs"],
      topN: 1
    });

    const savedRun = await store.readRun("run-rss-e2e");
    const events = await store.readEvents("run-rss-e2e");
    const runs = await store.listRuns();

    assert.equal(result.status, "success");
    assert.equal(savedRun?.runId, "run-rss-e2e");
    assert.equal(runs[0]?.runId, "run-rss-e2e");

    assert.equal(savedRun?.sourceItems[0]?.collectorAdapter, "rsshub");
    assert.equal(savedRun?.sourceItems[0]?.sourceType, "rss");
    assert.equal(savedRun?.verifiedArticles[0]?.status, "partial");
    assert.equal(savedRun?.selections.length, 1);
    assert.equal(savedRun?.summaries.length, 1);
    assert.deepEqual(savedRun?.drafts.map((draft) => draft.platform).sort(), ["review", "wechat", "xhs"]);
    assert.ok(savedRun?.assets.some((asset) => asset.type === "cover" && asset.ratio === "16:9"));
    assert.ok(savedRun?.assets.some((asset) => asset.type === "xhs_image" && asset.ratio === "3:4"));
    assert.ok(savedRun?.publishResults.some((publishResult) => publishResult.platform === "wechat" && publishResult.status === "queued"));
    assert.ok(savedRun?.publishResults.some((publishResult) => publishResult.platform === "xhs" && publishResult.status === "queued"));

    assert.ok(events.some((event) => event.stage === "collect" && event.adapter === "rsshub" && event.status === "finished"));
    assert.ok(events.some((event) => event.stage === "score"));
    assert.ok(events.some((event) => event.stage === "fetch_full_text" && event.adapter === "browseract" && event.status === "planned"));
    assert.ok(events.some((event) => event.stage === "summarize"));
    assert.ok(events.some((event) => event.stage === "generate" && event.count === 3));
    assert.ok(events.some((event) => event.stage === "compose_media"));
    assert.ok(events.some((event) => event.stage === "publish" && event.platform === "wechat" && event.status === "queued"));
    assert.ok(events.some((event) => event.stage === "publish" && event.platform === "xhs" && event.status === "queued"));
    assert.ok(events.some((event) => event.stage === "finished" && event.status === "success"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
