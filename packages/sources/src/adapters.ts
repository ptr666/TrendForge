import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SourceAdapter, SourceItem } from "../../core/src/types.js";

interface RssRawItem {
  title: string;
  link: string;
  description?: string;
  content?: string;
  pubDate?: string;
  guid?: string;
}

interface PlannedCommand {
  queryOrSource: string;
  command: string[];
  reason: string;
}

interface ManualSeed {
  queryOrSource: string;
  kind: "manual_seed";
}

function stableId(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(31, hash) + input.charCodeAt(index) | 0;
  }
  return Math.abs(hash).toString(36);
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .trim();
}

function stripHtml(value: string): string {
  return decodeXml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function readTag(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : undefined;
}

function parseRss(xml: string): RssRawItem[] {
  const itemBlocks = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  const entryBlocks = itemBlocks.length > 0
    ? itemBlocks
    : [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)].map((match) => match[1]);

  return entryBlocks.map((block) => {
    const atomLink = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1];
    const description = readTag(block, "description") ?? readTag(block, "summary");
    const content = readTag(block, "content:encoded") ?? readTag(block, "content");
    return {
      title: stripHtml(readTag(block, "title") ?? "Untitled source item"),
      link: decodeXml(readTag(block, "link") ?? atomLink ?? "about:blank"),
      description: description ? stripHtml(description) : undefined,
      content: content ? stripHtml(content) : undefined,
      pubDate: readTag(block, "pubDate") ?? readTag(block, "updated") ?? readTag(block, "published"),
      guid: readTag(block, "guid") ?? readTag(block, "id")
    };
  });
}

function sourceItemFrom(adapter: SourceItem["collectorAdapter"], query: string, metadata?: Record<string, unknown>): SourceItem {
  return {
    id: `${adapter}-${stableId(query)}`,
    sourceType: "placeholder",
    collectorAdapter: adapter,
    complianceStatus: adapter === "mediacrawler" ? "pending" : "not_required",
    title: `Placeholder item for ${query}`,
    url: "about:blank",
    summary: "Skeleton adapter output. Replace with real integration when wiring the collector.",
    metadata
  };
}

export class RssHubSourceAdapter implements SourceAdapter {
  name = "rsshub" as const;

  async healthcheck() {
    return { ok: true, message: "RSSHub adapter skeleton ready." };
  }

  async collect(queryOrSource: string): Promise<unknown[]> {
    const source = queryOrSource.trim();
    if (!source) return [];

    if (source.startsWith("<rss") || source.startsWith("<?xml") || source.startsWith("<feed")) {
      return parseRss(source);
    }

    if (source.startsWith("file:")) {
      const xml = await readFile(new URL(source), "utf8");
      return parseRss(xml);
    }

    if (source.endsWith(".xml") || source.endsWith(".rss")) {
      const xml = await readFile(path.resolve(source), "utf8");
      return parseRss(xml);
    }

    if (source.startsWith("http://") || source.startsWith("https://")) {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`RSSHub fetch failed: ${response.status} ${response.statusText}`);
      }
      const xml = await response.text();
      return parseRss(xml);
    }

    return [{ queryOrSource: source, kind: "manual_seed" } satisfies ManualSeed];
  }

  normalize(rawResult: unknown): SourceItem {
    if (typeof rawResult === "object" && rawResult && "kind" in rawResult) {
      const raw = rawResult as ManualSeed;
      return {
        id: `rsshub-seed-${stableId(raw.queryOrSource)}`,
        sourceType: "manual_query",
        collectorAdapter: "rsshub",
        complianceStatus: "not_required",
        title: raw.queryOrSource,
        url: "about:blank",
        summary: "Manual query seed. Add RSSHub routes or RSS URLs for real collection.",
        rawText: raw.queryOrSource,
        tags: ["manual_seed"],
        metadata: { kind: raw.kind }
      };
    }

    const raw = rawResult as Partial<RssRawItem>;
    const title = String(raw.title ?? "Untitled source item");
    const url = String(raw.link ?? "about:blank");
    return {
      id: `rsshub-${stableId(raw.guid ?? url + title)}`,
      sourceType: "rss",
      collectorAdapter: "rsshub",
      complianceStatus: "not_required",
      title,
      url,
      summary: raw.description,
      rawText: raw.content ?? raw.description,
      publishedAt: raw.pubDate,
      tags: ["rsshub"],
      metadata: { guid: raw.guid }
    };
  }

  explainFailure(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export class BrowserActSourceAdapter implements SourceAdapter {
  name = "browseract" as const;

  async healthcheck() {
    return { ok: true, message: "BrowserAct adapter skeleton ready." };
  }

  async collect(queryOrSource: string): Promise<unknown[]> {
    const source = queryOrSource.trim();
    if (!source.startsWith("http://") && !source.startsWith("https://")) return [];
    const planned: PlannedCommand = {
      queryOrSource: source,
      command: ["browseract", "stealth-extract", source],
      reason: "BrowserAct fallback plan. Command is not executed by default."
    };
    return [planned];
  }

  normalize(rawResult: unknown): SourceItem {
    const raw = rawResult as Partial<PlannedCommand>;
    const query = raw.queryOrSource
      ? String(raw.queryOrSource)
      : "browseract";
    return sourceItemFrom("browseract", query, {
      command: raw.command,
      reason: raw.reason
    });
  }

  explainFailure(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export class MediaCrawlerFallbackAdapter implements SourceAdapter {
  name = "mediacrawler" as const;

  constructor(private readonly enabled = false) {}

  async healthcheck() {
    return {
      ok: this.enabled,
      message: this.enabled
        ? "MediaCrawler fallback adapter enabled."
        : "MediaCrawler fallback adapter disabled by default."
    };
  }

  async collect(queryOrSource: string): Promise<unknown[]> {
    if (!this.enabled) return [];
    const planned: PlannedCommand = {
      queryOrSource,
      command: ["uv", "run", "main.py", "--platform", "xhs", "--type", "search", "--keywords", queryOrSource],
      reason: "MediaCrawler fallback plan. Requires explicit local project and compliance review."
    };
    return [planned];
  }

  normalize(rawResult: unknown): SourceItem {
    const raw = rawResult as Partial<PlannedCommand>;
    const query = raw.queryOrSource
      ? String(raw.queryOrSource)
      : "mediacrawler";
    return sourceItemFrom("mediacrawler", query, {
      command: raw.command,
      reason: raw.reason
    });
  }

  explainFailure(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  checkCompliance(): { ok: boolean; status: SourceItem["complianceStatus"]; message: string } {
    return {
      ok: this.enabled,
      status: this.enabled ? "pending" : "rejected",
      message: "MediaCrawler requires explicit enablement and compliance review before use."
    };
  }
}

export function createDefaultSourceAdapters(options: { enableMediaCrawlerFallback?: boolean } = {}): SourceAdapter[] {
  return [
    new RssHubSourceAdapter(),
    new BrowserActSourceAdapter(),
    new MediaCrawlerFallbackAdapter(options.enableMediaCrawlerFallback === true)
  ];
}
