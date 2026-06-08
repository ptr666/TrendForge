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

export interface RssHubResolvedSource {
  input: string;
  mode: "xml" | "file" | "url" | "route" | "local" | "manual";
  normalizedSource: string;
  resolvedUrl?: string;
  route?: string;
  usesConfiguredBaseUrl: boolean;
}

export interface RssHubPreview {
  title?: string;
  resolved: RssHubResolvedSource;
  rawItems: unknown[];
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

interface AiHotRawItem {
  title?: string;
  title_en?: string;
  url?: string;
  link?: string;
  summary?: string;
  description?: string;
  content?: string;
  publishedAt?: string;
  pubDate?: string;
  id?: string;
  tags?: string[];
  source?: string;
  category?: string;
}

interface AiHotItemsResponse {
  items?: unknown[];
}

const aiHotUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 aihot-skill/0.2.0 TrendForge/0.1";

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

function splitRouteAndQuery(route: string): { routePath: string; query: string } {
  const queryIndex = route.indexOf("?");
  return queryIndex >= 0
    ? { routePath: route.slice(0, queryIndex), query: route.slice(queryIndex + 1) }
    : { routePath: route, query: "" };
}

function normalizeRoute(route: string): string {
  const { routePath, query } = splitRouteAndQuery(route);
  const normalizedPath = routePath.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\/{2,}/g, "/");
  return query ? `${normalizedPath}?${query}` : normalizedPath;
}

function readFeedTitle(xml: string): string | undefined {
  const channel = xml.match(/<channel(?:\s[^>]*)?>([\s\S]*?)<\/channel>/i)?.[1];
  const rssTitle = channel ? readTag(channel, "title") : undefined;
  if (rssTitle) return stripHtml(rssTitle);
  const feed = xml.match(/<feed(?:\s[^>]*)?>([\s\S]*?)<\/feed>/i)?.[1];
  const atomTitle = feed ? readTag(feed, "title") : undefined;
  return atomTitle ? stripHtml(atomTitle) : undefined;
}

export function resolveRssHubSource(queryOrSource: string, baseUrl?: string): RssHubResolvedSource {
  const source = queryOrSource.trim();
  const configuredBaseUrl = baseUrl ?? process.env.TRENDFORGE_RSSHUB_BASE_URL ?? "https://rsshub.app";
  const cleanBaseUrl = configuredBaseUrl.replace(/\/+$/, "");

  if (!source) {
    return { input: queryOrSource, mode: "manual", normalizedSource: "", usesConfiguredBaseUrl: false };
  }

  if (source.startsWith("<rss") || source.startsWith("<?xml") || source.startsWith("<feed")) {
    return { input: queryOrSource, mode: "xml", normalizedSource: source, usesConfiguredBaseUrl: false };
  }

  if (source.startsWith("file:")) {
    return { input: queryOrSource, mode: "file", normalizedSource: source, resolvedUrl: source, usesConfiguredBaseUrl: false };
  }

  if (source.startsWith("http://") || source.startsWith("https://")) {
    return { input: queryOrSource, mode: "url", normalizedSource: source, resolvedUrl: source, usesConfiguredBaseUrl: false };
  }

  if (source.startsWith("rsshub://") || source.startsWith("/") || /^[a-z0-9_-]+\/.+/i.test(source)) {
    const rawRoute = source.startsWith("rsshub://") ? source.slice("rsshub://".length) : source;
    const route = normalizeRoute(rawRoute);
    return {
      input: queryOrSource,
      mode: "route",
      normalizedSource: `rsshub://${route}`,
      resolvedUrl: `${cleanBaseUrl}/${route}`,
      route,
      usesConfiguredBaseUrl: true
    };
  }

  if (source.endsWith(".xml") || source.endsWith(".rss")) {
    return { input: queryOrSource, mode: "local", normalizedSource: source, resolvedUrl: path.resolve(source), usesConfiguredBaseUrl: false };
  }

  return { input: queryOrSource, mode: "manual", normalizedSource: source, usesConfiguredBaseUrl: false };
}

export function parseRssFeed(xml: string): { title?: string; items: RssRawItem[] } {
  const itemBlocks = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  const entryBlocks = itemBlocks.length > 0
    ? itemBlocks
    : [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)].map((match) => match[1]);

  return {
    title: readFeedTitle(xml),
    items: entryBlocks.map((block) => {
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
    })
  };
}

function parseRss(xml: string): RssRawItem[] {
  return parseRssFeed(xml).items;
}

function parseItemsPayload(parsed: unknown): unknown[] {
  return Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed && Array.isArray((parsed as AiHotItemsResponse).items)
      ? (parsed as AiHotItemsResponse).items ?? []
      : [];
}

function aiHotItemsUrl(source: string): string {
  if (source.includes("/api/public/items")) return source;
  const url = new URL("https://aihot.virxact.com/api/public/items");
  url.searchParams.set("mode", "selected");
  url.searchParams.set("take", process.env.TRENDFORGE_AIHOT_TAKE ?? "20");
  url.searchParams.set("since", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  return url.toString();
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

  constructor(private readonly options: { baseUrl?: string } = {}) {}

  async healthcheck() {
    return { ok: true, message: "RSSHub adapter skeleton ready." };
  }

  async collect(queryOrSource: string): Promise<unknown[]> {
    return (await this.preview(queryOrSource)).rawItems;
  }

  async preview(queryOrSource: string): Promise<RssHubPreview> {
    const resolved = resolveRssHubSource(queryOrSource, this.options.baseUrl);
    const source = resolved.normalizedSource;
    if (!source) return { resolved, rawItems: [] };

    if (resolved.mode === "xml") {
      const feed = parseRssFeed(source);
      return { resolved, title: feed.title, rawItems: feed.items };
    }

    if (resolved.mode === "file" && resolved.resolvedUrl) {
      const xml = await readFile(new URL(source), "utf8");
      const feed = parseRssFeed(xml);
      return { resolved, title: feed.title, rawItems: feed.items };
    }

    if ((resolved.mode === "url" || resolved.mode === "route") && resolved.resolvedUrl) {
      const response = await fetch(resolved.resolvedUrl);
      if (!response.ok) {
        const prefix = resolved.mode === "route" ? "RSSHub route fetch failed" : "RSS fetch failed";
        throw new Error(`${prefix}: ${response.status} ${response.statusText}`);
      }
      const xml = await response.text();
      const feed = parseRssFeed(xml);
      return { resolved, title: feed.title, rawItems: feed.items };
    }

    if (resolved.mode === "local") {
      const xml = await readFile(path.resolve(source), "utf8");
      const feed = parseRssFeed(xml);
      return { resolved, title: feed.title, rawItems: feed.items };
    }

    return { resolved, rawItems: [{ queryOrSource: source, kind: "manual_seed" } satisfies ManualSeed] };
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

export class AiHotSourceAdapter implements SourceAdapter {
  name = "aihot" as const;

  async healthcheck() {
    return {
      ok: true,
      message: "AI HOT adapter ready. Uses selected public items API before RSSHub fallback."
    };
  }

  async collect(queryOrSource: string): Promise<unknown[]> {
    const source = queryOrSource.trim();
    if (!source) return [];

    if (source.startsWith("aihot:")) {
      const payload = source.slice("aihot:".length).trim();
      if (!payload) return [];
      return [{ title: payload, summary: payload, url: "about:blank", tags: ["aihot", "skill"] } satisfies AiHotRawItem];
    }

    if (process.env.TRENDFORGE_AIHOT_FIXTURE && source.includes("aihot.virxact.com")) {
      return parseItemsPayload(JSON.parse(process.env.TRENDFORGE_AIHOT_FIXTURE) as unknown);
    }

    if (source.startsWith("{") || source.startsWith("[")) {
      return parseItemsPayload(JSON.parse(source) as unknown).filter((item) => typeof item === "object" && item !== null);
    }

    if (source.startsWith("http://") || source.startsWith("https://")) {
      if (!source.includes("aihot") && !source.includes("virxact")) return [];
      const response = await fetch(aiHotItemsUrl(source), {
        headers: {
          "user-agent": aiHotUserAgent
        }
      });
      if (!response.ok) {
        throw new Error(`AI HOT fetch failed: ${response.status} ${response.statusText}`);
      }
      const text = await response.text();
      if (text.trim().startsWith("<rss") || text.trim().startsWith("<?xml") || text.trim().startsWith("<feed")) {
        return parseRss(text);
      }
      return parseItemsPayload(JSON.parse(text) as unknown);
    }

    return [];
  }

  normalize(rawResult: unknown): SourceItem {
    const raw = rawResult as AiHotRawItem;
    const title = String(raw.title ?? "Untitled AI HOT item");
    const url = String(raw.url ?? raw.link ?? "about:blank");
    const summary = raw.summary ?? raw.description ?? raw.content;
    return {
      id: `aihot-${stableId(raw.id ?? url + title)}`,
      sourceType: "aihot",
      collectorAdapter: "aihot",
      complianceStatus: "not_required",
      title,
      url,
      summary,
      rawText: raw.content ?? summary,
      publishedAt: raw.publishedAt ?? raw.pubDate,
      tags: [...(raw.tags ?? []), "aihot"],
      metadata: {
        accessMode: raw.tags?.includes("rss") ? "rss" : "skill",
        sourcePriority: 1,
        source: raw.source,
        category: raw.category,
        title_en: raw.title_en
      }
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
    new AiHotSourceAdapter(),
    new RssHubSourceAdapter(),
    new BrowserActSourceAdapter(),
    new MediaCrawlerFallbackAdapter(options.enableMediaCrawlerFallback === true)
  ];
}
