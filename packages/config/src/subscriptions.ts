import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SourceSubscription } from "../../core/src/types.js";

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

export async function readSubscriptions(configPath = path.resolve("workspace", "sources", "subscriptions.json")): Promise<SourceSubscription[]> {
  try {
    const parsed = JSON.parse(await readFile(configPath, "utf8")) as Partial<SubscriptionConfig>;
    if (!Array.isArray(parsed.subscriptions)) return defaultSubscriptions;
    const subscriptions = parsed.subscriptions.filter(isSubscription);
    return subscriptions.length > 0 ? subscriptions : defaultSubscriptions;
  } catch {
    return defaultSubscriptions;
  }
}
