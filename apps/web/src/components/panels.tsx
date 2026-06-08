import type {
  AiHotLatest,
  ApiState,
  Artifact,
  CandidateReview,
  PipelineRun,
  Platform,
  ProviderState,
  PublicImageModelConfig,
  PublicModelConfig,
  PublicWechatConfig,
  PublicXhsConfig,
  PublisherHealth,
  ReviewQueueItem,
  RunSettings,
  RunSummary,
  TaskProgress,
  VerificationResult
} from "../types.js";
import { api, apiBase } from "../api.js";
import { ActionFeedback, ArtifactContentPreview, displayLabel, MarkdownPreview, RawJsonDetails, StatusPill } from "./ui.js";

export const platformOptions: Platform[] = ["review", "wechat", "xhs"];

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stageStatus(events: Array<Record<string, unknown>>, stage: string): string {
  const latest = events.filter((event) => event.stage === stage).at(-1);
  return asString(latest?.status) || (latest ? "seen" : "idle");
}

function sourceStatusState(status?: string): string {
  if (status === "healthy") return "success";
  if (status === "failed") return "error";
  if (status === "disabled") return "idle";
  return "loading";
}

function itemId(item: Record<string, unknown>, index: number): string {
  return asString(item.id) || asString(item.url) || `aihot-item-${index}`;
}

function itemTitle(item: Record<string, unknown>, index: number): string {
  return asString(item.title) || `AIHot 消息 ${index + 1}`;
}

function itemSummary(item: Record<string, unknown>): string {
  return asString(item.summary) || asString(item.rawText) || asString(item.description) || "暂无摘要。";
}

function artifactLabel(pathValue: string): string {
  if (pathValue.includes("publisher-handoffs")) return "打开平台交接信息";
  if (pathValue.includes("full-text")) return "打开原文";
  return "打开草稿";
}

function publishArtifactPaths(run?: PipelineRun, draftId?: string): Array<{ label: string; path: string }> {
  return (run?.publishResults ?? [])
    .filter((result) => asString(result.draftId) === draftId && asString(result.artifactPath))
    .map((result) => ({
      label: `${displayLabel(asString(result.platform))}交接信息`,
      path: asString(result.artifactPath)
    }));
}

type DraftAsset = PipelineRun["assets"][number];
type DraftItem = PipelineRun["drafts"][number];

function assetImageUrl(runId: string | undefined, asset: DraftAsset): string | undefined {
  if (!runId || !asset.path || asset.status === "blocked") return undefined;
  return `${apiBase}/runs/${encodeURIComponent(runId)}/assets/${encodeURIComponent(asset.id)}/file?rev=${asset.revision ?? 1}`;
}

function draftAssets(run: PipelineRun | undefined, draft: DraftItem): DraftAsset[] {
  return (run?.assets ?? []).filter((asset) => draft.assetIds?.includes(asset.id) || asset.draftId === draft.id);
}

function coverAsset(assets: DraftAsset[]): DraftAsset | undefined {
  return assets.find((asset) => asset.type === "cover");
}

function contentAssets(assets: DraftAsset[]): DraftAsset[] {
  return assets.filter((asset) => asset.type !== "cover");
}

function draftPreviewText(draft: DraftItem): string {
  return draft.body ?? draft.digest ?? "暂无预览。";
}

function PlatformArticlePreview({ run, draft, assets }: { run?: PipelineRun; draft: DraftItem; assets: DraftAsset[] }) {
  const cover = coverAsset(assets);
  const contentImages = contentAssets(assets);
  const coverUrl = cover ? assetImageUrl(run?.runId, cover) : undefined;
  if (draft.platform === "wechat") {
    return (
      <div className="wechat-article-preview">
        {coverUrl ? <img src={coverUrl} alt={cover?.altText ?? draft.title} /> : <div className="image-placeholder">微信封面图等待生成</div>}
        <div className="wechat-preview-body">
          <h3>{draft.title}</h3>
          {draft.digest && <p className="digest">{draft.digest}</p>}
          <MarkdownPreview compact content={draftPreviewText(draft)} />
          <div className="inline-image-row">
            {contentImages.map((asset) => {
              const url = assetImageUrl(run?.runId, asset);
              return url ? <img key={asset.id} src={url} alt={asset.altText ?? asset.id} /> : <div key={asset.id} className="image-placeholder">{displayLabel(asset.status ?? "planned")}</div>;
            })}
          </div>
        </div>
      </div>
    );
  }
  if (draft.platform === "xhs") {
    const images = [cover, ...contentImages].filter(Boolean) as DraftAsset[];
    return (
      <div className="xhs-phone-preview">
        <div className="xhs-image-strip">
          {images.length === 0 && <div className="image-placeholder">小红书图文卡等待生成</div>}
          {images.map((asset) => {
            const url = assetImageUrl(run?.runId, asset);
            return url ? <img key={asset.id} src={url} alt={asset.altText ?? asset.id} /> : <div key={asset.id} className="image-placeholder">{displayLabel(asset.status ?? "planned")}</div>;
          })}
        </div>
        <h3>{draft.title}</h3>
        <MarkdownPreview compact content={draftPreviewText(draft)} />
      </div>
    );
  }
  return <MarkdownPreview compact content={draftPreviewText(draft)} />;
}

function friendlyHealthMessage(message?: string): string {
  if (!message) return "等待最新日报状态。";
  const sourceMatch = message.match(/Validated\s+(\d+)\s+source items/i);
  if (sourceMatch) return `已获取 ${sourceMatch[1]} 条热点信息。`;
  return message;
}

function friendlyPublisherMessage(platform: "wechat" | "xhs", message?: string): string {
  if (!message) return platform === "wechat" ? "尚未检查微信草稿箱连接。" : "尚未检查小红书草稿连接。";
  if (/credentials.*token.*cover image upload.*ready/i.test(message)) return "微信草稿箱已就绪，可以在确认后创建草稿。";
  if (/requires XHS config enabled=true/i.test(message)) return "小红书草稿连接尚未启用，请到配置区完成登录和扩展检查。";
  if (/enabled=true.*appId.*appSecret/i.test(message)) return "微信草稿箱尚未就绪，请先保存 AppID、AppSecret 并完成连接检查。";
  return message;
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}分${rest}秒` : `${rest}秒`;
}

export function TaskProgressPanel({ progress, events }: { progress?: TaskProgress; events?: Array<Record<string, unknown>> }) {
  if (!progress) return null;
  const issueReason = progress.failureReason;
  const issueLabel = progress.status === "failed" ? "失败原因" : "处理提醒";
  const pillState = progress.status === "failed" ? "error" : progress.status === "partial" ? "warn" : progress.status === "success" ? "success" : "loading";
  return (
    <article className={`task-progress ${progress.status}`}>
      <div className="section-title compact">
        <div>
          <p className="eyebrow">长任务进度</p>
          <h3>{progress.title}</h3>
        </div>
        <StatusPill state={pillState} label={progress.status} />
      </div>
      <div className="progress-metrics">
        <span><strong>{displayLabel(progress.currentStage)}</strong>当前阶段</span>
        <span><strong>{progress.processedCount}</strong>已处理数量</span>
        <span><strong>{formatElapsed(progress.elapsedMs)}</strong>耗时</span>
      </div>
      {issueReason && <p className="risk-note">{issueLabel}：{issueReason}</p>}
      <RawJsonDetails data={events} label="查看阶段事件" />
    </article>
  );
}

export interface QueueMetrics {
  blocked: number;
  waiting: number;
  review: number;
}

export function Sidebar() {
  const sections = [
    ["overview", "总览"],
    ["aihot", "AIHot 日报"],
    ["screen", "热点分析"],
    ["candidates", "候选评审"],
    ["drafts", "草稿生成"],
    ["history", "运行历史"],
    ["config", "配置"]
  ];
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">TF</span>
        <div>
          <h1>TrendForge</h1>
          <p>AI 热点内容工作台</p>
        </div>
      </div>
      <nav aria-label="工作台导航">
        {sections.map(([id, label], index) => (
          <a href={`#${id}`} key={id}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {label}
          </a>
        ))}
      </nav>
    </aside>
  );
}

export function Hero({
  health,
  refresh,
  selectedAiHotCount,
  candidateCount,
  draftCount
}: {
  health: ApiState;
  refresh: () => void;
  selectedAiHotCount: number;
  candidateCount: number;
  draftCount: number;
}) {
  return (
    <header className="hero" id="overview">
      <div>
        <p className="eyebrow">AIHot-only 工作流</p>
        <h2>先读日报，再做热点分析，最后生成可交接的平台草稿。</h2>
        <p className="hero-copy">
          当前阶段只开放 AIHot 固定信息源。入选候选会优先从原文链接抓取正文，再通过文本模型生成中文译文、中文总结、评分理由和平台草稿。
        </p>
      </div>
      <div className="hero-actions">
        <StatusPill state={health} label={`API ${displayLabel(health)}`} />
        <button onClick={refresh} disabled={health === "loading"}>刷新工作台</button>
        <div className="hero-summary" aria-label="当前流程摘要">
          <span><strong>{selectedAiHotCount}</strong> 条 AIHot 已选</span>
          <span><strong>{candidateCount}</strong> 条候选</span>
          <span><strong>{draftCount}</strong> 份草稿</span>
        </div>
      </div>
    </header>
  );
}

export function StatusGrid({
  providers,
  publisherHealth,
  modelConfig,
  reviewQueue,
  queueMetrics,
  aiHotLatest
}: {
  providers: ProviderState;
  publisherHealth: PublisherHealth[];
  modelConfig: PublicModelConfig;
  reviewQueue: ReviewQueueItem[];
  queueMetrics: QueueMetrics;
  aiHotLatest?: AiHotLatest;
}) {
  const wechatHealth = publisherHealth.find((publisher) => publisher.platform === "wechat");
  const xhsHealth = publisherHealth.find((publisher) => publisher.platform === "xhs");
  return (
    <section className="grid status-grid">
      <article className="card">
        <h3>AIHot</h3>
        <p>{friendlyHealthMessage(aiHotLatest?.health.message)}</p>
        <StatusPill state={sourceStatusState(aiHotLatest?.health.status)} label={aiHotLatest?.health.status ?? "loading"} />
      </article>
      <article className="card">
        <h3>文本模型</h3>
        <p>{modelConfig.enabled ? `${modelConfig.model || "文本模型"} 已启用。` : "未启用真实模型时，只生成本地占位总结。"}</p>
        <StatusPill state={modelConfig.keyConfigured || modelConfig.provider === "deterministic"} label={modelConfig.enabled ? "已启用" : "本地模式"} />
      </article>
      <article className="card">
        <h3>原文获取</h3>
        <p>默认从原文链接抓取正文；需要时可启用浏览器或采集器补全。</p>
        <StatusPill state="success" label={providers.browserAct?.enabled ? "浏览器补全已启用" : "链接抓取就绪"} />
      </article>
      <article className="card">
        <h3>平台交接</h3>
        <p>微信：{friendlyPublisherMessage("wechat", wechatHealth?.gate?.message)} / 小红书：{friendlyPublisherMessage("xhs", xhsHealth?.gate?.message)}</p>
        <StatusPill state={queueMetrics.blocked > 0 ? "error" : reviewQueue.length > 0 ? "loading" : "success"} label={`${queueMetrics.blocked} 个阻塞`} />
      </article>
    </section>
  );
}

export function AiHotDailyPanel({
  aiHotLatest,
  selectedIds,
  toggleItem,
  selectAll,
  clearSelection,
  refresh,
  busy
}: {
  aiHotLatest?: AiHotLatest;
  selectedIds: string[];
  toggleItem: (sourceItemId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  refresh: () => void;
  busy?: string;
}) {
  const items = aiHotLatest?.items ?? [];
  const health = aiHotLatest?.health;
  const allSelected = items.length > 0 && selectedIds.length === items.length;

  return (
    <section className="panel aihot-panel" id="aihot">
      <div className="section-title">
        <div>
          <p className="eyebrow">AIHot 日报</p>
          <h2>完整阅读每日热点，然后选择进入分析的条目。</h2>
          <p className="helper">左侧是可滚动日报全文，右侧是可勾选条目卡片。全选会真实限制后端只分析这些 AIHot 条目。</p>
        </div>
        <div className="action-row compact-actions">
          <button type="button" onClick={refresh} disabled={busy === "refresh"}>刷新 AIHot</button>
          <button type="button" onClick={allSelected ? clearSelection : selectAll} disabled={items.length === 0}>
            {allSelected ? "取消全选" : "全选今日 AIHot"}
          </button>
        </div>
      </div>
      <div className="aihot-summary-bar">
        <StatusPill state={sourceStatusState(health?.status)} label={health?.status ?? "loading"} />
        <span>{health?.itemCount ?? items.length} 条内容</span>
        <span>已选择 {selectedIds.length} / 共 {items.length} 条</span>
        <span>{aiHotLatest?.checkedAt ? new Date(aiHotLatest.checkedAt).toLocaleString() : "尚未刷新"}</span>
      </div>
      {health?.status === "failed" && (
        <article className="notice-card danger">
          <strong>AIHot 获取失败</strong>
          <p>{health.message || "请检查 AIHot skill 地址、网络或本地代理配置后重试。"}</p>
        </article>
      )}
      <div className="aihot-layout">
        <article className="daily-reader" aria-label="AIHot 每日完整内容">
          <div className="section-title compact">
            <h3>今日日报全文</h3>
            <span>{items.length} 条</span>
          </div>
          <div className="daily-article">
            {items.length === 0 && <p className="helper">暂无 AIHot 内容。点击刷新后，如果仍为空，请查看状态提示。</p>}
            {items.map((item, index) => {
              const url = asString(item.url);
              return (
                <section className="daily-entry" key={itemId(item, index)}>
                  <span className="daily-index">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h4>{itemTitle(item, index)}</h4>
                    <p>{itemSummary(item)}</p>
                    {url && url !== "about:blank" && <a href={url} target="_blank" rel="noreferrer">打开来源链接</a>}
                  </div>
                </section>
              );
            })}
          </div>
        </article>
        <div className="aihot-item-list" aria-label="AIHot 条目列表">
          {items.length === 0 && <p className="helper">暂无条目可选。</p>}
          {items.map((item, index) => {
            const id = itemId(item, index);
            const selected = selectedIds.includes(id);
            const url = asString(item.url);
            return (
              <article className={`aihot-item-card ${selected ? "selected" : ""}`} key={id}>
                <label className="select-line">
                  <span>
                    <input type="checkbox" checked={selected} onChange={() => toggleItem(id)} />
                    选入热点分析
                  </span>
                </label>
                <h3>{itemTitle(item, index)}</h3>
                <p>{itemSummary(item)}</p>
                <div className="tag-row">
                  {Array.isArray(item.tags) && item.tags.slice(0, 4).map((tag) => <span key={String(tag)}>{String(tag)}</span>)}
                </div>
                {url && url !== "about:blank" && <a href={url} target="_blank" rel="noreferrer">打开来源链接</a>}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function ScreenPanel({
  aiHotLatest,
  runSettings,
  setRunSettings,
  selectedAiHotItemIds,
  screenCandidates,
  runEvents,
  taskProgress,
  busy
}: {
  aiHotLatest?: AiHotLatest;
  runSettings: RunSettings;
  setRunSettings: (settings: RunSettings) => void;
  selectedAiHotItemIds: string[];
  screenCandidates: () => void;
  runEvents: Array<Record<string, unknown>>;
  taskProgress?: TaskProgress;
  busy?: string;
}) {
  const stages = ["collect", "verify", "score", "fetch_full_text", "summarize", "candidate_review"];
  const canRun = selectedAiHotItemIds.length > 0 && aiHotLatest?.health.status !== "failed";
  return (
    <section className="panel" id="screen">
      <div className="section-title">
        <div>
          <p className="eyebrow">热点分析</p>
          <h2>从已选 AIHot 信息中筛出 {runSettings.candidateCount} 条候选。</h2>
          <p className="helper">筛选完成后不会自动生成草稿。请先查看原文、中文译文、总结、评分和原因，再人工选择进入草稿阶段。</p>
        </div>
        <button disabled={busy === "screen" || !canRun} onClick={screenCandidates}>分析选中内容</button>
      </div>
      {!canRun && (
        <article className="notice-card">
          <strong>还不能开始分析</strong>
          <p>请先在 AIHot 日报中至少选择一条信息。如果 AIHot 获取失败，请刷新后再试。</p>
        </article>
      )}
      <div className="analysis-control-grid">
        <label>最终候选数量
          <input type="number" min={1} max={20} value={runSettings.candidateCount} onChange={(event) => setRunSettings({ ...runSettings, candidateCount: Math.max(1, Number(event.target.value) || 1) })} />
        </label>
        <label>已选 AIHot 数量
          <input readOnly value={`${selectedAiHotItemIds.length} 条`} />
        </label>
      </div>
      <div className="toggle-row">
        <label><span><input type="checkbox" checked={runSettings.allowBrowserFallback} onChange={(event) => setRunSettings({ ...runSettings, allowBrowserFallback: event.target.checked })} /> 原文抓取失败时，允许使用浏览器补全</span></label>
        <label><span><input type="checkbox" checked={runSettings.allowMediaCrawlerFallback} onChange={(event) => setRunSettings({ ...runSettings, allowMediaCrawlerFallback: event.target.checked })} /> 允许使用采集器补全原文</span></label>
      </div>
      <div className="timeline">
        {stages.map((stage) => <span className={stageStatus(runEvents, stage)} key={stage}>{displayLabel(stage)}<small>{displayLabel(stageStatus(runEvents, stage))}</small></span>)}
      </div>
      <TaskProgressPanel progress={taskProgress} events={runEvents} />
    </section>
  );
}

export function CandidateReviewList({
  candidates,
  selectedIds,
  toggleCandidate,
  selectAll,
  clearSelection,
  loadArtifact
}: {
  candidates: CandidateReview[];
  selectedIds: string[];
  toggleCandidate: (sourceItemId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  loadArtifact: (artifactPath: string, title?: string) => void;
}) {
  const allSelected = candidates.length > 0 && selectedIds.length === candidates.length;
  return (
    <section className="panel" id="candidates">
      <div className="section-title">
        <div>
          <p className="eyebrow">候选评审</p>
          <h2>查看原文、中文译文、总结和评分，再决定哪些进入草稿生成。</h2>
        </div>
        <div className="action-row compact-actions">
          <StatusPill state={candidates.length > 0 ? "success" : "idle"} label={`${candidates.length} 条候选`} />
          <button type="button" disabled={candidates.length === 0} onClick={allSelected ? clearSelection : selectAll}>{allSelected ? "取消全选候选" : "全选候选"}</button>
        </div>
      </div>
      <div className="candidate-list">
        {candidates.length === 0 && <p className="helper">还没有候选。请先在“热点分析”中运行一次分析。</p>}
        {candidates.map((candidate) => (
          <article className={`candidate-card ${selectedIds.includes(candidate.sourceItemId) ? "selected" : ""}`} key={candidate.sourceItemId}>
            <div className="candidate-main">
              <label className="select-line"><span><input type="checkbox" checked={selectedIds.includes(candidate.sourceItemId)} onChange={() => toggleCandidate(candidate.sourceItemId)} /> 进入草稿生成</span></label>
              <div className="candidate-title">
                <h3>{candidate.title}</h3>
                <StatusPill state={candidate.originalStatus === "failed" ? "error" : candidate.originalStatus === "verified" ? "success" : "loading"} label={candidate.originalStatus} />
              </div>
              <div className="score-row">
                <strong>{candidate.score}</strong>
                <span><i style={{ width: `${Math.max(0, Math.min(100, candidate.score))}%` }} /></span>
                <small>{displayLabel(candidate.collectorAdapter)} / {candidate.publishedAt ? new Date(candidate.publishedAt).toLocaleString() : "未提供时间"}</small>
              </div>
              <div className="candidate-detail-grid">
                <details open>
                  <summary>查看原因</summary>
                  <p>{candidate.reason}</p>
                  {candidate.angle && <p className="helper">角度：{candidate.angle}</p>}
                </details>
                <details open>
                  <summary>查看总结</summary>
                  <p>{candidate.summary.summary}</p>
                  <ul>
                    {candidate.summary.keyPoints.map((point) => <li key={point}>{point}</li>)}
                  </ul>
                </details>
                <details>
                  <summary>查看中文译文</summary>
                  <MarkdownPreview compact content={candidate.summary.translatedOriginal ?? "真实文本模型未返回中文译文。请确认 OpenAI-compatible 模型已启用并重新分析。"} />
                </details>
                <details>
                  <summary>查看评分</summary>
                  <p>评分：{candidate.score} / 100</p>
                  <p className="helper">原文状态：{displayLabel(candidate.originalStatus)}，获取方式：{displayLabel(candidate.originalMethod)}。</p>
                </details>
                <details>
                  <summary>查看原文</summary>
                  <MarkdownPreview compact content={candidate.originalPreview ?? candidate.brief ?? "暂无原文预览。"} />
                  <div className="action-row">
                    {candidate.url !== "about:blank" && <a href={candidate.url} target="_blank" rel="noreferrer">打开来源链接</a>}
                    {candidate.originalArtifactPath && <button type="button" onClick={() => loadArtifact(candidate.originalArtifactPath ?? "", `原文：${candidate.title}`)}>{artifactLabel(candidate.originalArtifactPath)}</button>}
                  </div>
                </details>
              </div>
              {candidate.riskNotes.length > 0 && <p className="risk-note">风险提示：{candidate.riskNotes.join("；")}</p>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function DraftPreviewGrid({
  run,
  selectedCandidateIds,
  runSettings,
  setRunSettings,
  togglePlatform,
  generateDrafts,
  loadArtifact,
  taskProgress,
  busy
}: {
  run?: PipelineRun;
  selectedCandidateIds: string[];
  runSettings: RunSettings;
  setRunSettings: (settings: RunSettings) => void;
  togglePlatform: (platform: Platform) => void;
  generateDrafts: () => void;
  loadArtifact: (artifactPath: string, title?: string) => void;
  taskProgress?: TaskProgress;
  busy?: string;
}) {
  const drafts = run?.drafts ?? [];
  return (
    <section className="panel" id="drafts">
      <div className="section-title">
        <div>
          <p className="eyebrow">草稿生成</p>
          <h2>只为已勾选候选生成评审稿、微信公众号和小红书草稿。</h2>
        <p className="helper">默认只生成本地草稿。确认内容后，再单独推进微信或小红书草稿箱；图片模型未配置时不会申请图片生成。</p>
        </div>
        <button disabled={busy === "drafts" || !run || selectedCandidateIds.length === 0} onClick={generateDrafts}>生成草稿</button>
      </div>
      <div className="toggle-row">
        {platformOptions.map((platform) => (
          <label key={platform}><span><input type="checkbox" checked={runSettings.platforms.includes(platform)} onChange={() => togglePlatform(platform)} /> {displayLabel(platform)}</span></label>
        ))}
        <label><span><input type="checkbox" checked={runSettings.allowRealDraft} onChange={(event) => setRunSettings({ ...runSettings, allowRealDraft: event.target.checked })} /> 推进真实平台草稿（需二次确认）</span></label>
      </div>
      <div className="handoff-guide">
        <strong>平台推进路径</strong>
        <p>评审稿用于人工审阅；微信公众号和小红书草稿会先生成本地预览。确认内容后，再推进平台交接或真实草稿箱创建。</p>
      </div>
      <TaskProgressPanel progress={taskProgress} />
      <div className="draft-grid">
        {drafts.length === 0 && <p className="helper">候选评审后勾选内容，再生成 review、微信公众号和小红书草稿。</p>}
        {drafts.map((draft) => {
          const assets = (run?.assets ?? []).filter((asset) => draft.assetIds?.includes(asset.id) || asset.draftId === draft.id);
          const publish = (run?.publishResults ?? []).find((result) => asString(result.draftId) === draft.id);
          const handoffs = publishArtifactPaths(run, draft.id);
          return (
            <article className="draft-card" key={draft.id}>
              <span>{displayLabel(draft.platform)}</span>
              <h3>{draft.title}</h3>
              <MarkdownPreview compact content={draft.body ?? draft.digest ?? "暂无预览。"} />
              {assets.length === 0 && <p className="helper">未配置图片生成模型，本次未生成图片资产申请。</p>}
              <div className="asset-list">
                {assets.map((asset) => (
                  <small key={asset.id}>图片：{displayLabel(asset.type)} / {asset.ratio ?? "默认比例"} / {displayLabel(asset.status ?? "planned")}</small>
                ))}
              </div>
              {publish && <small>平台交接：{displayLabel(asString(publish.status))} / {asString(publish.message) || asString(publish.verificationSignal) || "已生成交接信息"}</small>}
              <div className="action-row">
                {draft.artifactPath && <button type="button" onClick={() => loadArtifact(draft.artifactPath ?? "", `${displayLabel(draft.platform)}：${draft.title}`)}>{draft.platform === "review" ? "评审稿预览" : "打开草稿预览"}</button>}
                {handoffs.map((handoff) => <button type="button" key={handoff.path} onClick={() => loadArtifact(handoff.path, handoff.label)}>{handoff.label}</button>)}
              </div>
              <RawJsonDetails data={{ draft, assets, publish }} />
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function IssuesPanel({
  reviewQueue,
  queueMetrics,
  loadArtifact,
  approveAsset
}: {
  reviewQueue: ReviewQueueItem[];
  queueMetrics: QueueMetrics;
  loadArtifact: (artifactPath: string, title?: string) => void;
  approveAsset: (item: ReviewQueueItem) => void;
}) {
  return (
    <section className="issues-strip" aria-label="阻塞与提醒">
      <div className="section-title compact">
        <div>
          <p className="eyebrow">阻塞与提醒</p>
          <h2>只展示需要处理的问题，不作为主流程入口。</h2>
        </div>
        <StatusPill state={queueMetrics.blocked > 0 ? "error" : reviewQueue.length > 0 ? "loading" : "success"} label={`${reviewQueue.length} 项`} />
      </div>
      <div className="queue-list">
        {reviewQueue.length === 0 && <p className="helper">当前没有需要处理的问题。</p>}
        {reviewQueue.map((item) => (
          <article className={`queue-card ${item.status} ${item.category === "asset" ? "asset-card" : ""}`} key={item.id}>
            <div>
              <div className="queue-head">
                <StatusPill state={item.status === "blocked" ? "error" : item.status === "ready" ? "success" : "loading"} label={item.status} />
                <span>{displayLabel(item.category)}</span>
                {item.platform && <span>{displayLabel(item.platform)}</span>}
              </div>
              <h3>{item.title}</h3>
              <p>{item.reason}</p>
              <p className="helper">{item.action}</p>
            </div>
            <div className="queue-actions">
              {item.evidenceUrl && <a href={item.evidenceUrl} target="_blank" rel="noreferrer">打开来源</a>}
              {item.artifactPath && <button onClick={() => loadArtifact(item.artifactPath ?? "", item.title)}>打开产物</button>}
              {item.category === "asset" && <button type="button" onClick={() => approveAsset(item)}>批准图片</button>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function HistoryPanel({
  runs,
  runsDir,
  selectedRun,
  artifact,
  loadRun,
  loadArtifact,
  deleteRun,
  clearRuns
}: {
  runs: RunSummary[];
  runsDir?: string;
  selectedRun?: PipelineRun;
  artifact?: Artifact;
  loadRun: (runId: string) => void;
  loadArtifact: (artifactPath: string, title?: string) => void;
  deleteRun: (runId: string) => void;
  clearRuns: () => void;
}) {
  const artifactButtons = [
    ...(selectedRun?.verifiedArticles ?? [])
      .filter((article) => typeof article.fullTextArtifactPath === "string")
      .map((article) => ({ label: `原文 ${asString(article.sourceItemId)}`, path: asString(article.fullTextArtifactPath) })),
    ...(selectedRun?.drafts ?? [])
      .filter((draft) => typeof draft.artifactPath === "string")
      .map((draft) => ({ label: `${displayLabel(draft.platform)} 草稿`, path: draft.artifactPath ?? "" })),
    ...(selectedRun?.publishResults ?? [])
      .filter((result) => typeof result.artifactPath === "string")
      .map((result) => ({ label: `${displayLabel(asString(result.platform))}交接信息`, path: asString(result.artifactPath) }))
  ];
  return (
    <section className="panel" id="history">
      <div className="section-title">
        <div>
          <p className="eyebrow">运行历史</p>
          <h2>恢复、删除或清空历史运行。</h2>
          <p className="helper">共 {runs.length} 条记录。历史目录等诊断信息可在下方展开查看。</p>
          <details className="advanced-settings">
            <summary>查看历史存储位置</summary>
            <p className="helper">{runsDir ?? "未知"}</p>
          </details>
        </div>
        <button type="button" disabled={runs.length === 0} onClick={clearRuns}>清空全部</button>
      </div>
      <div className="history-layout">
        <div className="subscription-list">
          {runs.length === 0 && <p className="helper">暂无运行历史。若确认之前运行过，请展开查看历史存储位置是否一致。</p>}
          {runs.slice(0, 12).map((run) => (
            <div className="history-row" key={run.runId}>
              <button className="list-row clickable" onClick={() => loadRun(run.runId)}>
                <span className="history-run-meta">
                  <strong>{run.runId}</strong>
                  <small>{new Date(run.updatedAt).toLocaleString()}</small>
                </span>
              </button>
              <button type="button" className="danger-button" onClick={() => deleteRun(run.runId)}>删除</button>
            </div>
          ))}
        </div>
        <article className="run-detail">
          <div className="section-title compact">
            <h3>{selectedRun?.runId ?? "尚未选择运行记录"}</h3>
            {selectedRun && <StatusPill state={selectedRun.status} label={selectedRun.status} />}
          </div>
          {selectedRun && (
            <>
              <div className="metric-grid">
                <span><strong>{selectedRun.sourceItems.length}</strong> 条来源信息</span>
                <span><strong>{selectedRun.candidateReviews?.length ?? 0}</strong> 条候选</span>
                <span><strong>{selectedRun.drafts.length}</strong> 份草稿</span>
                <span><strong>{selectedRun.errors.length}</strong> 个错误</span>
              </div>
              <div className="action-row">
                {artifactButtons.map((button) => <button key={button.path} onClick={() => loadArtifact(button.path, button.label)}>{button.label}</button>)}
              </div>
              {artifact && <article className="reader"><h4>{artifact.path}</h4><ArtifactContentPreview content={artifact.content} /></article>}
              <RawJsonDetails data={selectedRun} label="查看运行原始数据" />
            </>
          )}
        </article>
      </div>
    </section>
  );
}

export function ConfigPanel({
  modelConfig,
  setModelConfig,
  modelApiKey,
  setModelApiKey,
  saveModelConfig,
  imageModelConfig,
  setImageModelConfig,
  imageModelApiKey,
  setImageModelApiKey,
  saveImageModelConfig,
  wechatConfig,
  setWechatConfig,
  wechatSecret,
  setWechatSecret,
  saveWechatConfig,
  xhsConfig,
  setXhsConfig,
  saveXhsConfig,
  busy,
  runAction,
  results
}: {
  modelConfig: PublicModelConfig;
  setModelConfig: (config: PublicModelConfig) => void;
  modelApiKey: string;
  setModelApiKey: (value: string) => void;
  saveModelConfig: () => Promise<void>;
  imageModelConfig: PublicImageModelConfig;
  setImageModelConfig: (config: PublicImageModelConfig) => void;
  imageModelApiKey: string;
  setImageModelApiKey: (value: string) => void;
  saveImageModelConfig: () => Promise<void>;
  wechatConfig: PublicWechatConfig;
  setWechatConfig: (config: PublicWechatConfig) => void;
  wechatSecret: string;
  setWechatSecret: (value: string) => void;
  saveWechatConfig: () => Promise<void>;
  xhsConfig: PublicXhsConfig;
  setXhsConfig: (config: PublicXhsConfig) => void;
  saveXhsConfig: () => Promise<void>;
  busy?: string;
  runAction: (name: string, action: () => Promise<VerificationResult>) => void;
  results: Record<string, VerificationResult>;
}) {
  return (
    <section className="panel" id="config">
      <div className="section-title">
        <div>
          <p className="eyebrow">配置</p>
          <h2>连接模型和发布平台。</h2>
          <p className="helper">先配置文本模型，再按需连接微信公众号、小红书和图片模型。密钥只保存在本地配置中，页面只显示脱敏状态。</p>
        </div>
      </div>
      <div className="settings-grid">
        <article className="settings-card">
          <div className="section-title compact">
            <h3>文本模型服务</h3>
            <button onClick={() => void saveModelConfig()}>保存模型</button>
          </div>
          <label><span><input type="checkbox" checked={modelConfig.enabled} onChange={(event) => setModelConfig({ ...modelConfig, enabled: event.target.checked })} /> 启用真实文本模型</span></label>
          <label>模型服务<select value={modelConfig.provider} onChange={(event) => setModelConfig({ ...modelConfig, provider: event.target.value as PublicModelConfig["provider"] })}><option value="deterministic">本地占位模式</option><option value="openai-compatible">OpenAI-compatible 接口</option></select></label>
          <label>服务地址<input value={modelConfig.baseUrl} onChange={(event) => setModelConfig({ ...modelConfig, baseUrl: event.target.value })} /></label>
          <label>模型名称<input value={modelConfig.model} onChange={(event) => setModelConfig({ ...modelConfig, model: event.target.value })} /></label>
          <label>接口密钥<input type="password" value={modelApiKey} placeholder={modelConfig.keyPreview ?? "新的接口密钥"} onChange={(event) => setModelApiKey(event.target.value)} /></label>
          <button disabled={busy === "model"} onClick={() => runAction("model", () => api("/verify/model", { method: "POST" }))}>测试文本模型</button>
          <ActionFeedback title="模型测试" result={results.model} />
        </article>

        <article className="settings-card">
          <div className="section-title compact">
            <h3>图片生成模型</h3>
            <button onClick={() => void saveImageModelConfig()}>保存图片模型</button>
          </div>
          <p className="helper">图片模型单独配置。未启用时不会生成封面或图文图片，也不会进入图片审批。</p>
          <label><span><input type="checkbox" checked={imageModelConfig.enabled} onChange={(event) => setImageModelConfig({ ...imageModelConfig, enabled: event.target.checked })} /> 启用图片模型</span></label>
          <label>模型服务<select value={imageModelConfig.provider} onChange={(event) => setImageModelConfig({ ...imageModelConfig, provider: event.target.value as PublicImageModelConfig["provider"] })}><option value="none">不使用图片模型</option><option value="openai-compatible">OpenAI-compatible 接口</option></select></label>
          <label>服务地址<input value={imageModelConfig.baseUrl} onChange={(event) => setImageModelConfig({ ...imageModelConfig, baseUrl: event.target.value })} /></label>
          <label>模型名称<input value={imageModelConfig.model} onChange={(event) => setImageModelConfig({ ...imageModelConfig, model: event.target.value })} /></label>
          <label>接口密钥<input type="password" value={imageModelApiKey} placeholder={imageModelConfig.keyPreview ?? "新的图片模型密钥"} onChange={(event) => setImageModelApiKey(event.target.value)} /></label>
          <ActionFeedback title="图片模型配置" result={results.imageModel} />
        </article>

        <article className="settings-card">
          <div className="section-title compact">
            <h3>微信公众号</h3>
            <button onClick={() => void saveWechatConfig()}>保存微信</button>
          </div>
          <label><span><input type="checkbox" checked={wechatConfig.enabled} onChange={(event) => setWechatConfig({ ...wechatConfig, enabled: event.target.checked })} /> 启用微信公众号草稿箱连接</span></label>
          <label>App ID<input value={wechatConfig.appId} onChange={(event) => setWechatConfig({ ...wechatConfig, appId: event.target.value })} /></label>
          <label>App Secret<input type="password" value={wechatSecret} placeholder={wechatConfig.secretPreview ?? "新的 app secret"} onChange={(event) => setWechatSecret(event.target.value)} /></label>
          <details className="advanced-settings">
            <summary>封面和高级凭据设置</summary>
            <label>封面 media ID<input value={wechatConfig.coverMediaId ?? ""} onChange={(event) => setWechatConfig({ ...wechatConfig, coverMediaId: event.target.value })} /></label>
            <label>本地封面路径<input value={wechatConfig.coverImagePath ?? ""} placeholder="例如 workspace/assets/wechat-cover.png" onChange={(event) => setWechatConfig({ ...wechatConfig, coverImagePath: event.target.value })} /></label>
            <label>本地凭据脚本<input value={wechatConfig.legacyCredentialSource ?? ""} placeholder="例如 scripts/wechat-credentials.js" onChange={(event) => setWechatConfig({ ...wechatConfig, legacyCredentialSource: event.target.value })} /></label>
          </details>
          <p className="helper">真实创建公众号草稿需要 AppID、AppSecret、IP 白名单，以及可用封面。系统会先检查连接，确认后才会创建草稿箱内容。</p>
          <button disabled={busy === "wechat"} onClick={() => runAction("wechat", () => api("/verify/wechat", { method: "POST" }))}>检查微信连接</button>
          <ActionFeedback title="微信请求" result={results.wechat} />
        </article>

        <article className="settings-card">
          <div className="section-title compact">
            <h3>小红书浏览器草稿</h3>
            <button onClick={() => void saveXhsConfig()}>保存小红书</button>
          </div>
          <label><span><input type="checkbox" checked={xhsConfig.enabled} onChange={(event) => setXhsConfig({ ...xhsConfig, enabled: event.target.checked })} /> 启用小红书草稿箱连接</span></label>
          <details className="advanced-settings" open>
            <summary>浏览器桥接设置</summary>
            <label>小红书自动化目录<input value={xhsConfig.projectDir} onChange={(event) => setXhsConfig({ ...xhsConfig, projectDir: event.target.value })} /></label>
            <label>Bridge URL<input value={xhsConfig.bridgeUrl} onChange={(event) => setXhsConfig({ ...xhsConfig, bridgeUrl: event.target.value })} /></label>
          </details>
          <button disabled={busy === "xhs"} onClick={() => runAction("xhs", () => api("/verify/xhs", { method: "POST" }))}>检查小红书连接</button>
          <ActionFeedback title="小红书检查" result={results.xhs} />
        </article>

        <article className="settings-card">
          <h3>当前使用范围</h3>
          <p className="helper">当前对外流程只开放 AIHot 日报、热点分析、候选评审、本地草稿和平台交接。</p>
          <p className="helper">RSS/RSSHub 订阅管理仍在后台保留，前端暂不开放。浏览器补全和采集器只用于入选候选后的原文获取。</p>
          <p className="helper">图片生成需要独立图片模型。未配置时不会生成图片资产，也不会出现图片审批任务。</p>
        </article>
      </div>
    </section>
  );
}

export function DraftPreviewGridV2({
  run,
  selectedCandidateIds,
  runSettings,
  setRunSettings,
  togglePlatform,
  generateDrafts,
  publishDrafts,
  regenerateAsset,
  loadArtifact,
  taskProgress,
  publishProgress,
  busy
}: {
  run?: PipelineRun;
  selectedCandidateIds: string[];
  runSettings: RunSettings;
  setRunSettings: (settings: RunSettings) => void;
  togglePlatform: (platform: Platform) => void;
  generateDrafts: () => void;
  publishDrafts: () => void;
  regenerateAsset: (assetId: string) => void;
  loadArtifact: (artifactPath: string, title?: string) => void;
  taskProgress?: TaskProgress;
  publishProgress?: TaskProgress;
  busy?: string;
}) {
  const drafts = run?.drafts ?? [];
  const platformDrafts = drafts.filter((draft) => draft.platform === "wechat" || draft.platform === "xhs");
  const successfulPublishes = (run?.publishResults ?? []).filter((result) => asString(result.status) === "success");
  const groupedSourceIds = [...new Set(drafts.map((draft) => draft.sourceItemId))];
  return (
    <section className="panel" id="drafts">
      <div className="section-title">
        <div>
          <p className="eyebrow">草稿生成</p>
          <h2>先生成本地草稿，再决定是否交接到平台。</h2>
          <p className="helper">这一步只生成可审阅的本地内容。确认无误后，再单独推进到微信或小红书草稿箱。</p>
        </div>
        <button disabled={busy === "drafts" || !run || selectedCandidateIds.length === 0} onClick={generateDrafts}>生成本地草稿</button>
      </div>

      <div className="draft-workbench">
        <aside className="draft-control-rail">
          <h3>生成与上传</h3>
          <p className="helper">草稿生成会同步生成平台封面和配图；微信上传仍需要你显式确认。</p>
          <div className="toggle-row vertical">
            {platformOptions.map((platform) => (
              <label key={platform}><span><input type="checkbox" checked={runSettings.platforms.includes(platform)} onChange={() => togglePlatform(platform)} /> {displayLabel(platform)}</span></label>
            ))}
          </div>
          <button disabled={busy === "drafts" || !run || selectedCandidateIds.length === 0} onClick={generateDrafts}>生成图文草稿</button>
          <label className="real-draft-toggle"><span><input type="checkbox" checked={runSettings.allowRealDraft} onChange={(event) => setRunSettings({ ...runSettings, allowRealDraft: event.target.checked })} /> 上传真实平台草稿（需二次确认）</span></label>
          <button type="button" disabled={busy === "publish" || platformDrafts.length === 0} onClick={publishDrafts}>上传微信 / 生成小红书交接</button>
        </aside>

        <div className="draft-preview-stage">
          <TaskProgressPanel progress={taskProgress} />
          <TaskProgressPanel progress={publishProgress} />
          {successfulPublishes.length > 0 && (
            <div className="publish-success-list" role="status" aria-live="polite">
              {successfulPublishes.map((result) => {
                const platform = displayLabel(asString(result.platform));
                const externalId = asString(result.externalId);
                return <span key={`${asString(result.platform)}-${asString(result.draftId)}`}>{platform}草稿箱创建成功{externalId ? `: ${externalId}` : ""}</span>;
              })}
            </div>
          )}

          {drafts.length === 0 && <p className="helper">候选评审后勾选内容，再生成评审稿、微信公众号和小红书图文草稿。</p>}
          {groupedSourceIds.map((sourceItemId) => {
            const candidate = run?.candidateReviews?.find((item) => item.sourceItemId === sourceItemId);
            const sourceDrafts = drafts.filter((draft) => draft.sourceItemId === sourceItemId);
            return (
              <article className="candidate-draft-section" key={sourceItemId}>
                <header>
                  <span className="eyebrow">候选图文</span>
                  <h3>{candidate?.title ?? sourceItemId}</h3>
                  {candidate?.summary?.summary && <p className="helper">{candidate.summary.summary}</p>}
                </header>
                <div className="platform-preview-grid">
                  {sourceDrafts.map((draft) => {
                    const assets = draftAssets(run, draft);
                    const publish = (run?.publishResults ?? []).find((result) => asString(result.draftId) === draft.id);
                    const handoffs = publishArtifactPaths(run, draft.id);
                    return (
                      <article className={`draft-card platform-${draft.platform}`} key={draft.id}>
                        <div className="draft-card-title">
                          <span>{displayLabel(draft.platform)}</span>
                          <h4>{draft.title}</h4>
                        </div>
                        <PlatformArticlePreview run={run} draft={draft} assets={assets} />
                        {assets.length === 0 && draft.platform !== "review" && <p className="helper">未配置图片生成模型，本次不会申请图片生成。</p>}
                        {publish && <small>平台推进：{displayLabel(asString(publish.status))} / {asString(publish.message) || asString(publish.verificationSignal) || "已生成交接信息"}</small>}
                        <div className="action-row">
                          {draft.artifactPath && <button type="button" onClick={() => loadArtifact(draft.artifactPath ?? "", `${displayLabel(draft.platform)}: ${draft.title}`)}>{draft.platform === "review" ? "评审稿预览" : "打开 Markdown"}</button>}
                          {handoffs.map((handoff) => <button type="button" key={handoff.path} onClick={() => loadArtifact(handoff.path, handoff.label)}>{handoff.label}</button>)}
                        </div>
                        <RawJsonDetails data={{ draft, assets, publish }} />
                      </article>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>

        <aside className="asset-inspector">
          <h3>图片资产</h3>
          <p className="helper">每张图片都可以单独重生成。生成失败不会阻断文字草稿。</p>
          {(run?.assets ?? []).length === 0 && <p className="helper">暂无图片资产。</p>}
          {(run?.assets ?? []).map((asset) => {
            const url = assetImageUrl(run?.runId, asset);
            return (
              <article className={`asset-preview-card ${asset.status ?? "planned"}`} key={asset.id}>
                {url ? <img src={url} alt={asset.altText ?? asset.id} /> : <div className="image-placeholder">{displayLabel(asset.status ?? "planned")}</div>}
                <strong>{displayLabel(asset.platform ?? "")} {displayLabel(asset.type)}</strong>
                <small>{asset.id}</small>
                <small>{asset.ratio ?? "默认比例"} / 第 {asset.revision ?? 1} 版</small>
                {asset.errorMessage && <p className="risk-note">{asset.errorMessage}</p>}
                {asset.prompt && <details><summary>图片提示词</summary><p>{asset.prompt}</p></details>}
                <button type="button" disabled={busy === "asset-regenerate"} onClick={() => regenerateAsset(asset.id)}>重新生成这张图</button>
              </article>
            );
          })}
        </aside>
      </div>

      <div className="workflow-steps legacy-draft-steps" hidden>
        <article>
          <strong>1. 选择草稿类型</strong>
          <div className="toggle-row">
            {platformOptions.map((platform) => (
              <label key={platform}><span><input type="checkbox" checked={runSettings.platforms.includes(platform)} onChange={() => togglePlatform(platform)} /> {displayLabel(platform)}</span></label>
            ))}
          </div>
        </article>
        <article>
          <strong>2. 审阅本地草稿</strong>
          <p>先打开评审稿、微信草稿或小红书草稿预览，确认内容后再推进平台。</p>
        </article>
        <article>
          <strong>3. 推进平台草稿</strong>
          <label><span><input type="checkbox" checked={runSettings.allowRealDraft} onChange={(event) => setRunSettings({ ...runSettings, allowRealDraft: event.target.checked })} /> 创建真实平台草稿（需二次确认且连接检查通过）</span></label>
          <button type="button" disabled={busy === "publish" || platformDrafts.length === 0} onClick={publishDrafts}>推进平台草稿</button>
        </article>
      </div>

      <div className="draft-grid" hidden>
        {drafts.length === 0 && <p className="helper">候选评审后勾选内容，再生成评审稿、微信公众号和小红书草稿。</p>}
        {drafts.map((draft) => {
          const assets = (run?.assets ?? []).filter((asset) => draft.assetIds?.includes(asset.id) || asset.draftId === draft.id);
          const publish = (run?.publishResults ?? []).find((result) => asString(result.draftId) === draft.id);
          const handoffs = publishArtifactPaths(run, draft.id);
          return (
            <article className="draft-card" key={draft.id}>
              <span>{displayLabel(draft.platform)}</span>
              <h3>{draft.title}</h3>
              <MarkdownPreview compact content={draft.body ?? draft.digest ?? "暂无预览。"} />
              {assets.length === 0 && <p className="helper">未配置图片生成模型，本次不会申请图片生成。</p>}
              <div className="asset-list">
                {assets.map((asset) => (
                  <small key={asset.id}>图片：{displayLabel(asset.type)} / {asset.ratio ?? "默认比例"} / {displayLabel(asset.status ?? "planned")}</small>
                ))}
              </div>
              {publish && <small>平台推进：{displayLabel(asString(publish.status))} / {asString(publish.message) || asString(publish.verificationSignal) || "已生成交接信息"}</small>}
              <div className="action-row">
                {draft.artifactPath && <button type="button" onClick={() => loadArtifact(draft.artifactPath ?? "", `${displayLabel(draft.platform)}: ${draft.title}`)}>{draft.platform === "review" ? "评审稿预览" : "打开草稿预览"}</button>}
                {handoffs.map((handoff) => <button type="button" key={handoff.path} onClick={() => loadArtifact(handoff.path, handoff.label)}>{handoff.label}</button>)}
              </div>
              <RawJsonDetails data={{ draft, assets, publish }} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
