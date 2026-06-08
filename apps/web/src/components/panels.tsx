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
import { api } from "../api.js";
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
  if (pathValue.includes("publisher-handoffs")) return "打开 publisher handoff";
  if (pathValue.includes("full-text")) return "打开原文 Markdown";
  return "打开 Markdown 产物";
}

function publishArtifactPaths(run?: PipelineRun, draftId?: string): Array<{ label: string; path: string }> {
  return (run?.publishResults ?? [])
    .filter((result) => asString(result.draftId) === draftId && asString(result.artifactPath))
    .map((result) => ({
      label: `${displayLabel(asString(result.platform))} handoff`,
      path: asString(result.artifactPath)
    }));
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}分${rest}秒` : `${rest}秒`;
}

function latestFailure(events: Array<Record<string, unknown>>): string {
  const failed = [...events].reverse().find((event) => asString(event.status) === "failed" || asString(event.message));
  return asString(failed?.message) || asString(failed?.reason);
}

export function TaskProgressPanel({ progress, events }: { progress?: TaskProgress; events?: Array<Record<string, unknown>> }) {
  if (!progress) return null;
  const failureReason = progress.failureReason || latestFailure(events ?? []);
  return (
    <article className={`task-progress ${progress.status}`}>
      <div className="section-title compact">
        <div>
          <p className="eyebrow">长任务进度</p>
          <h3>{progress.title}</h3>
        </div>
        <StatusPill state={progress.status === "failed" ? "error" : progress.status === "success" ? "success" : "loading"} label={progress.status} />
      </div>
      <div className="progress-metrics">
        <span><strong>{displayLabel(progress.currentStage)}</strong>当前阶段</span>
        <span><strong>{progress.processedCount}</strong>已处理数量</span>
        <span><strong>{formatElapsed(progress.elapsedMs)}</strong>耗时</span>
      </div>
      {failureReason && <p className="risk-note">失败原因：{failureReason}</p>}
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
        <p>{aiHotLatest?.health.message ?? "等待最新日报状态。"}</p>
        <StatusPill state={sourceStatusState(aiHotLatest?.health.status)} label={aiHotLatest?.health.status ?? "loading"} />
      </article>
      <article className="card">
        <h3>文本模型</h3>
        <p>{modelConfig.enabled ? `${modelConfig.model} 已启用` : "未启用真实模型时只生成确定性中文占位。"}</p>
        <StatusPill state={modelConfig.keyConfigured || modelConfig.provider === "deterministic"} label={modelConfig.provider} />
      </article>
      <article className="card">
        <h3>原文获取</h3>
        <p>默认 HTTP 抓取；BrowserAct 和 MediaCrawler 只在显式启用时作为 fallback。</p>
        <StatusPill state="success" label={providers.browserAct?.enabled ? "browseract" : "http"} />
      </article>
      <article className="card">
        <h3>平台交接</h3>
        <p>微信：{wechatHealth?.gate?.message ?? "未检查"} / 小红书：{xhsHealth?.gate?.message ?? "未检查"}</p>
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
        <label><span><input type="checkbox" checked={runSettings.allowBrowserFallback} onChange={(event) => setRunSettings({ ...runSettings, allowBrowserFallback: event.target.checked })} /> 允许后端 BrowserAct fallback</span></label>
        <label><span><input type="checkbox" checked={runSettings.allowMediaCrawlerFallback} onChange={(event) => setRunSettings({ ...runSettings, allowMediaCrawlerFallback: event.target.checked })} /> 允许 MediaCrawler fallback</span></label>
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
          <p className="helper">默认 dry-run，只生成本地 Markdown 与 publisher handoff。图片生成模型未单独配置时，不会自动规划或申请图片生成。</p>
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
        <p>评审稿只用于人工审阅；微信公众号和小红书草稿卡片会生成 Markdown 产物和 publisher handoff。若要真实创建平台草稿，请先在配置区通过对应 gate，再勾选“推进真实平台草稿”并重新点击“生成草稿”。</p>
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
                {draft.artifactPath && <button type="button" onClick={() => loadArtifact(draft.artifactPath ?? "", `${displayLabel(draft.platform)}：${draft.title}`)}>{draft.platform === "review" ? "评审稿预览" : "打开 Markdown 产物"}</button>}
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
      .map((result) => ({ label: `${displayLabel(asString(result.platform))} handoff`, path: asString(result.artifactPath) }))
  ];
  return (
    <section className="panel" id="history">
      <div className="section-title">
        <div>
          <p className="eyebrow">运行历史</p>
          <h2>恢复、删除或清空历史运行。</h2>
          <p className="helper">当前历史目录：{runsDir ?? "未知"}；共 {runs.length} 条记录。</p>
        </div>
        <button type="button" disabled={runs.length === 0} onClick={clearRuns}>清空全部</button>
      </div>
      <div className="history-layout">
        <div className="subscription-list">
          {runs.length === 0 && <p className="helper">暂无运行历史。若确认之前运行过，请检查启动脚本使用的 runsDir 是否一致。</p>}
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
          <h2>模型、平台 gate 与当前来源策略。</h2>
          <p className="helper">中文译文和高质量中文总结依赖真实 OpenAI-compatible 文本模型。图片生成模型需要单独配置，当前默认不申请图片生成。</p>
        </div>
      </div>
      <div className="settings-grid">
        <article className="settings-card">
          <div className="section-title compact">
            <h3>OpenAI-compatible 文本模型</h3>
            <button onClick={() => void saveModelConfig()}>保存模型</button>
          </div>
          <label><span><input type="checkbox" checked={modelConfig.enabled} onChange={(event) => setModelConfig({ ...modelConfig, enabled: event.target.checked })} /> 启用真实文本模型 provider</span></label>
          <label>Provider<select value={modelConfig.provider} onChange={(event) => setModelConfig({ ...modelConfig, provider: event.target.value as PublicModelConfig["provider"] })}><option value="deterministic">deterministic</option><option value="openai-compatible">openai-compatible</option></select></label>
          <label>Base URL<input value={modelConfig.baseUrl} onChange={(event) => setModelConfig({ ...modelConfig, baseUrl: event.target.value })} /></label>
          <label>模型名称<input value={modelConfig.model} onChange={(event) => setModelConfig({ ...modelConfig, model: event.target.value })} /></label>
          <label>API key<input type="password" value={modelApiKey} placeholder={modelConfig.keyPreview ?? "新的 API key"} onChange={(event) => setModelApiKey(event.target.value)} /></label>
          <button disabled={busy === "model"} onClick={() => runAction("model", () => api("/verify/model", { method: "POST" }))}>测试模型请求</button>
          <ActionFeedback title="模型测试" result={results.model} />
        </article>

        <article className="settings-card">
          <div className="section-title compact">
            <h3>图片生成模型</h3>
            <button onClick={() => void saveImageModelConfig()}>保存图片模型</button>
          </div>
          <p className="helper">图片模型是独立配置。启用并配置 key 后，草稿生成会为微信公众号封面和小红书图文生成提示词与待审批资产；未配置时不会申请图片生成。</p>
          <label><span><input type="checkbox" checked={imageModelConfig.enabled} onChange={(event) => setImageModelConfig({ ...imageModelConfig, enabled: event.target.checked })} /> 启用图片模型 provider</span></label>
          <label>Provider<select value={imageModelConfig.provider} onChange={(event) => setImageModelConfig({ ...imageModelConfig, provider: event.target.value as PublicImageModelConfig["provider"] })}><option value="none">none</option><option value="openai-compatible">openai-compatible</option></select></label>
          <label>Base URL<input value={imageModelConfig.baseUrl} onChange={(event) => setImageModelConfig({ ...imageModelConfig, baseUrl: event.target.value })} /></label>
          <label>模型名称<input value={imageModelConfig.model} onChange={(event) => setImageModelConfig({ ...imageModelConfig, model: event.target.value })} /></label>
          <label>API key<input type="password" value={imageModelApiKey} placeholder={imageModelConfig.keyPreview ?? "新的图片模型 API key"} onChange={(event) => setImageModelApiKey(event.target.value)} /></label>
          <ActionFeedback title="图片模型配置" result={results.imageModel} />
        </article>

        <article className="settings-card">
          <div className="section-title compact">
            <h3>微信公众号</h3>
            <button onClick={() => void saveWechatConfig()}>保存微信</button>
          </div>
          <label><span><input type="checkbox" checked={wechatConfig.enabled} onChange={(event) => setWechatConfig({ ...wechatConfig, enabled: event.target.checked })} /> 启用微信 API</span></label>
          <label>App ID<input value={wechatConfig.appId} onChange={(event) => setWechatConfig({ ...wechatConfig, appId: event.target.value })} /></label>
          <label>App Secret<input type="password" value={wechatSecret} placeholder={wechatConfig.secretPreview ?? "新的 app secret"} onChange={(event) => setWechatSecret(event.target.value)} /></label>
          <label>封面 media ID<input value={wechatConfig.coverMediaId ?? ""} onChange={(event) => setWechatConfig({ ...wechatConfig, coverMediaId: event.target.value })} /></label>
          <label>本地封面路径<input value={wechatConfig.coverImagePath ?? ""} placeholder="例如 workspace/assets/wechat-cover.png" onChange={(event) => setWechatConfig({ ...wechatConfig, coverImagePath: event.target.value })} /></label>
          <label>legacy 凭据脚本<input value={wechatConfig.legacyCredentialSource ?? ""} placeholder="例如 scripts/wechat-credentials.js" onChange={(event) => setWechatConfig({ ...wechatConfig, legacyCredentialSource: event.target.value })} /></label>
          <p className="helper">真实创建公众号草稿至少需要 AppID、AppSecret、IP 白名单，并提供封面 media ID 或本地封面路径。若提供本地封面路径，后端会用永久素材接口上传封面并取得 thumb_media_id；正文图片会通过 /cgi-bin/media/uploadimg 转存到微信图床。legacy 凭据脚本兼容微信 workflow 中的 APPID/APPSECRET 读取方式。</p>
          <button disabled={busy === "wechat"} onClick={() => runAction("wechat", () => api("/verify/wechat", { method: "POST" }))}>检查微信联通与上传 gate</button>
          <ActionFeedback title="微信请求" result={results.wechat} />
        </article>

        <article className="settings-card">
          <div className="section-title compact">
            <h3>小红书浏览器草稿</h3>
            <button onClick={() => void saveXhsConfig()}>保存小红书</button>
          </div>
          <label><span><input type="checkbox" checked={xhsConfig.enabled} onChange={(event) => setXhsConfig({ ...xhsConfig, enabled: event.target.checked })} /> 启用真实小红书 gate</span></label>
          <label>xiaohongshu-skills 目录<input value={xhsConfig.projectDir} onChange={(event) => setXhsConfig({ ...xhsConfig, projectDir: event.target.value })} /></label>
          <label>Bridge URL<input value={xhsConfig.bridgeUrl} onChange={(event) => setXhsConfig({ ...xhsConfig, bridgeUrl: event.target.value })} /></label>
          <button disabled={busy === "xhs"} onClick={() => runAction("xhs", () => api("/verify/xhs", { method: "POST" }))}>检查小红书 gate</button>
          <ActionFeedback title="小红书 gate" result={results.xhs} />
        </article>

        <article className="settings-card">
          <h3>当前来源与图片策略</h3>
          <p className="helper">前端只开放 AIHot 固定源；RSS/RSSHub 后端能力保留，后续再重新开放渠道库。</p>
          <p className="helper">BrowserAct 和 MediaCrawler 仍作为入选候选后的原文补全能力，不是普通订阅源。</p>
          <p className="helper">图片生成需要独立图片模型配置。未配置时不会生成图片资产，也不会进入图片审批队列。</p>
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
  loadArtifact: (artifactPath: string, title?: string) => void;
  taskProgress?: TaskProgress;
  publishProgress?: TaskProgress;
  busy?: string;
}) {
  const drafts = run?.drafts ?? [];
  const platformDrafts = drafts.filter((draft) => draft.platform === "wechat" || draft.platform === "xhs");
  const successfulPublishes = (run?.publishResults ?? []).filter((result) => asString(result.status) === "success");
  return (
    <section className="panel" id="drafts">
      <div className="section-title">
        <div>
          <p className="eyebrow">{"\u8349\u7a3f\u751f\u6210"}</p>
          <h2>{"\u5148\u751f\u6210\u672c\u5730\u8349\u7a3f\uff0c\u518d\u786e\u8ba4\u63a8\u8fdb\u5e73\u53f0\u8349\u7a3f\u7bb1\u3002"}</h2>
          <p className="helper">{"\u751f\u6210\u8349\u7a3f\u53ea\u4f1a\u4ea7\u51fa\u672c\u5730 Markdown \u548c\u9884\u89c8\u3002\u5fae\u4fe1/\u5c0f\u7ea2\u4e66\u7684 handoff \u6216\u771f\u5b9e\u8349\u7a3f\u7bb1\u521b\u5efa\uff0c\u9700\u8981\u5728\u7b2c 3 \u6b65\u5355\u72ec\u786e\u8ba4\u3002"}</p>
        </div>
        <button disabled={busy === "drafts" || !run || selectedCandidateIds.length === 0} onClick={generateDrafts}>{"\u751f\u6210\u672c\u5730\u8349\u7a3f"}</button>
      </div>

      <div className="workflow-steps">
        <article>
          <strong>{"1. \u9009\u62e9\u8349\u7a3f\u7c7b\u578b"}</strong>
          <div className="toggle-row">
            {platformOptions.map((platform) => (
              <label key={platform}><span><input type="checkbox" checked={runSettings.platforms.includes(platform)} onChange={() => togglePlatform(platform)} /> {displayLabel(platform)}</span></label>
            ))}
          </div>
        </article>
        <article>
          <strong>{"2. \u751f\u6210\u5e76\u5ba1\u9605\u672c\u5730\u8349\u7a3f"}</strong>
          <p>{"\u8bf7\u5148\u6253\u5f00\u8bc4\u5ba1\u7a3f\u3001\u5fae\u4fe1 Markdown \u6216\u5c0f\u7ea2\u4e66 Markdown \u9884\u89c8\uff0c\u786e\u8ba4\u5185\u5bb9\u540e\u518d\u63a8\u8fdb\u5e73\u53f0\u3002"}</p>
        </article>
        <article>
          <strong>{"3. \u786e\u8ba4\u5e73\u53f0\u63a8\u8fdb"}</strong>
          <label><span><input type="checkbox" checked={runSettings.allowRealDraft} onChange={(event) => setRunSettings({ ...runSettings, allowRealDraft: event.target.checked })} /> {"\u521b\u5efa\u771f\u5b9e\u5e73\u53f0\u8349\u7a3f\uff08\u9700\u4e8c\u6b21\u786e\u8ba4\u4e14 gate \u901a\u8fc7\uff09"}</span></label>
          <button type="button" disabled={busy === "publish" || platformDrafts.length === 0} onClick={publishDrafts}>{"\u63a8\u8fdb\u5e73\u53f0\u8349\u7a3f"}</button>
        </article>
      </div>

      <TaskProgressPanel progress={taskProgress} />
      <TaskProgressPanel progress={publishProgress} />
      {successfulPublishes.length > 0 && (
        <div className="publish-success-list" role="status" aria-live="polite">
          {successfulPublishes.map((result) => {
            const platform = displayLabel(asString(result.platform));
            const externalId = asString(result.externalId);
            return <span key={`${asString(result.platform)}-${asString(result.draftId)}`}>{platform}{"\u8349\u7a3f\u7bb1\u521b\u5efa\u6210\u529f"}{externalId ? `: ${externalId}` : ""}</span>;
          })}
        </div>
      )}

      <div className="draft-grid">
        {drafts.length === 0 && <p className="helper">{"\u5019\u9009\u8bc4\u5ba1\u540e\u52fe\u9009\u5185\u5bb9\uff0c\u518d\u751f\u6210 review\u3001\u5fae\u4fe1\u516c\u4f17\u53f7\u548c\u5c0f\u7ea2\u4e66\u8349\u7a3f\u3002"}</p>}
        {drafts.map((draft) => {
          const assets = (run?.assets ?? []).filter((asset) => draft.assetIds?.includes(asset.id) || asset.draftId === draft.id);
          const publish = (run?.publishResults ?? []).find((result) => asString(result.draftId) === draft.id);
          const handoffs = publishArtifactPaths(run, draft.id);
          return (
            <article className="draft-card" key={draft.id}>
              <span>{displayLabel(draft.platform)}</span>
              <h3>{draft.title}</h3>
              <MarkdownPreview compact content={draft.body ?? draft.digest ?? "\u6682\u65e0\u9884\u89c8\u3002"} />
              {assets.length === 0 && <p className="helper">{"\u672a\u914d\u7f6e\u56fe\u7247\u751f\u6210\u6a21\u578b\uff0c\u672c\u6b21\u4e0d\u4f1a\u7533\u8bf7\u56fe\u7247\u751f\u6210\u3002"}</p>}
              <div className="asset-list">
                {assets.map((asset) => (
                  <small key={asset.id}>{"\u56fe\u7247\uff1a"}{displayLabel(asset.type)} / {asset.ratio ?? "\u9ed8\u8ba4\u6bd4\u4f8b"} / {displayLabel(asset.status ?? "planned")}</small>
                ))}
              </div>
              {publish && <small>{"\u5e73\u53f0\u63a8\u8fdb\uff1a"}{displayLabel(asString(publish.status))} / {asString(publish.message) || asString(publish.verificationSignal) || "\u5df2\u751f\u6210\u4ea4\u63a5\u4fe1\u606f"}</small>}
              <div className="action-row">
                {draft.artifactPath && <button type="button" onClick={() => loadArtifact(draft.artifactPath ?? "", `${displayLabel(draft.platform)}: ${draft.title}`)}>{draft.platform === "review" ? "\u8bc4\u5ba1\u7a3f\u9884\u89c8" : "\u6253\u5f00 Markdown \u4ea7\u7269"}</button>}
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
