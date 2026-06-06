import { mkdir, readFile, writeFile } from "node:fs/promises";
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
