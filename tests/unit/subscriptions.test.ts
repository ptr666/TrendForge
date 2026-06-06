import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkSourceHealth, defaultSubscriptions, readSubscriptions } from "../../packages/config/src/subscriptions.js";

test("subscriptions fall back to AI HOT defaults when config is missing", async () => {
  const subscriptions = await readSubscriptions(path.join(os.tmpdir(), "trendforge-missing-subscriptions.json"));

  assert.deepEqual(subscriptions, defaultSubscriptions);
});

test("source health classifies healthy and disabled subscriptions", async () => {
  const healthy = await checkSourceHealth({
    id: "fixture-rss",
    title: "Fixture RSS",
    type: "rss",
    source: `<?xml version="1.0"?><rss><channel><item><title>AI source health</title><link>https://example.com/health</link><description>Health item.</description></item></channel></rss>`,
    enabled: true
  });
  const disabled = await checkSourceHealth({
    id: "disabled-rss",
    title: "Disabled RSS",
    type: "rss",
    source: "https://example.com/feed.xml",
    enabled: false
  });

  assert.equal(healthy.status, "healthy");
  assert.equal(healthy.errorCategory, "none");
  assert.equal(healthy.itemCount, 1);
  assert.equal(healthy.sampleItems[0]?.title, "AI source health");
  assert.equal(disabled.status, "disabled");
  assert.equal(disabled.errorCategory, "disabled");
});

test("source health classifies empty RSS responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("not xml", { status: 200 })) as typeof fetch;

  try {
    const failed = await checkSourceHealth({
      id: "bad-rss",
      title: "Bad RSS",
      type: "rss",
      source: "https://example.com/bad.xml",
      enabled: true
    });

    assert.equal(failed.status, "empty");
    assert.equal(failed.errorCategory, "empty");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("subscriptions read valid local config entries", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-subscriptions-"));
  const configPath = path.join(tempDir, "subscriptions.json");

  try {
    await writeFile(configPath, JSON.stringify({
      subscriptions: [
        {
          id: "local-rss",
          title: "Local RSS",
          type: "rss",
          source: "https://example.com/feed.xml",
          enabled: true,
          priority: 2,
          tags: ["local"]
        }
      ]
    }), "utf8");

    const subscriptions = await readSubscriptions(configPath);

    assert.equal(subscriptions.length, 1);
    assert.equal(subscriptions[0].id, "local-rss");
    assert.equal(subscriptions[0].type, "rss");
    assert.equal(subscriptions[0].enabled, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
