import type {
  AiHotLatest,
  ApiState,
  Artifact,
  CandidateReview,
  PipelineRun,
  Platform,
  ProviderState,
  PublicModelConfig,
  PublicWechatConfig,
  PublicXhsConfig,
  PublisherHealth,
  ReviewQueueItem,
  RunSettings,
  RunSummary,
  VerificationResult
} from "../types.js";
import { api } from "../api.js";
import { ActionFeedback, displayLabel, RawJsonDetails, StatusPill } from "./ui.js";

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
        <h2>先读完整日报，再选热点、看理由，最后生成平台草稿。</h2>
        <p className="hero-copy">
          当前前端先隐藏 RSS/RSSHub 接入，只把 AIHot 作为信息源。每一步都保留人工选择权：选哪些信息进入分析，选哪些候选进入草稿。
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
        <p>{aiHotLatest?.health.message ?? "正在等待最新日报状态。"}</p>
        <StatusPill state={sourceStatusState(aiHotLatest?.health.status)} label={aiHotLatest?.health.status ?? "loading"} />
      </article>
      <article className="card">
        <h3>模型</h3>
        <p>{modelConfig.model}</p>
        <StatusPill state={modelConfig.keyConfigured || modelConfig.provider === "deterministic"} label={modelConfig.provider} />
      </article>
      <article className="card">
        <h3>原文获取</h3>
        <p>{providers.browserAct?.command ?? "BrowserAct planned command"}</p>
        <StatusPill state={Boolean(providers.browserAct?.enabled)} label={providers.browserAct?.enabled ? "enabled" : "planned"} />
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
  const dailyText = items
    .map((item, index) => {
      const title = itemTitle(item, index);
      const summary = itemSummary(item);
      const url = asString(item.url);
      return `${index + 1}. ${title}\n${summary}${url ? `\n${url}` : ""}`;
    })
    .join("\n\n");

  return (
    <section className="panel aihot-panel" id="aihot">
      <div className="section-title">
        <div>
          <p className="eyebrow">AIHot 日报</p>
          <h2>自动获取最新 AI 热点，先完整浏览，再选择进入分析。</h2>
          <p className="helper">RSS/RSSHub 入口已从前端隐藏；当前阶段只使用 AIHot 固定源。</p>
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
            <span>{dailyText.length} 字符</span>
          </div>
          <pre>{dailyText || "暂无 AIHot 内容。点击刷新后，如果仍为空，请查看状态提示。"}</pre>
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
  busy
}: {
  aiHotLatest?: AiHotLatest;
  runSettings: RunSettings;
  setRunSettings: (settings: RunSettings) => void;
  selectedAiHotItemIds: string[];
  screenCandidates: () => void;
  runEvents: Array<Record<string, unknown>>;
  busy?: string;
}) {
  const stages = ["collect", "verify", "score", "fetch_full_text", "summarize", "candidate_review"];
  const canRun = selectedAiHotItemIds.length > 0 && aiHotLatest?.health.status !== "failed";
  return (
    <section className="panel" id="screen">
      <div className="section-title">
        <div>
          <p className="eyebrow">热点分析</p>
          <h2>用 AI 从已选择的 AIHot 信息中筛出 {runSettings.candidateCount} 条候选。</h2>
          <p className="helper">分析阶段会补全原文、生成中文总结、给出评分和入选原因；不会自动生成草稿。</p>
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
        <label><span><input type="checkbox" checked={runSettings.allowBrowserFallback} onChange={(event) => setRunSettings({ ...runSettings, allowBrowserFallback: event.target.checked })} /> 允许 BrowserAct 补全原文</span></label>
        <label><span><input type="checkbox" checked={runSettings.allowMediaCrawlerFallback} onChange={(event) => setRunSettings({ ...runSettings, allowMediaCrawlerFallback: event.target.checked })} /> 允许 MediaCrawler fallback</span></label>
      </div>
      <div className="timeline">
        {stages.map((stage) => <span className={stageStatus(runEvents, stage)} key={stage}>{displayLabel(stage)}<small>{displayLabel(stageStatus(runEvents, stage))}</small></span>)}
      </div>
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
  loadArtifact: (artifactPath: string) => void;
}) {
  const allSelected = candidates.length > 0 && selectedIds.length === candidates.length;
  return (
    <section className="panel" id="candidates">
      <div className="section-title">
        <div>
          <p className="eyebrow">候选评审</p>
          <h2>查看原因、总结和评分，再决定哪些进入草稿生成。</h2>
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
                <small>{displayLabel(candidate.collectorAdapter)} · {candidate.publishedAt ? new Date(candidate.publishedAt).toLocaleString() : "未提供时间"}</small>
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
                  <summary>查看评分</summary>
                  <p>评分：{candidate.score} / 100</p>
                  <p className="helper">原文状态：{displayLabel(candidate.originalStatus)}，获取方式：{displayLabel(candidate.originalMethod)}。</p>
                </details>
                <details>
                  <summary>查看原文</summary>
                  <p>{candidate.originalPreview ?? candidate.brief ?? "暂无原文预览。"}</p>
                  <div className="action-row">
                    {candidate.url !== "about:blank" && <a href={candidate.url} target="_blank" rel="noreferrer">打开来源链接</a>}
                    {candidate.originalArtifactPath && <button type="button" onClick={() => loadArtifact(candidate.originalArtifactPath ?? "")}>打开原文 Markdown</button>}
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
  togglePlatform,
  generateDrafts,
  loadArtifact,
  busy
}: {
  run?: PipelineRun;
  selectedCandidateIds: string[];
  runSettings: RunSettings;
  togglePlatform: (platform: Platform) => void;
  generateDrafts: () => void;
  loadArtifact: (artifactPath: string) => void;
  busy?: string;
}) {
  const drafts = run?.drafts ?? [];
  return (
    <section className="panel" id="drafts">
      <div className="section-title">
        <div>
          <p className="eyebrow">草稿生成</p>
          <h2>只为已勾选候选生成平台草稿和配图计划。</h2>
          <p className="helper">正式发布保持禁用；当前只生成本地草稿和平台 handoff。</p>
        </div>
        <button disabled={busy === "drafts" || !run || selectedCandidateIds.length === 0} onClick={generateDrafts}>生成草稿</button>
      </div>
      <div className="toggle-row">
        {platformOptions.map((platform) => (
          <label key={platform}><span><input type="checkbox" checked={runSettings.platforms.includes(platform)} onChange={() => togglePlatform(platform)} /> {displayLabel(platform)}</span></label>
        ))}
      </div>
      <div className="draft-grid">
        {drafts.length === 0 && <p className="helper">候选评审后勾选内容，再生成 review、微信公众号和小红书草稿。</p>}
        {drafts.map((draft) => {
          const assets = (run?.assets ?? []).filter((asset) => draft.assetIds?.includes(asset.id) || asset.draftId === draft.id);
          const publish = (run?.publishResults ?? []).find((result) => result.draftId === draft.id);
          return (
            <article className="draft-card" key={draft.id}>
              <span>{displayLabel(draft.platform)}</span>
              <h3>{draft.title}</h3>
              <p>{draft.digest ?? draft.body?.slice(0, 220) ?? "暂无预览。"}</p>
              <div className="asset-list">
                {assets.map((asset) => (
                  <small key={asset.id}>图片：{asset.type} · {asset.ratio ?? "默认比例"} · {displayLabel(asset.status ?? "planned")}</small>
                ))}
              </div>
              {publish && <small>平台交接：{displayLabel(asString(publish.status))} · {publish.message ?? publish.verificationSignal ?? "已生成交接信息"}</small>}
              <div className="action-row">
                {draft.artifactPath && <button type="button" onClick={() => loadArtifact(draft.artifactPath ?? "")}>打开 Markdown 产物</button>}
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
  loadArtifact: (artifactPath: string) => void;
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
              {item.artifactPath && <button onClick={() => loadArtifact(item.artifactPath ?? "")}>打开产物</button>}
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
  selectedRun,
  artifact,
  loadRun,
  loadArtifact,
  deleteRun,
  clearRuns
}: {
  runs: RunSummary[];
  selectedRun?: PipelineRun;
  artifact?: Artifact;
  loadRun: (runId: string) => void;
  loadArtifact: (artifactPath: string) => void;
  deleteRun: (runId: string) => void;
  clearRuns: () => void;
}) {
  const artifactButtons = [
    ...(selectedRun?.verifiedArticles ?? [])
      .filter((article) => typeof article.fullTextArtifactPath === "string")
      .map((article) => ({ label: `原文 ${article.sourceItemId}`, path: asString(article.fullTextArtifactPath) })),
    ...(selectedRun?.drafts ?? [])
      .filter((draft) => typeof draft.artifactPath === "string")
      .map((draft) => ({ label: `${displayLabel(draft.platform)} 草稿`, path: draft.artifactPath ?? "" }))
  ];
  return (
    <section className="panel" id="history">
      <div className="section-title">
        <div>
          <p className="eyebrow">运行历史</p>
          <h2>恢复、删除或清空历史运行。</h2>
        </div>
        <button type="button" disabled={runs.length === 0} onClick={clearRuns}>清空全部</button>
      </div>
      <div className="history-layout">
        <div className="subscription-list">
          {runs.length === 0 && <p className="helper">暂无运行历史。</p>}
          {runs.slice(0, 12).map((run) => (
            <div className="history-row" key={run.runId}>
              <button className="list-row clickable" onClick={() => loadRun(run.runId)}>
                <strong>{run.runId}</strong>
                <span>{new Date(run.updatedAt).toLocaleString()}</span>
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
                {artifactButtons.map((button) => <button key={button.path} onClick={() => loadArtifact(button.path)}>{button.label}</button>)}
              </div>
              {artifact && <article className="reader"><h4>{artifact.path}</h4><pre>{artifact.content}</pre></article>}
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
          <h2>模型和平台 gate 配置。RSS/RSSHub 前端入口暂时隐藏。</h2>
        </div>
      </div>
      <div className="settings-grid">
        <article className="settings-card">
          <div className="section-title compact">
            <h3>OpenAI-compatible 模型</h3>
            <button onClick={() => void saveModelConfig()}>保存模型</button>
          </div>
          <label><span><input type="checkbox" checked={modelConfig.enabled} onChange={(event) => setModelConfig({ ...modelConfig, enabled: event.target.checked })} /> 启用真实模型 provider</span></label>
          <label>Provider<select value={modelConfig.provider} onChange={(event) => setModelConfig({ ...modelConfig, provider: event.target.value as PublicModelConfig["provider"] })}><option value="deterministic">deterministic</option><option value="openai-compatible">openai-compatible</option></select></label>
          <label>Base URL<input value={modelConfig.baseUrl} onChange={(event) => setModelConfig({ ...modelConfig, baseUrl: event.target.value })} /></label>
          <label>模型名称<input value={modelConfig.model} onChange={(event) => setModelConfig({ ...modelConfig, model: event.target.value })} /></label>
          <label>API key<input type="password" value={modelApiKey} placeholder={modelConfig.keyPreview ?? "新的 API key"} onChange={(event) => setModelApiKey(event.target.value)} /></label>
          <button disabled={busy === "model"} onClick={() => runAction("model", () => api("/verify/model", { method: "POST" }))}>测试模型请求</button>
          <ActionFeedback title="模型测试" result={results.model} />
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
          <button disabled={busy === "wechat"} onClick={() => runAction("wechat", () => api("/verify/wechat", { method: "POST" }))}>请求微信 token</button>
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
          <h3>当前来源策略</h3>
          <p className="helper">前端只开放 AIHot 固定源。RSS/RSSHub 后端能力保留，用于后续重新开放渠道库，但当前页面不再展示添加订阅入口。</p>
          <p className="helper">BrowserAct 和 MediaCrawler 仍作为入选候选后的原文补全能力，不是普通订阅源。</p>
        </article>
      </div>
    </section>
  );
}
