export type ApiState = "idle" | "loading" | "success" | "error";
export type Platform = "review" | "wechat" | "xhs";

export interface SourceSubscription {
  id: string;
  title: string;
  type: "aihot" | "rss" | "rsshub";
  source: string;
  enabled: boolean;
  priority?: number;
  tags?: string[];
}

export interface SourceHealth {
  id: string;
  title: string;
  type: SourceSubscription["type"];
  source: string;
  enabled: boolean;
  status: "healthy" | "empty" | "failed" | "disabled";
  errorCategory: "none" | "disabled" | "network" | "parse" | "empty" | "unsupported" | "unknown";
  itemCount: number;
  checkedAt: string;
  message: string;
  sampleItems: Array<{
    id: string;
    title: string;
    url: string;
    summary?: string;
    publishedAt?: string;
    collectorAdapter: string;
  }>;
}

export interface RunSummary {
  runId: string;
  updatedAt: string;
}

export interface PublicModelConfig {
  enabled: boolean;
  provider: "deterministic" | "openai-compatible";
  baseUrl: string;
  model: string;
  keyConfigured: boolean;
  keyPreview?: string;
}

export interface PublicWechatConfig {
  enabled: boolean;
  appId: string;
  secretConfigured: boolean;
  secretPreview?: string;
  coverMediaId?: string;
}

export interface PublicXhsConfig {
  enabled: boolean;
  projectDir: string;
  bridgeUrl: string;
}

export interface PublisherHealth {
  platform: "wechat" | "xhs";
  ok: boolean;
  message?: string;
  gate?: {
    ok: boolean;
    status: "dry-run" | "blocked" | "ready";
    message: string;
  };
}

export interface ProviderState {
  browserAct?: { enabled: boolean; command: string };
  text?: { provider: string; baseUrl: string; model: string; keyConfigured: boolean; keyPreview?: string };
  localModel?: PublicModelConfig;
  wechat?: PublicWechatConfig;
  xhs?: PublicXhsConfig;
  mediaCrawler?: { enabled: boolean; requiresComplianceCheck: boolean; allowedPlatforms: string[] };
}

export interface VerificationResult {
  ok?: boolean;
  status?: string;
  count?: number;
  textLength?: number;
  preview?: string;
  failureReason?: string;
  summary?: Record<string, unknown>;
  items?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface ReviewQueueItem {
  id: string;
  runId: string;
  status: "waiting" | "needs-review" | "blocked" | "ready";
  category: "original-text" | "summary" | "draft" | "asset" | "publisher" | "pipeline";
  title: string;
  reason: string;
  action: string;
  sourceItemId?: string;
  draftId?: string;
  platform?: Platform;
  artifactPath?: string;
  evidenceUrl?: string;
  priority: "high" | "normal";
  createdAt: string;
}

export interface PipelineRun {
  runId: string;
  status: string;
  sourceItems: Array<Record<string, unknown>>;
  verifiedArticles: Array<Record<string, unknown>>;
  selections: Array<Record<string, unknown>>;
  summaries: Array<Record<string, unknown>>;
  drafts: Array<{ id: string; platform: Platform; title: string; artifactPath?: string; body?: string }>;
  assets: Array<{ id: string; draftId: string; type: string; source: string; status?: string; ratio?: string; prompt?: string; path?: string }>;
  publishResults: Array<Record<string, unknown>>;
  reviewQueue?: ReviewQueueItem[];
  errors: Array<Record<string, unknown>>;
}

export interface Artifact {
  path: string;
  content: string;
}

export interface RunSettings {
  sourceMode: "aihot" | "subscription" | "custom";
  subscriptionId: string;
  customQuery: string;
  topN: number;
  platforms: Platform[];
  allowBrowserFallback: boolean;
  allowMediaCrawlerFallback: boolean;
}
