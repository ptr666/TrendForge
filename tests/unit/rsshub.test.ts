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
