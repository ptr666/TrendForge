import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
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
  const port = 4900 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [apiPath], {
    env: { ...process.env, TRENDFORGE_PORT: String(port), TRENDFORGE_RUNS_DIR: runsDir },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForHealth(baseUrl);

    const run = await requestJson(`${baseUrl}/pipeline/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: "api-rss-e2e",
        query: rss,
        requestedPlatforms: ["review", "wechat", "xhs"]
      })
    }) as {
      runId?: string;
      drafts?: Array<{ platform: string }>;
      publishResults?: Array<{ platform: string; status: string }>;
    };
    const runs = await requestJson(`${baseUrl}/runs`) as { runs?: Array<{ runId: string }> };
    const savedRun = await requestJson(`${baseUrl}/runs/api-rss-e2e`) as { runId?: string };
    const events = await requestJson(`${baseUrl}/runs/api-rss-e2e/events`) as { events?: Array<Record<string, unknown>> };
    const items = await requestJson(`${baseUrl}/items`) as { items?: Array<{ collectorAdapter: string }> };
    const drafts = await requestJson(`${baseUrl}/drafts`) as { drafts?: Array<{ platform: string }> };

    assert.equal(run.runId, "api-rss-e2e");
    assert.equal(savedRun.runId, "api-rss-e2e");
    assert.equal(runs.runs?.[0]?.runId, "api-rss-e2e");
    assert.deepEqual(run.drafts?.map((draft) => draft.platform).sort(), ["review", "wechat", "xhs"]);
    assert.ok(run.publishResults?.some((publishResult) => publishResult.platform === "wechat" && publishResult.status === "queued"));
    assert.ok(run.publishResults?.some((publishResult) => publishResult.platform === "xhs" && publishResult.status === "queued"));
    assert.equal(items.items?.[0]?.collectorAdapter, "rsshub");
    assert.deepEqual(drafts.drafts?.map((draft) => draft.platform).sort(), ["review", "wechat", "xhs"]);
    assert.ok(events.events?.some((event) => event.stage === "fetch_full_text" && event.adapter === "browseract"));
    assert.ok(events.events?.some((event) => event.stage === "finished" && event.status === "success"));
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    await rm(runsDir, { recursive: true, force: true });
  }
});
