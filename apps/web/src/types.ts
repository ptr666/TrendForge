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

export interface SubscriptionDraft {
  existingId?: string;
  type: "rss" | "rsshub";
  source: string;
  enabled: boolean;
  titleOverride?: string;
}

export interface SubscriptionPreview {
  ok: boolean;
  type: "rss" | "rsshub";
  source: string;
  normalizedSource: string;
  resolvedUrl?: string;
  route?: string;
  usesConfiguredBaseUrl: boolean;
  title: string;
  itemCount: number;
  message: string;
  errorCategory: string;
  sampleItems: SourceHealth["sampleItems"];
}

export interface AiHotLatest {
  source: SourceSubscription;
  health: SourceHealth;
  items: Array<Record<string, unknown>>;
  checkedAt: string;
}

export interface RunSummary {
  runId: string;
  path?: string;
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

export interface PublicImageModelConfig {
  enabled: boolean;
  provider: "none" | "openai-compatible";
  baseUrl: string;
  model: string;
  keyConfigured: boolean;
  keyPreview?: string;
}

export interface PublicRssHubConfig {
  baseUrl: string;
  configured: boolean;
}

export interface PublicWechatConfig {
  enabled: boolean;
  appId: string;
  secretConfigured: boolean;
  secretPreview?: string;
  coverMediaId?: string;
  coverImagePath?: string;
  legacyCredentialSource?: string;
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
  imageModel?: PublicImageModelConfig;
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
  message?: string;
  summary?: Record<string, unknown>;
  items?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface AcceptedRun {
  ok: boolean;
  runId: string;
  status: "accepted";
}

export type TaskKind = "screen" | "drafts" | "publish";

export interface TaskProgress {
  kind: TaskKind;
  runId: string;
  title: string;
  startedAt: number;
  currentStage: string;
  processedCount: number;
  elapsedMs: number;
  status: "running" | "success" | "partial" | "failed";
  failureReason?: string;
}

export interface CandidateReview {
  sourceItemId: string;
  title: string;
  url: string;
  sourceType: string;
  collectorAdapter: string;
  publishedAt?: string;
  brief?: string;
  score: number;
  reason: string;
  angle?: string;
  tags: string[];
  originalStatus: "pending" | "verified" | "partial" | "failed";
  originalMethod: string;
  originalArtifactPath?: string;
  originalPreview?: string;
  summary: {
    sourceItemId: string;
    title: string;
    translatedOriginal?: string;
    summary: string;
    angle: string;
    keyPoints: string[];
    riskNotes: string[];
  };
  riskNotes: string[];
  skippedReason?: string;
  summaryFallback?: boolean;
  fullTextStatus?: "pending" | "verified" | "partial" | "failed";
  scoreReason?: string;
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
  candidateReviews?: CandidateReview[];
  skippedItems?: Array<Record<string, unknown>>;
  summaries: Array<Record<string, unknown>>;
  drafts: Array<{ id: string; sourceItemId: string; platform: Platform; title: string; artifactPath?: string; body?: string; digest?: string; assetIds?: string[] }>;
  assets: Array<{
    id: string;
    draftId: string;
    platform?: Platform;
    type: string;
    role?: string;
    index?: number;
    revision?: number;
    filename?: string;
    source: string;
    status?: string;
    ratio?: string;
    prompt?: string;
    altText?: string;
    stylePrompt?: string;
    previewUrl?: string;
    errorMessage?: string;
    path?: string;
  }>;
  publishResults: Array<Record<string, unknown>>;
  reviewQueue?: ReviewQueueItem[];
  errors: Array<Record<string, unknown>>;
}

export interface Artifact {
  path: string;
  content: string;
}

export interface RunSettings {
  selectedSourceIds: string[];
  selectedAiHotItemIds: string[];
  candidateCount: number;
  selectedCandidateIds: string[];
  platforms: Platform[];
  allowBrowserFallback: boolean;
  allowMediaCrawlerFallback: boolean;
  allowRealDraft: boolean;
}
