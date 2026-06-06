import test from "node:test";
import assert from "node:assert/strict";
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

test("default source adapters prioritize aihot before rsshub", () => {
  const adapters = createDefaultSourceAdapters();

  assert.deepEqual(adapters.map((adapter) => adapter.name), ["aihot", "rsshub", "browseract", "mediacrawler"]);
});
