import test from "node:test";
import assert from "node:assert/strict";
import { MediaCrawlerFallbackAdapter } from "../../packages/sources/src/adapters.js";

test("mediacrawler fallback is disabled by default", async () => {
  const adapter = new MediaCrawlerFallbackAdapter();
  const health = await adapter.healthcheck();
  const raw = await adapter.collect("ai trend");

  assert.equal(health.ok, false);
  assert.equal(raw.length, 0);
  assert.equal(adapter.checkCompliance().status, "rejected");
});

test("mediacrawler fallback builds a plan when explicitly enabled", async () => {
  const adapter = new MediaCrawlerFallbackAdapter(true);
  const raw = await adapter.collect("ai trend");
  const item = adapter.normalize(raw[0]);

  assert.equal(item.collectorAdapter, "mediacrawler");
  assert.equal(item.complianceStatus, "pending");
  assert.ok(Array.isArray(item.metadata?.command));
});
