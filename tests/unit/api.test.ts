import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const apiPath = path.resolve("dist", "apps", "api", "src", "server.js");
const rss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>AI workflow from API</title>
      <link>https://example.com/api-ai-workflow</link>
      <description>Brief signal from an API RSS run.</description>
      <guid>api-ai-workflow</guid>
    </item>
    <item>
      <title>Second AI workflow from API</title>
      <link>https://example.com/api-ai-workflow-2</link>
      <description>Second brief signal from an API RSS run.</description>
      <guid>api-ai-workflow-2</guid>
    </item>
  </channel>
</rss>`;

async function requestJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  assert.equal(response.ok, true, `${init?.method ?? "GET"} ${url} returned ${response.status}`);
  return response.json() as Promise<unknown>;
}

async function waitForHealth(baseUrl: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    try {
      await requestJson(`${baseUrl}/health`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error("API did not become healthy.");
}

test("API can run RSS pipeline and read back run history artifacts", async () => {
  const runsDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-api-runs-"));
  const configDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-api-config-"));
  const port = 4900 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [apiPath], {
    env: { ...process.env, TRENDFORGE_PORT: String(port), TRENDFORGE_RUNS_DIR: runsDir, TRENDFORGE_CONFIG_DIR: configDir },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForHealth(baseUrl);
    const options = await fetch(`${baseUrl}/health`, {
      method: "OPTIONS",
      headers: { origin: "http://127.0.0.1:5173" }
    });
    assert.equal(options.status, 204);
    assert.equal(options.headers.get("access-control-allow-origin"), "http://127.0.0.1:5173");

    const run = await requestJson(`${baseUrl}/pipeline/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: "api-rss-e2e",
        query: rss,
        requestedPlatforms: ["review", "wechat", "xhs"],
        topN: 1
      })
    }) as {
      runId?: string;
      drafts?: Array<{ platform: string; artifactPath?: string }>;
      publishResults?: Array<{ platform: string; status: string; artifactPath?: string }>;
    };
    const runs = await requestJson(`${baseUrl}/runs`) as { runs?: Array<{ runId: string }> };
    const savedRun = await requestJson(`${baseUrl}/runs/api-rss-e2e`) as { runId?: string };
    const events = await requestJson(`${baseUrl}/runs/api-rss-e2e/events`) as { events?: Array<Record<string, unknown>> };
    const items = await requestJson(`${baseUrl}/items`) as { items?: Array<{ collectorAdapter: string }> };
    const drafts = await requestJson(`${baseUrl}/drafts`) as { drafts?: Array<{ platform: string }> };
    const providers = await requestJson(`${baseUrl}/providers`) as { text?: { keyConfigured: boolean; keyPreview?: string } };
    const savedModel = await requestJson(`${baseUrl}/config/model`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        provider: "openai-compatible",
        baseUrl: "https://models.example.test/v1",
        model: "summary-model",
        apiKey: "fixture-model-key"
      })
    }) as { keyConfigured?: boolean; keyPreview?: string; apiKey?: string };
    const savedWechat = await requestJson(`${baseUrl}/config/wechat`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        appId: "wx-test-app",
        appSecret: "fixture-wechat-key"
      })
    }) as { secretConfigured?: boolean; secretPreview?: string; appSecret?: string };
    const subscriptions = await requestJson(`${baseUrl}/subscriptions`) as { subscriptions?: Array<{ id: string }> };
    const rssValidation = await requestJson(`${baseUrl}/subscriptions/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: rss })
    }) as { ok?: boolean; count?: number };
    const mediaCrawler = await requestJson(`${baseUrl}/verify/mediacrawler`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true })
    }) as { enabled?: boolean; hasMain?: boolean; hasPyproject?: boolean };

    assert.equal(run.runId, "api-rss-e2e");
    assert.equal(savedRun.runId, "api-rss-e2e");
    assert.equal(runs.runs?.[0]?.runId, "api-rss-e2e");
    assert.equal(run.drafts?.length, 3);
    assert.deepEqual(run.drafts?.map((draft) => draft.platform).sort(), ["review", "wechat", "xhs"]);
    assert.ok(run.publishResults?.some((publishResult) => publishResult.platform === "wechat" && publishResult.status === "queued"));
    assert.ok(run.publishResults?.some((publishResult) => publishResult.platform === "xhs" && publishResult.status === "queued"));
    assert.ok(run.publishResults?.some((publishResult) => publishResult.platform === "wechat" && typeof publishResult.artifactPath === "string"));
    assert.ok(run.publishResults?.some((publishResult) => publishResult.platform === "xhs" && typeof publishResult.artifactPath === "string"));
    assert.equal(items.items?.[0]?.collectorAdapter, "rsshub");
    assert.deepEqual(drafts.drafts?.map((draft) => draft.platform).sort(), ["review", "wechat", "xhs"]);
    assert.ok(run.drafts?.every((draft) => typeof draft.artifactPath === "string"));
    const firstDraftArtifact = run.drafts?.find((draft) => draft.artifactPath)?.artifactPath;
    assert.ok(firstDraftArtifact);
    assert.match(await readFile(firstDraftArtifact, "utf8"), /platform:/);
    const artifact = await requestJson(`${baseUrl}/artifacts?path=${encodeURIComponent(firstDraftArtifact)}`) as { content?: string };
    assert.match(artifact.content ?? "", /platform:/);
    assert.ok(events.events?.some((event) => event.stage === "fetch_full_text" && event.adapter === "browseract" && typeof event.artifactPath === "string"));
    assert.ok(events.events?.some((event) => event.stage === "finished" && event.status === "success"));
    assert.equal(providers.text?.keyConfigured, false);
    assert.equal(savedModel.keyConfigured, true);
    assert.match(savedModel.keyPreview ?? "", /^\*+-key$/);
    assert.equal(savedModel.apiKey, undefined);
    assert.equal(savedWechat.secretConfigured, true);
    assert.match(savedWechat.secretPreview ?? "", /^\*+-key$/);
    assert.equal(savedWechat.appSecret, undefined);
    assert.ok(subscriptions.subscriptions?.some((subscription) => subscription.id === "aihot-skill"));
    assert.equal(rssValidation.ok, true);
    assert.equal(rssValidation.count, 2);
    assert.equal(mediaCrawler.enabled, true);
    assert.equal(mediaCrawler.hasMain, true);
    assert.equal(mediaCrawler.hasPyproject, true);
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    await rm(runsDir, { recursive: true, force: true });
    await rm(configDir, { recursive: true, force: true });
  }
});
