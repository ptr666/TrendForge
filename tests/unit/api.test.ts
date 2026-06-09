import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

test("API serves registered run asset files and regenerates one asset", async () => {
  const runsDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-api-asset-runs-"));
  const configDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-api-asset-config-"));
  const port = 4900 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [apiPath], {
    env: { ...process.env, TRENDFORGE_PORT: String(port), TRENDFORGE_RUNS_DIR: runsDir, TRENDFORGE_CONFIG_DIR: configDir },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForHealth(baseUrl);
    const runId = "asset-api-run";
    const assetDir = path.join(runsDir, runId, "assets");
    const assetPath = path.join(assetDir, "asset.png");
    await mkdir(assetDir, { recursive: true });
    await writeFile(assetPath, Buffer.from("asset-bytes"));
    await writeFile(path.join(runsDir, `${runId}.json`), JSON.stringify({
      runId,
      status: "success",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      sourceItems: [],
      verifiedArticles: [],
      selections: [],
      summaries: [],
      candidateReviews: [],
      drafts: [{
        id: "wechat-source",
        sourceItemId: "source",
        platform: "wechat",
        title: "Asset draft",
        body: "Draft body",
        assetIds: ["tf-asset-api-run-source-wechat-cover-1-r1"]
      }],
      assets: [{
        id: "tf-asset-api-run-source-wechat-cover-1-r1",
        draftId: "wechat-source",
        platform: "wechat",
        type: "cover",
        source: "generated",
        status: "ready",
        revision: 1,
        path: assetPath
      }],
      publishResults: [],
      errors: []
    }, null, 2), "utf8");

    const assetId = "tf-asset-api-run-source-wechat-cover-1-r1";
    const fileResponse = await fetch(`${baseUrl}/runs/${encodeURIComponent(runId)}/assets/${encodeURIComponent(assetId)}/file`);
    assert.equal(fileResponse.ok, true);
    assert.equal(fileResponse.headers.get("content-type"), "image/png");
    assert.equal(Buffer.from(await fileResponse.arrayBuffer()).toString("utf8"), "asset-bytes");

    const versionedFileResponse = await fetch(`${baseUrl}/runs/${encodeURIComponent(runId)}/assets/${encodeURIComponent(assetId)}/file?rev=1`);
    assert.equal(versionedFileResponse.ok, true);
    assert.equal(versionedFileResponse.headers.get("content-type"), "image/png");
    assert.equal(Buffer.from(await versionedFileResponse.arrayBuffer()).toString("utf8"), "asset-bytes");

    const regenerated = await requestJson(`${baseUrl}/runs/${encodeURIComponent(runId)}/assets/${encodeURIComponent(assetId)}/regenerate`, {
      method: "POST"
    }) as { assets?: Array<{ id: string; revision?: number; status?: string; path?: string }> };
    const asset = regenerated.assets?.find((candidate) => candidate.id === assetId);
    assert.equal(asset?.revision, 2);
    assert.equal(asset?.status, "planned");
    assert.equal(asset?.path, undefined);
  } finally {
    child.kill();
    await rm(runsDir, { recursive: true, force: true });
    await rm(configDir, { recursive: true, force: true });
  }
});

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
      assets?: Array<{ id: string; status?: string }>;
      publishResults?: Array<{ platform: string; status: string; artifactPath?: string }>;
    };
    assert.deepEqual(run.assets, []);
    const runs = await requestJson(`${baseUrl}/runs`) as { runs?: Array<{ runId: string }> };
    const savedRun = await requestJson(`${baseUrl}/runs/api-rss-e2e`) as { runId?: string };
    const events = await requestJson(`${baseUrl}/runs/api-rss-e2e/events`) as { events?: Array<Record<string, unknown>> };
    const items = await requestJson(`${baseUrl}/items`) as { items?: Array<{ collectorAdapter: string }> };
    const drafts = await requestJson(`${baseUrl}/drafts`) as { drafts?: Array<{ platform: string }> };
    const reviewQueue = await requestJson(`${baseUrl}/review-queue`) as { queue?: Array<{ category: string; status: string; platform?: string }> };
    const providers = await requestJson(`${baseUrl}/providers`) as { text?: { keyConfigured: boolean; keyPreview?: string }; imageModel?: { enabled: boolean; keyConfigured: boolean } };
    const savedModel = await requestJson(`${baseUrl}/config/model`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        provider: "openai-compatible",
        baseUrl: "http://127.0.0.1:1/v1",
        model: "summary-model",
        apiKey: "fixture-model-key"
      })
    }) as { keyConfigured?: boolean; keyPreview?: string; apiKey?: string };
    const savedImageModel = await requestJson(`${baseUrl}/config/image-model`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        provider: "openai-compatible",
        baseUrl: "http://127.0.0.1:1/v1",
        model: "image-model",
        apiKey: "fixture-image-key"
      })
    }) as { enabled?: boolean; keyConfigured?: boolean; keyPreview?: string; apiKey?: string };
    const modelVerification = await requestJson(`${baseUrl}/verify/model`, {
      method: "POST",
      headers: { "content-type": "application/json" }
    }) as { ok?: boolean; failureReason?: string };
    const health = await requestJson(`${baseUrl}/health`) as { runsDir?: string };
    const savedWechat = await requestJson(`${baseUrl}/config/wechat`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        appId: "wx-test-app",
        appSecret: "fixture-wechat-key",
        coverMediaId: "cover-media-id",
        legacyCredentialSource: "scripts/wechat-credentials.js"
      })
    }) as { secretConfigured?: boolean; secretPreview?: string; appSecret?: string; coverMediaId?: string; legacyCredentialSource?: string };
    const savedXhs = await requestJson(`${baseUrl}/config/xhs`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        projectDir: "vendor/xiaohongshu-skills",
        bridgeUrl: "ws://localhost:9343"
      })
    }) as { enabled?: boolean; projectDir?: string; bridgeUrl?: string };
    await requestJson(`${baseUrl}/subscriptions`) as { subscriptions?: Array<{ id: string }> };
    const savedSubscriptions = await requestJson(`${baseUrl}/subscriptions`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subscriptions: [
          {
            id: "screen-rss",
            title: "Screen RSS",
            type: "rss",
            source: rss,
            enabled: true
          }
        ]
      })
    }) as { subscriptions?: Array<{ id: string }> };
    const emptySubscriptions = await requestJson(`${baseUrl}/subscriptions`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscriptions: [] })
    }) as { subscriptions?: Array<{ id: string }> };
    const readEmptySubscriptions = await requestJson(`${baseUrl}/subscriptions`) as { subscriptions?: Array<{ id: string }> };
    const upsertedSubscription = await requestJson(`${baseUrl}/subscriptions/upsert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "rss",
        source: rss,
        titleOverride: "Screen RSS",
        enabled: true
      })
    }) as { ok?: boolean; subscription?: { id: string; title: string }; health?: { status: string; itemCount: number }; subscriptions?: Array<{ id: string }> };
    const failedUpsert = await requestJson(`${baseUrl}/subscriptions/upsert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        existingId: "broken-rss",
        type: "rss",
        source: "https://127.0.0.1:1/not-found.xml",
        titleOverride: "Broken RSS",
        enabled: true
      })
    }) as { ok?: boolean; health?: { status: string; errorCategory: string }; subscriptions?: Array<{ id: string }> };
    const deletedSubscription = await requestJson(`${baseUrl}/subscriptions/broken-rss`, {
      method: "DELETE",
      headers: { "content-type": "application/json" }
    }) as { ok?: boolean; subscriptions?: Array<{ id: string }> };
    await requestJson(`${baseUrl}/config/model`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: false,
        provider: "deterministic",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-flash"
      })
    });
    await requestJson(`${baseUrl}/config/image-model`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: false,
        provider: "none",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-image-1"
      })
    });
    const screenRun = await requestJson(`${baseUrl}/pipeline/screen`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: "api-screen-flow",
        sourceIds: [upsertedSubscription.subscription?.id, "aihot-default"].filter(Boolean),
        candidateCount: 2
      })
    }) as { runId?: string; candidateReviews?: Array<{ sourceItemId: string; score: number; summary?: { summary?: string } }>; drafts?: unknown[] };
    const draftRun = await requestJson(`${baseUrl}/pipeline/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: "api-screen-flow",
        sourceItemIds: screenRun.candidateReviews?.slice(0, 1).map((candidate) => candidate.sourceItemId),
        requestedPlatforms: ["review", "wechat", "xhs"],
        allowRealDraft: false
      })
    }) as { drafts?: Array<{ platform: string }>; candidateReviews?: Array<{ sourceItemId: string }>; publishResults?: Array<{ status: string }> };
    const publishRun = await requestJson(`${baseUrl}/pipeline/publish-drafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: "api-screen-flow",
        requestedPlatforms: ["wechat", "xhs"],
        allowRealDraft: false
      })
    }) as { publishResults?: Array<{ platform: string; status: string; artifactPath?: string }> };
    const sources = await requestJson(`${baseUrl}/sources`) as { fixedSources?: { aihot?: { id: string } }; subscriptions?: Array<{ id: string; type: string }>; health?: Array<{ id: string; status: string; itemCount: number }> };
    const sourceHealth = await requestJson(`${baseUrl}/sources/health`) as { health?: Array<{ id: string; status: string }> };
    const publishers = await requestJson(`${baseUrl}/publishers`) as { publishers?: Array<{ platform: string; ok: boolean; gate?: { status: string; message: string } }> };
    const rssValidation = await requestJson(`${baseUrl}/subscriptions/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "api-rss", title: "API RSS", type: "rss", source: rss })
    }) as { ok?: boolean; count?: number; health?: { status: string; errorCategory: string } };
    const mediaCrawler = await requestJson(`${baseUrl}/verify/mediacrawler`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true })
    }) as { enabled?: boolean; hasMain?: boolean; hasPyproject?: boolean };
    const xhsVerification = await requestJson(`${baseUrl}/verify/xhs`, {
      method: "POST",
      headers: { "content-type": "application/json" }
    }) as { ok?: boolean; status?: string; projectDir?: string };
    const firstDraftArtifact = run.drafts?.find((draft) => draft.artifactPath)?.artifactPath;
    const firstDraftArtifactContent = firstDraftArtifact ? await readFile(firstDraftArtifact, "utf8") : "";
    const artifact = firstDraftArtifact
      ? await requestJson(`${baseUrl}/artifacts?path=${encodeURIComponent(firstDraftArtifact)}`) as { content?: string }
      : { content: "" };
    const deletedRun = await requestJson(`${baseUrl}/runs/api-rss-e2e`, {
      method: "DELETE",
      headers: { "content-type": "application/json" }
    }) as { ok?: boolean; runId?: string };
    const runsAfterDelete = await requestJson(`${baseUrl}/runs`) as { runs?: Array<{ runId: string }> };
    const clearedRuns = await requestJson(`${baseUrl}/runs`, {
      method: "DELETE",
      headers: { "content-type": "application/json" }
    }) as { ok?: boolean; deleted?: number };
    const runsAfterClear = await requestJson(`${baseUrl}/runs`) as { runs?: Array<{ runId: string }> };

    assert.equal(run.runId, "api-rss-e2e");
    assert.equal(reviewQueue.queue?.some((item) => item.category === "asset"), false);
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
    assert.equal(reviewQueue.queue?.some((item) => item.category === "summary"), false);
    assert.equal(reviewQueue.queue?.some((item) => item.category === "draft"), false);
    assert.equal(reviewQueue.queue?.some((item) => item.category === "publisher"), false);
    assert.ok(run.drafts?.every((draft) => typeof draft.artifactPath === "string"));
    assert.ok(firstDraftArtifact);
    assert.match(firstDraftArtifactContent, /platform:/);
    assert.match(artifact.content ?? "", /platform:/);
    assert.equal(health.runsDir, path.resolve(runsDir));
    assert.equal(typeof (runs as { runsDir?: string }).runsDir, "string");
    assert.ok(events.events?.some((event) => event.stage === "fetch_full_text" && event.adapter === "http"));
    assert.ok(events.events?.some((event) => event.stage === "finished" && event.status === "success"));
    assert.equal(providers.text?.keyConfigured, false);
    assert.equal(providers.imageModel?.enabled, false);
    assert.equal(providers.imageModel?.keyConfigured, false);
    assert.equal(savedModel.keyConfigured, true);
    assert.match(savedModel.keyPreview ?? "", /^\*+-key$/);
    assert.equal(savedModel.apiKey, undefined);
    assert.equal(savedImageModel.enabled, true);
    assert.equal(savedImageModel.keyConfigured, true);
    assert.match(savedImageModel.keyPreview ?? "", /^\*+-key$/);
    assert.equal(savedImageModel.apiKey, undefined);
    assert.equal(modelVerification.ok, false);
    assert.match(modelVerification.failureReason ?? "", /fetch failed|ECONNREFUSED|Text provider failed/i);
    assert.equal(savedWechat.secretConfigured, true);
    assert.match(savedWechat.secretPreview ?? "", /^\*+-key$/);
    assert.equal(savedWechat.appSecret, undefined);
    assert.equal(savedWechat.coverMediaId, "cover-media-id");
    assert.equal(savedWechat.legacyCredentialSource, "scripts/wechat-credentials.js");
    assert.equal(savedXhs.enabled, true);
    assert.equal(savedXhs.bridgeUrl, "ws://localhost:9343");
    assert.ok(savedSubscriptions.subscriptions?.some((subscription) => subscription.id === "screen-rss"));
    assert.equal(emptySubscriptions.subscriptions?.length, 0);
    assert.equal(readEmptySubscriptions.subscriptions?.length, 0);
    assert.equal(upsertedSubscription.ok, true);
    assert.match(upsertedSubscription.subscription?.id ?? "", /^rss-/);
    assert.equal(upsertedSubscription.subscription?.title, "Screen RSS");
    assert.equal(upsertedSubscription.health?.status, "healthy");
    assert.equal(upsertedSubscription.health?.itemCount, 2);
    assert.equal(failedUpsert.ok, true);
    assert.equal(failedUpsert.health?.status, "failed");
    assert.ok(failedUpsert.subscriptions?.some((subscription) => subscription.id === "broken-rss"));
    assert.equal(deletedSubscription.ok, true);
    assert.equal(deletedSubscription.subscriptions?.some((subscription) => subscription.id === "broken-rss"), false);
    assert.equal(screenRun.runId, "api-screen-flow");
    assert.ok((screenRun.candidateReviews?.length ?? 0) >= 1);
    assert.equal(screenRun.drafts?.length, 0);
    assert.ok(screenRun.candidateReviews?.every((candidate) => typeof candidate.score === "number" && candidate.summary?.summary));
    assert.ok((draftRun.candidateReviews?.length ?? 0) >= 1);
    assert.deepEqual(draftRun.drafts?.map((draft) => draft.platform).sort(), ["review", "wechat", "xhs"]);
    assert.equal(draftRun.publishResults?.length, 0);
    assert.ok(publishRun.publishResults?.some((publishResult) => publishResult.platform === "wechat" && publishResult.status === "queued" && typeof publishResult.artifactPath === "string"));
    assert.ok(publishRun.publishResults?.some((publishResult) => publishResult.platform === "xhs" && publishResult.status === "queued" && typeof publishResult.artifactPath === "string"));
    assert.ok(sources.health?.some((health) => health.id === upsertedSubscription.subscription?.id));
    assert.equal(sources.fixedSources?.aihot?.id, "aihot-default");
    assert.equal(sources.subscriptions?.some((subscription) => subscription.type === "aihot"), false);
    assert.equal(sourceHealth.health?.some((health) => health.id === "aihot-default"), false);
    assert.ok(publishers.publishers?.some((publisher) => publisher.platform === "wechat" && publisher.ok === false && publisher.gate?.status === "blocked"));
    assert.ok(publishers.publishers?.some((publisher) => publisher.platform === "xhs" && publisher.ok === false && publisher.gate?.status === "blocked"));
    assert.equal(rssValidation.ok, true);
    assert.equal(rssValidation.count, 2);
    assert.equal(rssValidation.health?.status, "healthy");
    assert.equal(rssValidation.health?.errorCategory, "none");
    assert.equal(mediaCrawler.enabled, true);
    assert.equal(mediaCrawler.hasMain, true);
    assert.equal(mediaCrawler.hasPyproject, true);
    assert.equal(xhsVerification.status, "blocked");
    assert.match(xhsVerification.projectDir ?? "", /xiaohongshu-skills/);
    assert.equal(deletedRun.ok, true);
    assert.equal(deletedRun.runId, "api-rss-e2e");
    assert.equal(runsAfterDelete.runs?.some((entry) => entry.runId === "api-rss-e2e"), false);
    assert.equal(clearedRuns.ok, true);
    assert.ok((clearedRuns.deleted ?? 0) >= 1);
    assert.equal(runsAfterClear.runs?.length, 0);
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    await rm(runsDir, { recursive: true, force: true });
    await rm(configDir, { recursive: true, force: true });
  }
});
