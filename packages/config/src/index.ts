export const defaultPipeline = [
  "collect",
  "verify",
  "fetch_full_text",
  "score",
  "select",
  "summarize",
  "rewrite",
  "compose_media",
  "publish"
] as const;

export const defaultCollectorOrder = ["aihot", "rsshub"] as const;

export const defaultFullTextAcquisitionOrder = ["browseract", "mediacrawler"] as const;

export const aiHotDefaults = {
  enabled: true,
  skillUrl: "https://aihot.virxact.com/aihot-skill/",
  rssFallback: true
} as const;

export const mediaCrawlerDefaults = {
  enabled: false,
  requiresComplianceCheck: true,
  allowedPlatforms: ["xhs", "dy", "bili", "wb", "zhihu"]
} as const;
