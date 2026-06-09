import http from "node:http";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { createDefaultPipeline } from "../../../packages/core/src/pipeline.js";
import { buildReviewQueue } from "../../../packages/core/src/review-queue.js";
import { aiHotDefaults, defaultCollectorOrder, defaultFullTextAcquisitionOrder, mediaCrawlerDefaults } from "../../../packages/config/src/index.js";
import {
  readImageModelConfig,
  readModelConfig,
  readRssHubConfig,
  readWechatConfig,
  readXhsConfig,
  toPublicImageModelConfig,
  toPublicModelConfig,
  toPublicRssHubConfig,
  toPublicWechatConfig,
  toPublicXhsConfig,
  writeImageModelConfig,
  writeModelConfig,
  writeRssHubConfig,
  writeWechatConfig,
  writeXhsConfig
} from "../../../packages/config/src/local-config.js";
import {
  buildSubscriptionFromDraft,
  checkSourceHealth,
  checkSourcesHealth,
  fixedAiHotSubscription,
  previewSubscription,
  readSubscriptions,
  writeSubscriptions
} from "../../../packages/config/src/subscriptions.js";
import { AiHotSourceAdapter, MediaCrawlerFallbackAdapter, RssHubSourceAdapter } from "../../../packages/sources/src/adapters.js";
import { createPlannedPublishers } from "../../../packages/publishers/src/index.js";
import { checkWechatDraftGate, createWechatOfficialPublisher, requestWechatAccessToken } from "../../../packages/publishers/src/wechat.js";
import { checkXhsDraftGate, createXhsBrowserPublisher } from "../../../packages/publishers/src/xhs.js";
import { createBrowserActFullTextProvider, createOpenAICompatibleTextProvider } from "../../../packages/providers/src/index.js";
import { createRuntimeProviders } from "../../../packages/providers/src/runtime.js";
import { createRunStore } from "../../../packages/storage/src/run-store.js";
import type { CandidateSelection, Platform, SourceItem, SourceSubscription, VerifiedArticle } from "../../../packages/core/src/types.js";

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

async function createPipelineDeps() {
  return createRuntimeProviders(process.env, await readModelConfig(), await readImageModelConfig());
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
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
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
  const resolved = path.resolve(rawPath);
  const runsRoot = path.resolve(store.rootDir);
  return resolved.startsWith(runsRoot + path.sep) ? resolved : undefined;
}

function imageContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/png";
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  res.setHeader("content-type", "application/json; charset=utf-8");
  applyCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    send(res, 200, { ok: true, service: "trendforge-api", runsDir: store.rootDir });
    return;
  }

  if (req.method === "GET" && req.url === "/providers") {
    const modelConfig = await readModelConfig();
    const imageModelConfig = await readImageModelConfig();
    send(res, 200, {
      ...providerState(),
      localModel: toPublicModelConfig(modelConfig),
      imageModel: toPublicImageModelConfig(imageModelConfig),
      wechat: toPublicWechatConfig(await readWechatConfig()),
      xhs: toPublicXhsConfig(await readXhsConfig())
    });
    return;
  }

  if (req.method === "GET" && req.url === "/config/model") {
    send(res, 200, toPublicModelConfig(await readModelConfig()));
    return;
  }

  if (req.method === "GET" && req.url === "/config/image-model") {
    send(res, 200, toPublicImageModelConfig(await readImageModelConfig()));
    return;
  }

  if (req.method === "GET" && req.url === "/config/rsshub") {
    send(res, 200, toPublicRssHubConfig(await readRssHubConfig()));
    return;
  }

  if (req.method === "PUT" && req.url === "/config/rsshub") {
    const body = await readJsonBody(req);
    const saved = await writeRssHubConfig({
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : (await readRssHubConfig()).baseUrl
    });
    send(res, 200, toPublicRssHubConfig(saved));
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

  if (req.method === "PUT" && req.url === "/config/image-model") {
    const body = await readJsonBody(req);
    const existing = await readImageModelConfig();
    const apiKey = typeof body.apiKey === "string" && body.apiKey.trim()
      ? body.apiKey.trim()
      : body.keepExistingKey === true ? existing.apiKey : undefined;
    const saved = await writeImageModelConfig({
      enabled: body.enabled === true,
      provider: body.provider === "openai-compatible" ? "openai-compatible" : "none",
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : existing.baseUrl,
      model: typeof body.model === "string" ? body.model : existing.model,
      apiKey
    });
    send(res, 200, toPublicImageModelConfig(saved));
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
      coverMediaId: typeof body.coverMediaId === "string" ? body.coverMediaId : existing.coverMediaId,
      coverImagePath: typeof body.coverImagePath === "string" ? body.coverImagePath : existing.coverImagePath,
      legacyCredentialSource: typeof body.legacyCredentialSource === "string" ? body.legacyCredentialSource : existing.legacyCredentialSource
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

  if (req.method === "POST" && req.url === "/subscriptions/upsert") {
    const body = await readJsonBody(req);
    if (body.type === "aihot") {
      send(res, 400, { error: "invalid_subscription", failureReason: "AIHot 是固定默认源，不能作为用户渠道保存。" });
      return;
    }
    const draft = {
      existingId: typeof body.existingId === "string" ? body.existingId : typeof body.id === "string" ? body.id : undefined,
      type: body.type === "rsshub" ? "rsshub" as const : "rss" as const,
      source: typeof body.source === "string" ? body.source : "",
      enabled: body.enabled !== false,
      titleOverride: typeof body.titleOverride === "string" ? body.titleOverride : typeof body.title === "string" ? body.title : undefined
    };
    const { subscription, health, preview } = await buildSubscriptionFromDraft(draft);
    if (!subscription.source) {
      send(res, 400, { error: "invalid_subscription", failureReason: "Subscription requires source." });
      return;
    }
    const subscriptions = await readSubscriptions();
    const savedSubscriptions = await writeSubscriptions([
      ...subscriptions.filter((item) => item.id !== subscription.id),
      subscription
    ]);
    send(res, 200, {
      ok: true,
      subscription,
      subscriptions: savedSubscriptions,
      health,
      preview
    });
    return;
  }

  if (req.method === "POST" && req.url === "/subscriptions/preview") {
    const body = await readJsonBody(req);
    if (body.type === "aihot") {
      send(res, 400, { error: "invalid_subscription", failureReason: "AIHot 是固定默认源，不需要添加订阅。" });
      return;
    }
    const preview = await previewSubscription({
      type: body.type === "rsshub" ? "rsshub" : "rss",
      source: typeof body.source === "string" ? body.source : "",
      enabled: body.enabled !== false,
      titleOverride: typeof body.titleOverride === "string" ? body.titleOverride : typeof body.title === "string" ? body.title : undefined
    });
    send(res, 200, preview);
    return;
  }

  if (req.method === "DELETE" && req.url?.startsWith("/subscriptions/")) {
    const sourceId = decodeURIComponent(req.url.slice("/subscriptions/".length));
    const subscriptions = await readSubscriptions();
    const nextSubscriptions = subscriptions.filter((subscription) => subscription.id !== sourceId);
    if (nextSubscriptions.length === subscriptions.length) {
      send(res, 404, { error: "subscription_not_found", sourceId });
      return;
    }
    send(res, 200, { ok: true, sourceId, subscriptions: await writeSubscriptions(nextSubscriptions) });
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
    try {
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
    } catch (error) {
      send(res, 200, {
        ok: false,
        failureReason: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/pipeline/run") {
    const body = await readJsonBody(req);
    const pipeline = createDefaultPipeline({
      store,
      ...await createPipelineDeps(),
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

  if (req.method === "POST" && req.url === "/pipeline/screen") {
    const body = await readJsonBody(req);
    const subscriptions = await readSubscriptions();
    const sourceIds = Array.isArray(body.sourceIds) ? body.sourceIds.map(String) : [];
    const selectedSources = [
      ...(sourceIds.includes(fixedAiHotSubscription.id) ? [fixedAiHotSubscription] : []),
      ...subscriptions.filter((subscription) => sourceIds.includes(subscription.id))
    ];
    const pipeline = createDefaultPipeline({
      store,
      ...await createPipelineDeps(),
      publishers: await createRuntimePublishers()
    });
    const request = {
      runId: typeof body.runId === "string" ? body.runId : `screen-${Date.now()}`,
      sources: selectedSources,
      candidateCount: typeof body.candidateCount === "number" ? body.candidateCount : 3,
      sourceItemIds: Array.isArray(body.sourceItemIds) ? body.sourceItemIds.map(String) : undefined,
      allowBrowserFallback: body.allowBrowserFallback !== false,
      allowMediaCrawlerFallback: body.allowMediaCrawlerFallback === true
    };
    if (body.async === true) {
      void pipeline.screen(request).catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);
        await store.appendEvent(request.runId, { stage: "finished", status: "failed", message });
      });
      send(res, 202, { ok: true, runId: request.runId, status: "accepted" });
      return;
    }
    const result = await pipeline.screen(request);
    send(res, 200, result);
    return;
  }

  if (req.method === "POST" && req.url === "/pipeline/drafts") {
    const body = await readJsonBody(req);
    const pipeline = createDefaultPipeline({
      store,
      ...await createPipelineDeps(),
      publishers: await createRuntimePublishers()
    });
    const requestedPlatforms = Array.isArray(body.requestedPlatforms)
      ? body.requestedPlatforms.filter((platform): platform is Platform => ["review", "wechat", "xhs"].includes(String(platform)))
      : ["review", "wechat", "xhs"] satisfies Platform[];
    const request = {
      runId: typeof body.runId === "string" ? body.runId : "",
      sourceItemIds: Array.isArray(body.sourceItemIds) ? body.sourceItemIds.map(String) : [],
      requestedPlatforms,
      allowRealDraft: body.allowRealDraft === true,
      dryRunPublish: body.dryRunPublish !== false
    };
    if (body.async === true) {
      void pipeline.generateDrafts(request).catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);
        await store.appendEvent(request.runId, { stage: "finished", status: "failed", message });
      });
      send(res, 202, { ok: true, runId: request.runId, status: "accepted" });
      return;
    }
    const result = await pipeline.generateDrafts(request);
    send(res, 200, result);
    return;
  }

  if (req.method === "POST" && req.url === "/pipeline/publish-drafts") {
    const body = await readJsonBody(req);
    const pipeline = createDefaultPipeline({
      store,
      ...await createPipelineDeps(),
      publishers: await createRuntimePublishers()
    });
    const requestedPlatforms = Array.isArray(body.requestedPlatforms)
      ? body.requestedPlatforms.filter((platform): platform is Platform => ["wechat", "xhs"].includes(String(platform)))
      : ["wechat", "xhs"] satisfies Platform[];
    const request = {
      runId: typeof body.runId === "string" ? body.runId : "",
      draftIds: Array.isArray(body.draftIds) ? body.draftIds.map(String) : undefined,
      sourceItemIds: Array.isArray(body.sourceItemIds) ? body.sourceItemIds.map(String) : undefined,
      requestedPlatforms,
      allowRealDraft: body.allowRealDraft === true
    };
    if (body.async === true) {
      void pipeline.publishDrafts(request).catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);
        await store.appendEvent(request.runId, { stage: "finished", status: "failed", message });
      });
      send(res, 202, { ok: true, runId: request.runId, status: "accepted" });
      return;
    }
    const result = await pipeline.publishDrafts(request);
    send(res, 200, result);
    return;
  }

  if (req.method === "GET" && req.url === "/runs") {
    send(res, 200, { runs: await store.listRuns(), runsDir: store.rootDir });
    return;
  }

  if (req.method === "DELETE" && req.url === "/runs") {
    send(res, 200, { ok: true, deleted: await store.clearRuns() });
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
    const requestPath = new URL(req.url, "http://127.0.0.1").pathname;
    const runId = decodeURIComponent(requestPath.slice("/runs/".length));
    const assetFileMatch = /^([^/]+)\/assets\/([^/]+)\/file$/.exec(runId);
    if (assetFileMatch) {
      const realRunId = decodeURIComponent(assetFileMatch[1] ?? "");
      const assetId = decodeURIComponent(assetFileMatch[2] ?? "");
      const run = await store.readRun(realRunId);
      const asset = run?.assets.find((candidate) => candidate.id === assetId);
      const assetPath = asset?.path ? workspaceRunPath(asset.path) : undefined;
      if (!run || !asset || !assetPath) {
        send(res, 404, { error: "asset_not_found" });
        return;
      }
      const bytes = await readFile(assetPath);
      res.statusCode = 200;
      res.setHeader("content-type", imageContentType(assetPath));
      res.setHeader("cache-control", "no-store");
      res.end(bytes);
      return;
    }
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

  if (req.method === "DELETE" && req.url?.startsWith("/runs/")) {
    const runId = decodeURIComponent(req.url.slice("/runs/".length));
    const deleted = await store.deleteRun(runId);
    send(res, deleted ? 200 : 404, deleted ? { ok: true, runId } : { error: "run_not_found", runId });
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

  if (req.method === "POST" && req.url?.startsWith("/runs/") && req.url.includes("/assets/") && req.url.endsWith("/regenerate")) {
    const match = /^\/runs\/([^/]+)\/assets\/([^/]+)\/regenerate$/.exec(req.url);
    const runId = decodeURIComponent(match?.[1] ?? "");
    const assetId = decodeURIComponent(match?.[2] ?? "");
    const pipeline = createDefaultPipeline({
      store,
      ...await createPipelineDeps(),
      publishers: await createRuntimePublishers()
    });
    const run = await pipeline.regenerateAsset({ runId, assetId });
    send(res, 200, run);
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
      fixedSources: {
        aihot: fixedAiHotSubscription
      },
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

  if (req.method === "GET" && req.url === "/sources/aihot/latest") {
    const adapter = new AiHotSourceAdapter();
    const health = await checkSourceHealth(fixedAiHotSubscription);
    const raw = health.status === "healthy" ? await adapter.collect(fixedAiHotSubscription.source) : [];
    const items = raw.map((item) => adapter.normalize(item)).slice(0, 20);
    send(res, 200, {
      source: fixedAiHotSubscription,
      health,
      items,
      checkedAt: health.checkedAt
    });
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
}

const server = http.createServer((req, res) => {
  void handleRequest(req, res).catch((error) => {
    if (!res.headersSent) {
      send(res, 500, {
        error: "internal_server_error",
        failureReason: error instanceof Error ? error.message : String(error)
      });
    } else {
      res.end();
    }
  });
});

server.listen(port, () => {
  console.log(`TrendForge API listening on http://localhost:${port}`);
});
