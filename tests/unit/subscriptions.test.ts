import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defaultSubscriptions, readSubscriptions } from "../../packages/config/src/subscriptions.js";

test("subscriptions fall back to AI HOT defaults when config is missing", async () => {
  const subscriptions = await readSubscriptions(path.join(os.tmpdir(), "trendforge-missing-subscriptions.json"));

  assert.deepEqual(subscriptions, defaultSubscriptions);
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
