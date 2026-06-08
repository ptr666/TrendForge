import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDefaultPipeline } from "../../packages/core/src/pipeline.js";
import { createOpenAICompatibleTextProvider } from "../../packages/providers/src/index.js";
import { createRunStore } from "../../packages/storage/src/run-store.js";
import type { FullTextProvider } from "../../packages/core/src/types.js";

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
  const pipeline = createDefaultPipeline({
    store,
    fullTextProvider: {
      async acquire(item, article) {
        return {
          ...article,
          status: "verified",
          method: "http",
          evidenceUrl: item.url,
          fullText: "HTTP original article text for deterministic end-to-end evidence."
        };
      }
    },
    fullTextHandoffDir: path.join(rootDir, "full-text-handoffs"),
    publisherHandoffDir: path.join(rootDir, "publisher-handoffs")
  });

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
    assert.equal(savedRun?.verifiedArticles[0]?.status, "verified");
    assert.equal(savedRun?.verifiedArticles[0]?.method, "http");
    assert.equal(typeof savedRun?.verifiedArticles[0]?.fullTextArtifactPath, "string");
    assert.equal(savedRun?.selections.length, 1);
    assert.equal(savedRun?.summaries.length, 1);
    assert.deepEqual(savedRun?.drafts.map((draft) => draft.platform).sort(), ["review", "wechat", "xhs"]);
    assert.deepEqual(savedRun?.assets, []);
    assert.ok(savedRun?.publishResults.some((publishResult) => publishResult.platform === "wechat" && publishResult.status === "queued"));
    assert.ok(savedRun?.publishResults.some((publishResult) => publishResult.platform === "xhs" && publishResult.status === "queued"));
    assert.ok(savedRun?.publishResults.some((publishResult) => publishResult.platform === "wechat"
      && publishResult.plannedCommands?.some((command) => command.name === "wechat-create-draft")));
    assert.ok(savedRun?.publishResults.some((publishResult) => publishResult.platform === "xhs"
      && publishResult.plannedCommands?.some((command) => command.name === "xhs-save-draft")));
    const wechatHandoff = savedRun?.publishResults.find((publishResult) => publishResult.platform === "wechat")?.artifactPath;
    const xhsHandoff = savedRun?.publishResults.find((publishResult) => publishResult.platform === "xhs")?.artifactPath;
    assert.ok(wechatHandoff);
    assert.ok(xhsHandoff);
    const wechatContent = JSON.parse(await readFile(wechatHandoff, "utf8")) as Record<string, unknown>;
    const xhsContent = JSON.parse(await readFile(xhsHandoff, "utf8")) as Record<string, unknown>;
    assert.equal(wechatContent.workflow, "wechat-official-account-workflow");
    assert.equal(xhsContent.workflow, "xhs-browser-draft-setup");

    assert.ok(events.some((event) => event.stage === "collect" && event.adapter === "rsshub" && event.status === "finished"));
    assert.ok(events.some((event) => event.stage === "score"));
    assert.ok(events.some((event) => event.stage === "fetch_full_text" && event.adapter === "http" && event.status === "started"));
    assert.ok(events.some((event) => event.stage === "fetch_full_text" && event.adapter === "http" && event.status === "verified" && typeof event.artifactPath === "string"));
    assert.ok(events.some((event) => event.stage === "summarize"));
    assert.ok(events.some((event) => event.stage === "generate" && event.count === 3));
    assert.ok(events.some((event) => event.stage === "compose_media"));
    assert.ok(events.some((event) => event.stage === "publish" && event.platform === "wechat" && event.status === "queued"));
    assert.ok(events.some((event) => event.stage === "publish" && event.platform === "xhs" && event.status === "queued"));
    assert.ok(events.some((event) => event.stage === "publish" && event.platform === "wechat" && Array.isArray(event.plannedCommands)));
    assert.ok(events.some((event) => event.stage === "publish" && event.platform === "xhs" && Array.isArray(event.plannedCommands)));
    assert.ok(events.some((event) => event.stage === "publish" && event.platform === "wechat" && typeof event.artifactPath === "string"));
    assert.ok(events.some((event) => event.stage === "publish" && event.platform === "xhs" && typeof event.artifactPath === "string"));
    assert.ok(events.some((event) => event.stage === "finished" && event.status === "success"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("selected RSS item can use BrowserAct full text before summary and drafts", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-fulltext-"));
  const store = createRunStore({ rootDir });
  const fullTextProvider: FullTextProvider = {
    async acquire(item) {
      return {
        sourceItemId: item.id,
        status: "verified",
        method: "browseract",
        evidenceUrl: item.url,
        fullText: "Complete BrowserAct article text. This contains the product research angle used by downstream drafts."
      };
    }
  };
  const pipeline = createDefaultPipeline({ store, fullTextProvider });

  try {
    const result = await pipeline.run({
      runId: "run-browseract-fulltext",
      query: rss,
      requestedPlatforms: ["review", "wechat", "xhs"],
      topN: 1
    });

    const savedRun = await store.readRun("run-browseract-fulltext");
    const events = await store.readEvents("run-browseract-fulltext");

    assert.equal(result.verifiedArticles[0]?.status, "verified");
    assert.equal(result.verifiedArticles[0]?.method, "browseract");
    assert.equal(typeof result.verifiedArticles[0]?.fullTextArtifactPath, "string");
    const fullTextArtifact = await readFile(result.verifiedArticles[0]?.fullTextArtifactPath as string, "utf8");
    assert.match(fullTextArtifact, /sourceItemId: rsshub-/);
    assert.match(fullTextArtifact, /method: browseract/);
    assert.match(fullTextArtifact, /# AI agents reshape product research/);
    assert.match(fullTextArtifact, /Complete BrowserAct article text/);
    assert.match(savedRun?.summaries[0]?.summary ?? "", /这条 AI 热点信号值得进入人工复核：Complete BrowserAct article text/);
    assert.equal(savedRun?.summaries[0]?.keyPoints.length, 2);
    assert.match(savedRun?.summaries[0]?.keyPoints[0] ?? "", /要点 1：Complete BrowserAct article text/);
    assert.match(savedRun?.summaries[0]?.keyPoints[1] ?? "", /product research angle/);
    assert.ok(savedRun?.drafts.some((draft) => draft.body.includes("Complete BrowserAct article text")));
    assert.ok(events.some((event) => event.stage === "fetch_full_text" && event.adapter === "browseract" && event.status === "verified" && typeof event.artifactPath === "string"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("pipeline can use OpenAI-compatible text provider for summaries and drafts", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-model-provider-"));
  const store = createRunStore({ rootDir });
  const textProvider = createOpenAICompatibleTextProvider({
    baseUrl: "https://models.example.test/v1",
    model: "summary-model",
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            title: "Model generated AI title",
            summary: "Model generated summary.",
            angle: "Model angle",
            keyPoints: ["Model point"],
            riskNotes: []
          })
        }
      }]
    }), { status: 200 })
  });
  const pipeline = createDefaultPipeline({ store, textProvider });

  try {
    const result = await pipeline.run({
      runId: "run-model-provider",
      query: rss,
      requestedPlatforms: ["review", "wechat", "xhs"],
      topN: 1
    });

    assert.equal(result.summaries[0]?.title, "Model generated AI title");
    assert.equal(result.summaries[0]?.summary, "Model generated summary.");
    assert.ok(result.drafts.some((draft) => draft.body.includes("Model generated summary.")));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
