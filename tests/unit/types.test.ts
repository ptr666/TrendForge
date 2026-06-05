import test from "node:test";
import assert from "node:assert/strict";
import { RssHubSourceAdapter } from "../../packages/sources/src/adapters.js";

test("rsshub adapter normalizes a source item", () => {
  const adapter = new RssHubSourceAdapter();
  const item = adapter.normalize({ queryOrSource: "AI workflow demo", kind: "manual_seed" });

  assert.equal(item.collectorAdapter, "rsshub");
  assert.equal(item.complianceStatus, "not_required");
  assert.equal(item.sourceType, "manual_query");
  assert.equal(item.title, "AI workflow demo");
});
