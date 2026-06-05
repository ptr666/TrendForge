export const defaultPipeline = [
  "collect",
  "verify",
  "fetch_full_text",
  "score",
  "select",
  "rewrite",
  "compose_media",
  "publish"
] as const;

export const defaultCollectorOrder = ["rsshub", "browseract", "mediacrawler"] as const;

export const mediaCrawlerDefaults = {
  enabled: false,
  requiresComplianceCheck: true,
  allowedPlatforms: ["xhs", "dy", "bili", "wb", "zhihu"]
} as const;
