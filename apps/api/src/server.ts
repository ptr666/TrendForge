import http from "node:http";
import { createDefaultPipeline } from "../../../packages/core/src/pipeline.js";
import { aiHotDefaults, defaultCollectorOrder, mediaCrawlerDefaults } from "../../../packages/config/src/index.js";
import { readSubscriptions } from "../../../packages/config/src/subscriptions.js";
import { createPlannedPublishers } from "../../../packages/publishers/src/index.js";
import { createRunStore } from "../../../packages/storage/src/run-store.js";
import type { Platform } from "../../../packages/core/src/types.js";

const port = Number(process.env.TRENDFORGE_PORT ?? 4780);
const store = createRunStore();
const pipeline = createDefaultPipeline({ store });
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

const server = http.createServer(async (req, res) => {
  res.setHeader("content-type", "application/json; charset=utf-8");

  if (req.method === "GET" && req.url === "/health") {
    send(res, 200, { ok: true, service: "trendforge-api" });
    return;
  }

  if (req.method === "POST" && req.url === "/pipeline/run") {
    const body = await readJsonBody(req);
    const requestedPlatforms = Array.isArray(body.requestedPlatforms)
      ? body.requestedPlatforms.filter((platform): platform is Platform => ["review", "wechat", "xhs"].includes(String(platform)))
      : ["review", "wechat", "xhs"] satisfies Platform[];
    const result = await pipeline.run({
      runId: `run-${Date.now()}`,
      query: typeof body.query === "string" ? body.query : "api-run",
      requestedPlatforms,
      allowBrowserFallback: body.allowBrowserFallback !== false,
      allowMediaCrawlerFallback: body.allowMediaCrawlerFallback === true,
      allowRealDraft: body.allowRealDraft === true,
      dryRunPublish: body.dryRunPublish !== false
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
