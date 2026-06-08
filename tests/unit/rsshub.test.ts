import test from "node:test";
import assert from "node:assert/strict";
import { resolveRssHubSource, RssHubSourceAdapter } from "../../packages/sources/src/adapters.js";

const rss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>AI trend</title>
      <link>https://example.com/ai-trend</link>
      <description><![CDATA[<p>Fresh AI signal.</p>]]></description>
      <pubDate>Sat, 06 Jun 2026 00:00:00 GMT</pubDate>
      <guid>ai-trend-1</guid>
    </item>
  </channel>
</rss>`;

test("rsshub adapter parses RSS XML into source items", async () => {
  const adapter = new RssHubSourceAdapter();
  const raw = await adapter.collect(rss);
  const item = adapter.normalize(raw[0]);

  assert.equal(raw.length, 1);
  assert.equal(item.sourceType, "rss");
  assert.equal(item.collectorAdapter, "rsshub");
  assert.equal(item.title, "AI trend");
  assert.equal(item.url, "https://example.com/ai-trend");
  assert.equal(item.summary, "Fresh AI signal.");
});

test("rsshub adapter fetches RSS URLs before treating .xml as local paths", async () => {
  const adapter = new RssHubSourceAdapter();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    assert.equal(String(input), "https://example.com/feed.xml");
    return new Response(`<?xml version="1.0"?>
<rss version="2.0"><channel><item><title>Remote RSS item</title><link>https://example.com/article</link><description>Remote summary</description></item></channel></rss>`);
  }) as typeof fetch;

  try {
    const raw = await adapter.collect("https://example.com/feed.xml");
    const item = adapter.normalize(raw[0]);

    assert.equal(item.title, "Remote RSS item");
    assert.equal(item.url, "https://example.com/article");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rsshub adapter resolves rsshub protocol routes with configured base URL", async () => {
  const adapter = new RssHubSourceAdapter({ baseUrl: "https://rsshub.example.test" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    assert.equal(String(input), "https://rsshub.example.test/anthropic/research");
    return new Response(`<?xml version="1.0"?>
<rss version="2.0"><channel><item><title>Anthropic research</title><link>https://example.com/research</link><description>Research summary</description></item></channel></rss>`);
  }) as typeof fetch;

  try {
    const raw = await adapter.collect("rsshub://anthropic/research");
    const item = adapter.normalize(raw[0]);

    assert.equal(raw.length, 1);
    assert.equal(item.title, "Anthropic research");
    assert.equal(item.url, "https://example.com/research");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rsshub source resolver normalizes route formats", () => {
  const baseUrl = "https://rsshub.example.test/base/";

  assert.deepEqual(resolveRssHubSource("rsshub://anthropic/research", baseUrl), {
    input: "rsshub://anthropic/research",
    mode: "route",
    normalizedSource: "rsshub://anthropic/research",
    resolvedUrl: "https://rsshub.example.test/base/anthropic/research",
    route: "anthropic/research",
    usesConfiguredBaseUrl: true
  });
  assert.equal(resolveRssHubSource("/anthropic/research", baseUrl).resolvedUrl, "https://rsshub.example.test/base/anthropic/research");
  assert.equal(resolveRssHubSource("anthropic/research?limit=10", baseUrl).resolvedUrl, "https://rsshub.example.test/base/anthropic/research?limit=10");
  assert.equal(resolveRssHubSource("https://rsshub.app/anthropic/research", baseUrl).resolvedUrl, "https://rsshub.app/anthropic/research");
});
