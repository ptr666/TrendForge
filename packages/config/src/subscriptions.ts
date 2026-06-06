import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SourceHealth, SourceHealthErrorCategory, SourceSubscription } from "../../core/src/types.js";
import { AiHotSourceAdapter, RssHubSourceAdapter } from "../../sources/src/adapters.js";

export interface SubscriptionConfig {
  subscriptions: SourceSubscription[];
}

export const defaultSubscriptions: SourceSubscription[] = [
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
  return parsed.subscriptions.filter(isSubscription);
}

export async function readSubscriptions(configPath = path.resolve("workspace", "sources", "subscriptions.json")): Promise<SourceSubscription[]> {
  try {
    const subscriptions = normalizeSubscriptions(JSON.parse(await readFile(configPath, "utf8")) as unknown);
    return subscriptions.length > 0 ? subscriptions : defaultSubscriptions;
  } catch {
    return defaultSubscriptions;
  }
}

export async function writeSubscriptions(
  subscriptions: SourceSubscription[],
  configPath = path.resolve("workspace", "sources", "subscriptions.json")
): Promise<SourceSubscription[]> {
  const valid = normalizeSubscriptions({ subscriptions });
  if (valid.length !== subscriptions.length) {
    throw new Error("Invalid subscription config.");
  }
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ subscriptions: valid }, null, 2), "utf8");
  return valid;
}

function classifySourceError(error: unknown): SourceHealthErrorCategory {
  const message = error instanceof Error ? error.message : String(error);
  if (/fetch|network|ENOTFOUND|ECONN|timeout|HTTP|failed/i.test(message)) return "network";
  if (/JSON|XML|parse|Unexpected token/i.test(message)) return "parse";
  return "unknown";
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

  const adapter = subscription.type === "aihot" ? new AiHotSourceAdapter() : new RssHubSourceAdapter();
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
