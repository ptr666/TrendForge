export type Platform = "review" | "wechat" | "xhs";

export type CollectorAdapterName = "aihot" | "rsshub" | "browseract" | "mediacrawler" | "manual" | "api";

export type ComplianceStatus = "not_required" | "pending" | "approved" | "rejected";

export interface SourceItem {
  id: string;
  sourceType: string;
  collectorAdapter: CollectorAdapterName;
  complianceStatus: ComplianceStatus;
  title: string;
  url: string;
  summary?: string;
  rawText?: string;
  publishedAt?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface VerifiedArticle {
  sourceItemId: string;
  status: "pending" | "verified" | "partial" | "failed";
  method: "aihot" | "rss" | "http" | "browseract" | "mediacrawler" | "manual";
  evidenceUrl?: string;
  fullText?: string;
  failureReason?: string;
}

export interface CandidateSelection {
  sourceItemId: string;
  score: number;
  reason: string;
  targetPlatforms: Platform[];
  angle?: string;
  tags: string[];
}

export interface ArticleSummary {
  sourceItemId: string;
  title: string;
  summary: string;
  angle: string;
  keyPoints: string[];
  riskNotes: string[];
}

export interface PlatformDraft {
  id: string;
  sourceItemId: string;
  platform: Platform;
  title: string;
  body: string;
  digest?: string;
  tone?: string;
  tags?: string[];
  assetIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface MediaAsset {
  id: string;
  draftId: string;
  type: "cover" | "inline_image" | "xhs_image" | "preview";
  source: "generated" | "local" | "remote" | "placeholder";
  path?: string;
  prompt?: string;
  ratio?: string;
}

export interface PublishResult {
  draftId: string;
  platform: Platform;
  status: "queued" | "success" | "failed" | "skipped";
  externalId?: string;
  message?: string;
  verificationSignal?: string;
}

export interface SourceSubscription {
  id: string;
  title: string;
  type: "aihot" | "rss" | "rsshub";
  source: string;
  enabled: boolean;
  priority?: number;
  tags?: string[];
}

export interface PipelineRunRequest {
  runId: string;
  query: string;
  requestedPlatforms: Platform[];
  allowBrowserFallback?: boolean;
  allowMediaCrawlerFallback?: boolean;
  allowRealDraft?: boolean;
  dryRunPublish?: boolean;
  topN?: number;
}

export interface PipelineRunResult {
  runId: string;
  status: "success" | "partial" | "failed";
  startedAt: string;
  finishedAt: string;
  sourceItems: SourceItem[];
  verifiedArticles: VerifiedArticle[];
  selections: CandidateSelection[];
  summaries: ArticleSummary[];
  drafts: PlatformDraft[];
  assets: MediaAsset[];
  publishResults: PublishResult[];
  errors: Array<{ stage: string; message: string }>;
}

export interface SourceAdapter {
  name: CollectorAdapterName;
  healthcheck(): Promise<{ ok: boolean; message?: string }>;
  collect(queryOrSource: string): Promise<unknown[]>;
  normalize(rawResult: unknown): SourceItem;
  explainFailure(error: unknown): string;
}

export interface Verifier {
  verify(item: SourceItem): Promise<VerifiedArticle>;
  fetchFullText(item: SourceItem): Promise<VerifiedArticle>;
  recordEvidence(article: VerifiedArticle): Promise<void>;
}

export interface Selector {
  score(article: VerifiedArticle): Promise<CandidateSelection>;
  selectTopN(selections: CandidateSelection[], limit: number): CandidateSelection[];
}

export interface DraftGenerator {
  generateReviewDraft(selection: CandidateSelection, article: VerifiedArticle, summary: ArticleSummary): Promise<PlatformDraft>;
  generateWechatDraft(selection: CandidateSelection, article: VerifiedArticle, summary: ArticleSummary): Promise<PlatformDraft>;
  generateXhsDraft(selection: CandidateSelection, article: VerifiedArticle, summary: ArticleSummary): Promise<PlatformDraft>;
}

export interface TextProvider {
  summarize(article: VerifiedArticle, selection: CandidateSelection): Promise<ArticleSummary>;
}

export interface ImageProvider {
  planPrompt(draft: PlatformDraft, asset: MediaAsset): Promise<MediaAsset>;
}

export interface MediaComposer {
  planAssets(draft: PlatformDraft): Promise<MediaAsset[]>;
  generateAssets(assets: MediaAsset[]): Promise<MediaAsset[]>;
  attachAssets(draft: PlatformDraft, assets: MediaAsset[]): Promise<PlatformDraft>;
}

export interface PublisherAdapter {
  platform: Exclude<Platform, "review">;
  healthcheck(): Promise<{ ok: boolean; message?: string }>;
  preview(draft: PlatformDraft): Promise<{ ok: boolean; path?: string; message?: string }>;
  publishDraft(draft: PlatformDraft): Promise<PublishResult>;
  readLastResult(): Promise<PublishResult | undefined>;
}

export interface RunStore {
  saveRun(result: PipelineRunResult): Promise<void>;
  appendEvent(runId: string, event: Record<string, unknown>): Promise<void>;
  readRun(runId: string): Promise<PipelineRunResult | undefined>;
  readEvents(runId: string): Promise<Array<Record<string, unknown>>>;
  listRuns(): Promise<Array<{ runId: string; path: string; updatedAt: string }>>;
}
