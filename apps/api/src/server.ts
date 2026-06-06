import http from "node:http";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { createDefaultPipeline } from "../../../packages/core/src/pipeline.js";
import { buildReviewQueue } from "../../../packages/core/src/review-queue.js";
import { aiHotDefaults, defaultCollectorOrder, defaultFullTextAcquisitionOrder, mediaCrawlerDefaults } from "../../../packages/config/src/index.js";
import {
  readModelConfig,
  readWechatConfig,
  readXhsConfig,
  toPublicModelConfig,
  toPublicWechatConfig,
  toPublicXhsConfig,
  writeModelConfig,
  writeWechatConfig,
  writeXhsConfig
} from "../../../packages/config/src/local-config.js";
import { checkSourceHealth, checkSourcesHealth, readSubscriptions, writeSubscriptions } from "../../../packages/config/src/subscriptions.js";
import { MediaCrawlerFallbackAdapter, RssHubSourceAdapter } from "../../../packages/sources/src/adapters.js";
import { createPlannedPublishers } from "../../../packages/publishers/src/index.js";
import { checkWechatDraftGate, createWechatOfficialPublisher, requestWechatAccessToken } from "../../../packages/publishers/src/wechat.js";
import { checkXhsDraftGate, createXhsBrowserPublisher } from "../../../packages/publishers/src/xhs.js";
import { createBrowserActFullTextProvider, createOpenAICompatibleTextProvider } from "../../../packages/providers/src/index.js";
import { createRuntimeProviders } from "../../../packages/providers/src/runtime.js";
import { createRunStore } from "../../../packages/storage/src/run-store.js";
import type { CandidateSelection, Platform, SourceItem, VerifiedArticle } from "../../../packages/core/src/types.js";

const port = Number(process.env.TRENDFORGE_PORT ?? 4780);
const store = createRunStore();

async function createRuntimePublishers() {
  const planned = createPlannedPublishers();
  const wechatConfig = await readWechatConfig();
  const xhsConfig = await readXhsConfig();
  return planned.map((publisher) => publisher.platform === "wechat"
    ? createWechatOfficialPublisher(wechatConfig)
    : publisher.platform === "xhs" ? createXhsBrowserPublisher(xhsConfig)
    : publisher);
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function send(res: http.ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.end(JSON.stringify(body, null, 2));
}

function applyCors(res: http.ServerResponse): void {
  res.setHeader("access-control-allow-origin", process.env.TRENDFORGE_CORS_ORIGIN ?? "http://127.0.0.1:5173");
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
}

function maskSecret(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.length <= 4 ? "****" : `${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

function providerState() {
  const envKeyConfigured = Boolean(process.env.TRENDFORGE_MODEL_API_KEY);
  return {
    browserAct: {
      enabled: process.env.TRENDFORGE_ENABLE_BROWSERACT === "1",
      command: process.env.TRENDFORGE_BROWSERACT_COMMAND || "browser-act"
    },
    text: {
      provider: process.env.TRENDFORGE_TEXT_PROVIDER ?? "deterministic",
      baseUrl: process.env.TRENDFORGE_MODEL_BASE_URL ?? "https://api.openai.com/v1",
      model: process.env.TRENDFORGE_MODEL_NAME ?? "gpt-4.1-mini",
      keyConfigured: envKeyConfigured,
      keyPreview: maskSecret(process.env.TRENDFORGE_MODEL_API_KEY)
    },
    mediaCrawler: mediaCrawlerDefaults
  };
}

function sourceItemFromUrl(url: string): SourceItem {
  return {
    id: `verify-${Buffer.from(url).toString("base64url").slice(0, 16)}`,
    sourceType: "manual_url",
    collectorAdapter: "rsshub",
    complianceStatus: "not_required",
    title: url,
    url,
    summary: "Manual verification URL."
  };
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function workspaceRunPath(rawPath: string): string | undefined {
  const normalized = rawPath.replace(/\\/g, "/");
  if (!normalized.startsWith("workspace/runs/")) return undefined;
  const resolved = path.resolve(normalized);
  const runsRoot = path.resolve("workspace", "runs");
  return resolved.startsWith(runsRoot + path.sep) ? resolved : undefined;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("content-type", "application/json; charset=utf-8");
  applyCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    send(res, 200, { ok: true, service: "trendforge-api" });
    return;
  }

  if (req.method === "GET" && req.url === "/providers") {
    const modelConfig = await readModelConfig();
    send(res, 200, {
      ...providerState(),
      localModel: toPublicModelConfig(modelConfig),
      wechat: toPublicWechatConfig(await readWechatConfig()),
      xhs: toPublicXhsConfig(await readXhsConfig())
    });
    return;
  }

  if (req.method === "GET" && req.url === "/config/model") {
    send(res, 200, toPublicModelConfig(await readModelConfig()));
    return;
  }

  if (req.method === "PUT" && req.url === "/config/model") {
    const body = await readJsonBody(req);
    const existing = await readModelConfig();
    const apiKey = typeof body.apiKey === "string" && body.apiKey.trim()
      ? body.apiKey.trim()
      : body.keepExistingKey === true ? existing.apiKey : undefined;
    const saved = await writeModelConfig({
      enabled: body.enabled === true,
      provider: body.provider === "openai-compatible" ? "openai-compatible" : "deterministic",
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : existing.baseUrl,
      model: typeof body.model === "string" ? body.model : existing.model,
      apiKey
    });
    send(res, 200, toPublicModelConfig(saved));
    return;
  }

  if (req.method === "GET" && req.url === "/config/wechat") {
    send(res, 200, toPublicWechatConfig(await readWechatConfig()));
    return;
  }

  if (req.method === "PUT" && req.url === "/config/wechat") {
    const body = await readJsonBody(req);
    const existing = await readWechatConfig();
    const appSecret = typeof body.appSecret === "string" && body.appSecret.trim()
      ? body.appSecret.trim()
      : body.keepExistingSecret === true ? existing.appSecret : undefined;
    const saved = await writeWechatConfig({
      enabled: body.enabled === true,
      appId: typeof body.appId === "string" ? body.appId : existing.appId,
      appSecret,
      coverMediaId: typeof body.coverMediaId === "string" ? body.coverMediaId : existing.coverMediaId
    });
    send(res, 200, toPublicWechatConfig(saved));
    return;
  }

  if (req.method === "POST" && req.url === "/verify/wechat") {
    const config = await readWechatConfig();
    if (!config.enabled || !config.appId || !config.appSecret) {
      send(res, 200, {
        ok: false,
        failureReason: "WeChat config requires enabled=true, appId, and appSecret."
      });
      return;
    }
    const token = await requestWechatAccessToken(config.appId, config.appSecret);
    const gate = await checkWechatDraftGate(config, { allowRealDraft: true });
    send(res, 200, { ...token, gate });
    return;
  }

  if (req.method === "GET" && req.url === "/config/xhs") {
    send(res, 200, toPublicXhsConfig(await readXhsConfig()));
    return;
  }

  if (req.method === "PUT" && req.url === "/config/xhs") {
    const body = await readJsonBody(req);
    const existing = await readXhsConfig();
    const saved = await writeXhsConfig({
      enabled: body.enabled === true,
      projectDir: typeof body.projectDir === "string" ? body.projectDir : existing.projectDir,
      bridgeUrl: typeof body.bridgeUrl === "string" ? body.bridgeUrl : existing.bridgeUrl
    });
    send(res, 200, toPublicXhsConfig(saved));
    return;
  }

  if (req.method === "POST" && req.url === "/verify/xhs") {
    send(res, 200, await checkXhsDraftGate(await readXhsConfig(), { allowRealDraft: true }));
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/artifacts?")) {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const artifactPath = workspaceRunPath(url.searchParams.get("path") ?? "");
    if (!artifactPath) {
      send(res, 400, { error: "artifact_path_not_allowed" });
      return;
    }
    const content = await readFile(artifactPath, "utf8");
    send(res, 200, { path: url.searchParams.get("path"), content });
    return;
  }

  if (req.method === "GET" && req.url === "/subscriptions") {
    send(res, 200, { subscriptions: await readSubscriptions() });
    return;
  }

  if (req.method === "PUT" && req.url === "/subscriptions") {
    const body = await readJsonBody(req);
    const subscriptions = await writeSubscriptions(Array.isArray(body.subscriptions) ? body.subscriptions as never : []);
    send(res, 200, { subscriptions });
    return;
  }

  if (req.method === "POST" && req.url === "/subscriptions/validate") {
    const body = await readJsonBody(req);
    const source = typeof body.source === "string" ? body.source : "";
    const type = body.type === "aihot" || body.type === "rsshub" || body.type === "rss" ? body.type : "rss";
    const health = await checkSourceHealth({
      id: typeof body.id === "string" ? body.id : "ad-hoc-source",
      title: typeof body.title === "string" ? body.title : "Ad hoc source",
      type,
      source,
      enabled: true
    });
    send(res, 200, { ok: health.status === "healthy", count: health.itemCount, items: health.sampleItems, health });
    return;
  }

  if (req.method === "POST" && req.url === "/verify/rss") {
    const body = await readJsonBody(req);
    const source = typeof body.source === "string" ? body.source : "";
    const adapter = new RssHubSourceAdapter();
    const raw = await adapter.collect(source);
    send(res, 200, { ok: raw.length > 0, items: raw.map((item) => adapter.normalize(item)).slice(0, 10) });
    return;
  }

  if (req.method === "POST" && req.url === "/verify/browseract") {
    const body = await readJsonBody(req);
    const url = typeof body.url === "string" ? body.url : "";
    const item = sourceItemFromUrl(url);
    const article: VerifiedArticle = {
      sourceItemId: item.id,
      status: "partial",
      method: "manual",
      evidenceUrl: url,
      failureReason: "Manual BrowserAct verification."
    };
    const result = await createBrowserActFullTextProvider({
      command: process.env.TRENDFORGE_BROWSERACT_COMMAND || "browser-act"
    }).acquire(item, article);
    send(res, 200, {
      ok: result.status === "verified",
      status: result.status,
      method: result.method,
      evidenceUrl: result.evidenceUrl,
      textLength: result.fullText?.length ?? 0,
      preview: result.fullText?.slice(0, 800),
      failureReason: result.failureReason
    });
    return;
  }

  if (req.method === "POST" && req.url === "/verify/mediacrawler") {
    const body = await readJsonBody(req);
    const enabled = body.enabled === true;
    const vendorDir = path.resolve("vendor", "mediacrawler");
    const adapter = new MediaCrawlerFallbackAdapter(enabled);
    send(res, 200, {
      ok: enabled && await exists(path.join(vendorDir, "main.py")),
      enabled,
      vendorDir,
      hasMain: await exists(path.join(vendorDir, "main.py")),
      hasPyproject: await exists(path.join(vendorDir, "pyproject.toml")),
      health: await adapter.healthcheck(),
      compliance: adapter.checkCompliance()
    });
    return;
  }

  if (req.method === "POST" && req.url === "/verify/model") {
    const modelConfig = await readModelConfig();
    const article: VerifiedArticle = {
      sourceItemId: "verify-model",
      status: "verified",
      method: "manual",
      fullText: "AI agents are moving from demos into real content operations. Summarize this trend for publishing."
    };
    const selection: CandidateSelection = {
      sourceItemId: article.sourceItemId,
      score: 100,
      reason: "Model verification request.",
      targetPlatforms: ["review", "wechat", "xhs"],
      angle: "AI workflow verification",
      tags: ["verification"]
    };
    const summary = await createOpenAICompatibleTextProvider({
      baseUrl: process.env.TRENDFORGE_MODEL_BASE_URL ?? modelConfig.baseUrl,
      apiKey: process.env.TRENDFORGE_MODEL_API_KEY ?? modelConfig.apiKey,
      model: process.env.TRENDFORGE_MODEL_NAME ?? modelConfig.model
    }).summarize(article, selection);
    send(res, 200, { ok: true, summary });
    return;
  }

  if (req.method === "POST" && req.url === "/pipeline/run") {
    const body = await readJsonBody(req);
    const pipeline = createDefaultPipeline({
      store,
      ...createRuntimeProviders(process.env, await readModelConfig()),
      publishers: await createRuntimePublishers()
    });
    const requestedPlatforms = Array.isArray(body.requestedPlatforms)
      ? body.requestedPlatforms.filter((platform): platform is Platform => ["review", "wechat", "xhs"].includes(String(platform)))
      : ["review", "wechat", "xhs"] satisfies Platform[];
    const result = await pipeline.run({
      runId: typeof body.runId === "string" ? body.runId : `run-${Date.now()}`,
      query: typeof body.query === "string" ? body.query : aiHotDefaults.skillUrl,
      requestedPlatforms,
      allowBrowserFallback: body.allowBrowserFallback !== false,
      allowMediaCrawlerFallback: body.allowMediaCrawlerFallback === true,
      allowRealDraft: body.allowRealDraft === true,
      dryRunPublish: body.dryRunPublish !== false,
      topN: typeof body.topN === "number" ? body.topN : undefined
    });
    send(res, 200, result);
    return;
  }

  if (req.method === "GET" && req.url === "/runs") {
    send(res, 200, { runs: await store.listRuns() });
    return;
  }

  if (req.method === "GET" && req.url === "/review-queue") {
    const runs = await store.listRuns();
    const queue = [];
    for (const entry of runs.slice(0, 20)) {
      const run = await store.readRun(entry.runId);
      if (run) queue.push(...(run.reviewQueue ?? buildReviewQueue(run)));
    }
    send(res, 200, { queue });
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/runs/")) {
    const runId = decodeURIComponent(req.url.slice("/runs/".length));
    if (runId.endsWith("/events")) {
      const realRunId = runId.slice(0, -"/events".length);
      send(res, 200, { runId: realRunId, events: await store.readEvents(realRunId) });
      return;
    }
    if (runId.endsWith("/review-queue")) {
      const realRunId = runId.slice(0, -"/review-queue".length);
      const run = await store.readRun(realRunId);
      send(res, run ? 200 : 404, run ? { runId: realRunId, queue: run.reviewQueue ?? buildReviewQueue(run) } : { error: "run_not_found" });
      return;
    }
    const run = await store.readRun(runId);
    send(res, run ? 200 : 404, run ?? { error: "run_not_found" });
    return;
  }

  if (req.method === "POST" && req.url?.startsWith("/runs/") && req.url.includes("/assets/") && req.url.endsWith("/approve")) {
    const match = /^\/runs\/([^/]+)\/assets\/([^/]+)\/approve$/.exec(req.url);
    const runId = decodeURIComponent(match?.[1] ?? "");
    const assetId = decodeURIComponent(match?.[2] ?? "");
    const run = await store.readRun(runId);
    if (!run) {
      send(res, 404, { error: "run_not_found" });
      return;
    }
    const asset = run.assets.find((candidate) => candidate.id === assetId);
    if (!asset) {
      send(res, 404, { error: "asset_not_found" });
      return;
    }
    asset.status = "approved";
    asset.approvalRequired = false;
    run.reviewQueue = buildReviewQueue(run);
    await store.saveRun(run);
    await store.appendEvent(runId, { stage: "asset_approval", assetId, status: "approved" });
    send(res, 200, { ok: true, asset, queue: run.reviewQueue });
    return;
  }

  if (req.method === "GET" && req.url === "/items") {
    const runs = await store.listRuns();
    const latest = runs[0] ? await store.readRun(runs[0].runId) : undefined;
    send(res, 200, { items: latest?.sourceItems ?? [] });
    return;
  }

  if (req.method === "GET" && req.url === "/drafts") {
    const runs = await store.listRuns();
    const latest = runs[0] ? await store.readRun(runs[0].runId) : undefined;
    send(res, 200, { drafts: latest?.drafts ?? [] });
    return;
  }

  if (req.method === "GET" && req.url === "/sources") {
    const subscriptions = await readSubscriptions();
    send(res, 200, {
      defaultCollectorOrder,
      defaultFullTextAcquisitionOrder,
      aiHotDefaults,
      mediaCrawlerDefaults,
      subscriptions,
      health: await checkSourcesHealth(subscriptions)
    });
    return;
  }

  if (req.method === "GET" && req.url === "/sources/health") {
    const subscriptions = await readSubscriptions();
    send(res, 200, { health: await checkSourcesHealth(subscriptions) });
    return;
  }

  if (req.method === "GET" && req.url === "/publishers") {
    const publishers = await createRuntimePublishers();
    const health = [];
    for (const publisher of publishers) {
      health.push({ platform: publisher.platform, ...(await publisher.healthcheck()) });
    }
    send(res, 200, { publishers: health });
    return;
  }

  send(res, 404, { error: "not_found" });
});

server.listen(port, () => {
  console.log(`TrendForge API listening on http://localhost:${port}`);
});
