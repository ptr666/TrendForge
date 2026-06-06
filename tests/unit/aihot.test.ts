import test from "node:test";
import assert from "node:assert/strict";
import { defaultCollectorOrder, defaultFullTextAcquisitionOrder } from "../../packages/config/src/index.js";
import { AiHotSourceAdapter, createDefaultSourceAdapters } from "../../packages/sources/src/adapters.js";

test("aihot adapter normalizes skill JSON into source items", async () => {
  const adapter = new AiHotSourceAdapter();
  const raw = await adapter.collect(JSON.stringify({
    items: [{
      id: "hot-1",
      title: "AI coding agents",
      url: "https://example.com/ai-agents",
      summary: "Agents are moving from demos to daily workflows.",
      tags: ["featured"]
    }]
  }));
  const item = adapter.normalize(raw[0]);

  assert.equal(raw.length, 1);
  assert.equal(item.collectorAdapter, "aihot");
  assert.equal(item.sourceType, "aihot");
  assert.equal(item.title, "AI coding agents");
  assert.equal(item.summary, "Agents are moving from demos to daily workflows.");
  assert.equal(item.metadata?.accessMode, "skill");
});

test("aihot adapter extracts skill page links before rsshub fallback", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url) => {
    assert.match(String(url), /^https:\/\/aihot\.virxact\.com\/api\/public\/items\?mode=selected&/);
    return new Response(JSON.stringify({
      items: [{
        id: "hot-api-1",
        title: "AIHot API 热点",
        url: "https://example.com/aihot-api-hot",
        summary: "AIHot public items API 返回的精选热点。",
        source: "AIHot",
        publishedAt: "2026-06-06T00:00:00.000Z",
        category: "industry"
      }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    const adapter = new AiHotSourceAdapter();
    const raw = await adapter.collect("https://aihot.virxact.com/aihot-skill/");
    const item = adapter.normalize(raw[0]);

    assert.equal(raw.length, 1);
    assert.equal(item.collectorAdapter, "aihot");
    assert.equal(item.sourceType, "aihot");
    assert.equal(item.title, "AIHot API 热点");
    assert.equal(item.url, "https://example.com/aihot-api-hot");
    assert.equal(item.metadata?.accessMode, "skill");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("default source adapters prioritize aihot before rsshub", () => {
  const adapters = createDefaultSourceAdapters();

  assert.deepEqual(adapters.map((adapter) => adapter.name), ["aihot", "rsshub", "browseract", "mediacrawler"]);
});

test("public source order separates collection from original text acquisition", () => {
  assert.deepEqual(defaultCollectorOrder, ["aihot", "rsshub"]);
  assert.deepEqual(defaultFullTextAcquisitionOrder, ["browseract", "mediacrawler"]);
});
