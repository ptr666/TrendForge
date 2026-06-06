import http from "node:http";
import { access } from "node:fs/promises";
import path from "node:path";
import { createDefaultPipeline } from "../../../packages/core/src/pipeline.js";
import { aiHotDefaults, defaultCollectorOrder, defaultFullTextAcquisitionOrder, mediaCrawlerDefaults } from "../../../packages/config/src/index.js";
import { readSubscriptions, writeSubscriptions } from "../../../packages/config/src/subscriptions.js";
import { MediaCrawlerFallbackAdapter, RssHubSourceAdapter } from "../../../packages/sources/src/adapters.js";
import { createPlannedPublishers } from "../../../packages/publishers/src/index.js";
import { createBrowserActFullTextProvider, createOpenAICompatibleTextProvider } from "../../../packages/providers/src/index.js";
import { createRuntimeProviders } from "../../../packages/providers/src/runtime.js";
import { createRunStore } from "../../../packages/storage/src/run-store.js";
import type { CandidateSelection, Platform, SourceItem, VerifiedArticle } from "../../../packages/core/src/types.js";

const port = Number(process.env.TRENDFORGE_PORT ?? 4780);
const store = createRunStore();
const pipeline = createDefaultPipeline({ store, ...createRuntimeProviders() });
const publishers = createPlannedPublishers();

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
  return {
    browserAct: {
      enabled: process.env.TRENDFORGE_ENABLE_BROWSERACT === "1",
      command: process.env.TRENDFORGE_BROWSERACT_COMMAND || "browser-act"
    },
    text: {
      provider: process.env.TRENDFORGE_TEXT_PROVIDER ?? "deterministic",
      baseUrl: process.env.TRENDFORGE_MODEL_BASE_URL ?? "https://api.openai.com/v1",
      model: process.env.TRENDFORGE_MODEL_NAME ?? "gpt-4.1-mini",
      keyConfigured: Boolean(process.env.TRENDFORGE_MODEL_API_KEY),
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
    send(res, 200, providerState());
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
    const adapter = new RssHubSourceAdapter();
    const raw = await adapter.collect(source);
    const items = raw.map((item) => adapter.normalize(item)).slice(0, 10);
    send(res, 200, { ok: items.length > 0, count: items.length, items });
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
      baseUrl: process.env.TRENDFORGE_MODEL_BASE_URL ?? "https://api.deepseek.com",
      apiKey: process.env.TRENDFORGE_MODEL_API_KEY,
      model: process.env.TRENDFORGE_MODEL_NAME ?? "deepseek-v4-flash"
    }).summarize(article, selection);
    send(res, 200, { ok: true, summary });
    return;
  }

  if (req.method === "POST" && req.url === "/pipeline/run") {
    const body = await readJsonBody(req);
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

  if (req.method === "GET" && req.url?.startsWith("/runs/")) {
    const runId = decodeURIComponent(req.url.slice("/runs/".length));
    if (runId.endsWith("/events")) {
      const realRunId = runId.slice(0, -"/events".length);
      send(res, 200, { runId: realRunId, events: await store.readEvents(realRunId) });
      return;
    }
    const run = await store.readRun(runId);
    send(res, run ? 200 : 404, run ?? { error: "run_not_found" });
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
    send(res, 200, {
      defaultCollectorOrder,
      defaultFullTextAcquisitionOrder,
      aiHotDefaults,
      mediaCrawlerDefaults,
      subscriptions: await readSubscriptions()
    });
    return;
  }

  if (req.method === "GET" && req.url === "/publishers") {
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
