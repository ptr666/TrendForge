import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SourceHealth, SourceHealthErrorCategory, SourceSubscription } from "../../core/src/types.js";
import { AiHotSourceAdapter, resolveRssHubSource, RssHubSourceAdapter, type RssHubPreview } from "../../sources/src/adapters.js";
import { readRssHubConfig } from "./local-config.js";

export interface SubscriptionConfig {
  subscriptions: SourceSubscription[];
}

export type UserSubscriptionType = "rss" | "rsshub";

export const fixedAiHotSubscription: SourceSubscription = {
  id: "aihot-default",
  title: "AIHot 最新热点",
  type: "aihot",
  source: "https://aihot.virxact.com/aihot-skill/",
  enabled: true,
  priority: 1,
  tags: ["aihot", "skill", "fixed"]
};

export const defaultSubscriptions: SourceSubscription[] = [];

export const legacyAiHotSubscriptions: SourceSubscription[] = [
  {
    id: "aihot-skill",
    title: "AI HOT Skill",
    type: "aihot",
    source: "https://aihot.virxact.com/aihot-skill/",
    enabled: true,
    priority: 1,
    tags: ["aihot", "skill"]
  }
];

export interface SubscriptionDraft {
  existingId?: string;
  type: UserSubscriptionType;
  source: string;
  enabled?: boolean;
  titleOverride?: string;
}

export interface SubscriptionPreviewResult {
  ok: boolean;
  type: UserSubscriptionType;
  source: string;
  normalizedSource: string;
  resolvedUrl?: string;
  route?: string;
  usesConfiguredBaseUrl: boolean;
  title: string;
  itemCount: number;
  message: string;
  errorCategory: SourceHealthErrorCategory | "not_found";
  sampleItems: SourceHealth["sampleItems"];
  health?: SourceHealth;
}

function isSubscription(value: unknown): value is SourceSubscription {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SourceSubscription>;
  return typeof candidate.id === "string"
    && typeof candidate.title === "string"
    && ["aihot", "rss", "rsshub"].includes(String(candidate.type))
    && typeof candidate.source === "string"
    && typeof candidate.enabled === "boolean";
}

export function normalizeSubscriptions(value: unknown): SourceSubscription[] {
  const parsed = value as Partial<SubscriptionConfig>;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.subscriptions)) return [];
  return parsed.subscriptions.filter(isSubscription).filter((subscription) => subscription.type !== "aihot");
}

export async function readSubscriptions(configPath = path.resolve("workspace", "sources", "subscriptions.json")): Promise<SourceSubscription[]> {
  try {
    return normalizeSubscriptions(JSON.parse(await readFile(configPath, "utf8")) as unknown);
  } catch {
    return defaultSubscriptions;
  }
}

export async function writeSubscriptions(
  subscriptions: SourceSubscription[],
  configPath = path.resolve("workspace", "sources", "subscriptions.json")
): Promise<SourceSubscription[]> {
  const valid = normalizeSubscriptions({ subscriptions });
  const userSubscriptionCount = subscriptions.filter((subscription) => subscription.type !== "aihot").length;
  if (valid.length !== userSubscriptionCount) {
    throw new Error("Invalid subscription config.");
  }
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ subscriptions: valid }, null, 2), "utf8");
  return valid;
}

function classifySourceError(error: unknown): SourceHealthErrorCategory {
  const message = error instanceof Error ? error.message : String(error);
  if (/404|not found/i.test(message)) return "unsupported";
  if (/fetch|network|ENOTFOUND|ECONN|timeout|HTTP|failed/i.test(message)) return "network";
  if (/JSON|XML|parse|Unexpected token/i.test(message)) return "parse";
  return "unknown";
}

function stableId(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(31, hash) + input.charCodeAt(index) | 0;
  }
  return Math.abs(hash).toString(36);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^rsshub:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function titleFromSource(source: string): string {
  const normalized = source.replace(/^rsshub:\/\//, "").replace(/^https?:\/\//, "").replace(/[?#].*$/, "");
  const lastParts = normalized.split("/").filter(Boolean).slice(-2);
  const title = lastParts.join(" ").replace(/[-_]+/g, " ").replace(/\b\w/g, (match) => match.toUpperCase()).trim();
  return title || "未命名订阅源";
}

export function createSubscriptionId(type: UserSubscriptionType, normalizedSource: string): string {
  const resolved = resolveRssHubSource(normalizedSource);
  if (type === "rsshub" && resolved.route) {
    return `rsshub-${slugify(resolved.route) || stableId(normalizedSource)}`;
  }
  return `${type}-${slugify(normalizedSource) || stableId(normalizedSource)}`;
}

function sourceHealthFromPreview(subscription: SourceSubscription, preview: SubscriptionPreviewResult, checkedAt = new Date().toISOString()): SourceHealth {
  return {
    id: subscription.id,
    title: subscription.title,
    type: subscription.type,
    source: subscription.source,
    enabled: subscription.enabled,
    status: subscription.enabled ? (preview.ok ? "healthy" : preview.itemCount === 0 && preview.errorCategory === "empty" ? "empty" : "failed") : "disabled",
    errorCategory: subscription.enabled ? preview.errorCategory === "not_found" ? "unsupported" : preview.errorCategory : "disabled",
    itemCount: preview.itemCount,
    checkedAt,
    message: preview.message,
    sampleItems: preview.sampleItems
  };
}

function sampleItemsFromPreview(adapter: RssHubSourceAdapter, preview: RssHubPreview): SourceHealth["sampleItems"] {
  return preview.rawItems.slice(0, 5).map((item) => {
    const normalized = adapter.normalize(item);
    return {
      id: normalized.id,
      title: normalized.title,
      url: normalized.url,
      summary: normalized.summary,
      publishedAt: normalized.publishedAt,
      collectorAdapter: normalized.collectorAdapter
    };
  });
}

export async function previewSubscription(draft: SubscriptionDraft): Promise<SubscriptionPreviewResult> {
  const source = draft.source.trim();
  const type = draft.type === "rsshub" ? "rsshub" : "rss";
  const rssHubConfig = await readRssHubConfig();
  const adapter = new RssHubSourceAdapter({ baseUrl: rssHubConfig?.baseUrl });
  const resolved = resolveRssHubSource(source, rssHubConfig?.baseUrl);
  const normalizedSource = type === "rsshub" && resolved.mode === "route" ? resolved.normalizedSource : source;

  if (!source) {
    return {
      ok: false,
      type,
      source,
      normalizedSource,
      resolvedUrl: resolved.resolvedUrl,
      route: resolved.route,
      usesConfiguredBaseUrl: resolved.usesConfiguredBaseUrl,
      title: draft.titleOverride?.trim() || "未命名订阅源",
      itemCount: 0,
      message: "请先填写 RSS URL 或 RSSHub route。",
      errorCategory: "unsupported",
      sampleItems: []
    };
  }

  try {
    const preview = await adapter.preview(source);
    const itemCount = preview.rawItems.length;
    const title = draft.titleOverride?.trim() || preview.title || titleFromSource(preview.resolved.route ?? source);
    return {
      ok: itemCount > 0,
      type,
      source,
      normalizedSource: type === "rsshub" && preview.resolved.mode === "route" ? preview.resolved.normalizedSource : source,
      resolvedUrl: preview.resolved.resolvedUrl,
      route: preview.resolved.route,
      usesConfiguredBaseUrl: preview.resolved.usesConfiguredBaseUrl,
      title,
      itemCount,
      message: itemCount > 0 ? `预览成功，抓到 ${itemCount} 条内容。` : "订阅源可以访问，但没有解析到条目。",
      errorCategory: itemCount > 0 ? "none" : "empty",
      sampleItems: sampleItemsFromPreview(adapter, preview)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorCategory = /404|not found/i.test(message) ? "not_found" : classifySourceError(error);
    return {
      ok: false,
      type,
      source,
      normalizedSource,
      resolvedUrl: resolved.resolvedUrl,
      route: resolved.route,
      usesConfiguredBaseUrl: resolved.usesConfiguredBaseUrl,
      title: draft.titleOverride?.trim() || titleFromSource(resolved.route ?? source),
      itemCount: 0,
      message,
      errorCategory,
      sampleItems: []
    };
  }
}

export async function buildSubscriptionFromDraft(draft: SubscriptionDraft): Promise<{ subscription: SourceSubscription; preview: SubscriptionPreviewResult; health: SourceHealth }> {
  const preview = await previewSubscription(draft);
  const subscription: SourceSubscription = {
    id: draft.existingId?.trim() || createSubscriptionId(preview.type, preview.normalizedSource),
    title: preview.title,
    type: preview.type,
    source: preview.normalizedSource,
    enabled: draft.enabled !== false,
    priority: preview.type === "rsshub" ? 2 : 3,
    tags: preview.type === "rsshub" ? ["rsshub"] : ["rss"]
  };
  return {
    subscription,
    preview,
    health: sourceHealthFromPreview(subscription, preview)
  };
}

export async function checkSourceHealth(subscription: SourceSubscription): Promise<SourceHealth> {
  const checkedAt = new Date().toISOString();
  if (!subscription.enabled) {
    return {
      id: subscription.id,
      title: subscription.title,
      type: subscription.type,
      source: subscription.source,
      enabled: false,
      status: "disabled",
      errorCategory: "disabled",
      itemCount: 0,
      checkedAt,
      message: "Subscription is disabled.",
      sampleItems: []
    };
  }

  const rssHubConfig = subscription.type === "aihot" ? undefined : await readRssHubConfig();
  const adapter = subscription.type === "aihot" ? new AiHotSourceAdapter() : new RssHubSourceAdapter({ baseUrl: rssHubConfig?.baseUrl });
  try {
    const raw = await adapter.collect(subscription.source);
    const items = raw.map((item) => adapter.normalize(item));
    return {
      id: subscription.id,
      title: subscription.title,
      type: subscription.type,
      source: subscription.source,
      enabled: true,
      status: items.length > 0 ? "healthy" : "empty",
      errorCategory: items.length > 0 ? "none" : "empty",
      itemCount: items.length,
      checkedAt,
      message: items.length > 0 ? `Validated ${items.length} source items.` : "Source responded but produced no items.",
      sampleItems: items.slice(0, 5).map((item) => ({
        id: item.id,
        title: item.title,
        url: item.url,
        summary: item.summary,
        publishedAt: item.publishedAt,
        collectorAdapter: item.collectorAdapter
      }))
    };
  } catch (error) {
    return {
      id: subscription.id,
      title: subscription.title,
      type: subscription.type,
      source: subscription.source,
      enabled: true,
      status: "failed",
      errorCategory: classifySourceError(error),
      itemCount: 0,
      checkedAt,
      message: error instanceof Error ? error.message : String(error),
      sampleItems: []
    };
  }
}

export async function checkSourcesHealth(subscriptions: SourceSubscription[]): Promise<SourceHealth[]> {
  return Promise.all(subscriptions.map((subscription) => checkSourceHealth(subscription)));
}
