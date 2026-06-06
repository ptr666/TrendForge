import test from "node:test";
import assert from "node:assert/strict";
import { RssHubSourceAdapter } from "../../packages/sources/src/adapters.js";

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
