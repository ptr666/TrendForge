import type {
  ApiState,
  Artifact,
  PipelineRun,
  Platform,
  ProviderState,
  PublisherHealth,
  PublicModelConfig,
  PublicWechatConfig,
  PublicXhsConfig,
  ReviewQueueItem,
  RunSettings,
  RunSummary,
  SourceHealth,
  SourceSubscription,
  VerificationResult
} from "../types.js";
import { api } from "../api.js";
import { ResultPanel, StatusPill } from "./ui.js";

export const stages = ["collect", "verify", "score", "fetch_full_text", "select", "summarize", "generate", "compose_media", "publish"];
export const platformOptions: Platform[] = ["review", "wechat", "xhs"];

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function stageStatus(events: Array<Record<string, unknown>>, stage: string): string {
  const matching = events.filter((event) => event.stage === stage);
  const latest = matching.at(-1);
  if (!latest) return "idle";
  return asString(latest.status) || "seen";
}

export interface QueueMetrics {
  blocked: number;
  waiting: number;
  review: number;
}

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">TF</span>
        <div>
          <h1>TrendForge</h1>
          <p>Visual AI publishing cockpit</p>
        </div>
      </div>
      <nav aria-label="Workbench sections">
        {["config", "sources", "run", "review", "history", "reader"].map((section, index) => (
          <a href={`#${section}`} key={section}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {section}
          </a>
        ))}
      </nav>
    </aside>
  );
}

export function Hero({ health, refresh }: { health: ApiState; refresh: () => void }) {
  return (
    <header className="hero">
      <div>
        <p className="eyebrow">Workbench</p>
        <h2>Manage the full AIHot to WeChat/XHS publishing flow visually.</h2>
        <p className="hero-copy">Configure providers, run AI selection, inspect original text, and review platform drafts from one local control plane.</p>
      </div>
      <div className="hero-actions">
        <StatusPill state={health} label={`API ${health}`} />
        <button onClick={refresh} disabled={health === "loading"}>Refresh</button>
      </div>
    </header>
  );
}

export function StatusGrid({
  providers,
  publisherHealth,
  modelConfig,
  wechatConfig,
  reviewQueue,
  queueMetrics
}: {
  providers: ProviderState;
  publisherHealth: PublisherHealth[];
  modelConfig: PublicModelConfig;
  wechatConfig: PublicWechatConfig;
  reviewQueue: ReviewQueueItem[];
  queueMetrics: QueueMetrics;
}) {
  const wechatHealth = publisherHealth.find((publisher) => publisher.platform === "wechat");
  const xhsHealth = publisherHealth.find((publisher) => publisher.platform === "xhs");
  const wechatGateLabel = wechatHealth?.gate?.status ?? (wechatHealth?.ok ? "ready" : "planned");
  const xhsGateLabel = xhsHealth?.gate?.status ?? (xhsHealth?.ok ? "ready" : "planned");
  return (
    <section className="grid status-grid">
      <article className="card">
        <h3>BrowserAct</h3>
        <p>{providers.browserAct?.command ?? "browser-act"}</p>
        <StatusPill state={Boolean(providers.browserAct?.enabled)} label={providers.browserAct?.enabled ? "enabled" : "planned"} />
      </article>
      <article className="card">
        <h3>Model</h3>
        <p>{modelConfig.model}</p>
        <StatusPill state={modelConfig.keyConfigured} label={modelConfig.provider} />
      </article>
      <article className="card">
        <h3>WeChat</h3>
        <p>{wechatHealth?.gate?.message ?? (wechatConfig.appId || "No appId configured")}</p>
        <StatusPill state={wechatHealth?.gate?.status === "ready" ? "success" : wechatHealth?.ok === false ? "error" : wechatConfig.enabled && wechatConfig.secretConfigured} label={wechatGateLabel} />
      </article>
      <article className="card">
        <h3>XHS</h3>
        <p>{xhsHealth?.gate?.message ?? xhsHealth?.message ?? "Browser draft gate is planned"}</p>
        <StatusPill state={xhsHealth?.gate?.status === "ready" ? "success" : xhsHealth?.ok === false ? "error" : "loading"} label={xhsGateLabel} />
      </article>
      <article className="card">
        <h3>Review queue</h3>
        <p>{reviewQueue.length} production-control items</p>
        <StatusPill state={queueMetrics.blocked > 0 ? "error" : reviewQueue.length > 0 ? "loading" : "success"} label={`${queueMetrics.blocked} blocked`} />
      </article>
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
          <p className="eyebrow">Configuration</p>
          <h2>Model, WeChat, and XHS browser workflow</h2>
        </div>
      </div>
      <div className="settings-grid">
        <article className="settings-card">
          <div className="section-title compact">
            <h3>OpenAI-compatible model</h3>
            <button onClick={() => void saveModelConfig()}>Save model</button>
          </div>
          <label><span><input type="checkbox" checked={modelConfig.enabled} onChange={(event) => setModelConfig({ ...modelConfig, enabled: event.target.checked })} /> Enable model provider</span></label>
          <label>Provider<select value={modelConfig.provider} onChange={(event) => setModelConfig({ ...modelConfig, provider: event.target.value as PublicModelConfig["provider"] })}><option value="deterministic">deterministic</option><option value="openai-compatible">openai-compatible</option></select></label>
          <label>Base URL<input value={modelConfig.baseUrl} onChange={(event) => setModelConfig({ ...modelConfig, baseUrl: event.target.value })} /></label>
          <label>Model<input value={modelConfig.model} onChange={(event) => setModelConfig({ ...modelConfig, model: event.target.value })} /></label>
          <label>API key<input type="password" value={modelApiKey} placeholder={modelConfig.keyPreview ?? "New API key"} onChange={(event) => setModelApiKey(event.target.value)} /></label>
          <button disabled={busy === "model"} onClick={() => runAction("model", () => api("/verify/model", { method: "POST" }))}>Test model request</button>
        </article>

        <article className="settings-card">
          <div className="section-title compact">
            <h3>WeChat official account</h3>
            <button onClick={() => void saveWechatConfig()}>Save WeChat</button>
          </div>
          <label><span><input type="checkbox" checked={wechatConfig.enabled} onChange={(event) => setWechatConfig({ ...wechatConfig, enabled: event.target.checked })} /> Enable WeChat API</span></label>
          <label>App ID<input value={wechatConfig.appId} onChange={(event) => setWechatConfig({ ...wechatConfig, appId: event.target.value })} /></label>
          <label>App Secret<input type="password" value={wechatSecret} placeholder={wechatConfig.secretPreview ?? "New app secret"} onChange={(event) => setWechatSecret(event.target.value)} /></label>
          <label>Cover media ID<input value={wechatConfig.coverMediaId ?? ""} onChange={(event) => setWechatConfig({ ...wechatConfig, coverMediaId: event.target.value })} /></label>
          <button disabled={busy === "wechat"} onClick={() => runAction("wechat", () => api("/verify/wechat", { method: "POST" }))}>Request WeChat token</button>
          <p className="helper">The backend makes a real WeChat token request, but responses only show masked token previews or error codes.</p>
        </article>

        <article className="settings-card">
          <div className="section-title compact">
            <h3>XHS browser draft</h3>
            <button onClick={() => void saveXhsConfig()}>Save XHS</button>
          </div>
          <label><span><input type="checkbox" checked={xhsConfig.enabled} onChange={(event) => setXhsConfig({ ...xhsConfig, enabled: event.target.checked })} /> Enable real XHS browser gate</span></label>
          <label>xiaohongshu-skills directory<input value={xhsConfig.projectDir} onChange={(event) => setXhsConfig({ ...xhsConfig, projectDir: event.target.value })} /></label>
          <label>Bridge URL<input value={xhsConfig.bridgeUrl} onChange={(event) => setXhsConfig({ ...xhsConfig, bridgeUrl: event.target.value })} /></label>
          <button disabled={busy === "xhs"} onClick={() => runAction("xhs", () => api("/verify/xhs", { method: "POST" }))}>Check XHS gate</button>
          <p className="helper">Real XHS save requires check-login, fill-publish, save-draft, and a page-level draft-saved signal.</p>
        </article>
      </div>
      <div className="grid">
        <ResultPanel title="Model test" result={results.model} />
        <ResultPanel title="WeChat request" result={results.wechat} />
        <ResultPanel title="XHS gate" result={results.xhs} />
      </div>
    </section>
  );
}

export function SourcesPanel({
  subscriptions,
  sourceHealth,
  newSubscription,
  setNewSubscription,
  saveSubscription,
  browserUrl,
  setBrowserUrl,
  busy,
  runAction,
  results,
  selectSubscription
}: {
  subscriptions: SourceSubscription[];
  sourceHealth: SourceHealth[];
  newSubscription: SourceSubscription;
  setNewSubscription: (subscription: SourceSubscription) => void;
  saveSubscription: () => Promise<void>;
  browserUrl: string;
  setBrowserUrl: (value: string) => void;
  busy?: string;
  runAction: (name: string, action: () => Promise<VerificationResult>) => void;
  results: Record<string, VerificationResult>;
  selectSubscription: (subscription: SourceSubscription) => void;
}) {
  const healthById = new Map(sourceHealth.map((health) => [health.id, health]));
  return (
    <section className="panel" id="sources">
      <div className="section-title">
        <div>
          <p className="eyebrow">Sources</p>
          <h2>AIHot and RSS subscriptions</h2>
        </div>
        <button onClick={() => void saveSubscription()}>Save subscription</button>
      </div>
      <div className="form-grid">
        <label>ID<input value={newSubscription.id} onChange={(event) => setNewSubscription({ ...newSubscription, id: event.target.value })} /></label>
        <label>Title<input value={newSubscription.title} onChange={(event) => setNewSubscription({ ...newSubscription, title: event.target.value })} /></label>
        <label>Type<select value={newSubscription.type} onChange={(event) => setNewSubscription({ ...newSubscription, type: event.target.value as SourceSubscription["type"] })}><option value="aihot">aihot</option><option value="rss">rss</option><option value="rsshub">rsshub</option></select></label>
        <label>Source<input value={newSubscription.source} onChange={(event) => setNewSubscription({ ...newSubscription, source: event.target.value })} /></label>
      </div>
      <div className="action-row">
        <button disabled={busy === "rss"} onClick={() => runAction("rss", () => api("/subscriptions/validate", { method: "POST", body: JSON.stringify(newSubscription) }))}>Verify source</button>
        <button disabled={busy === "browseract"} onClick={() => runAction("browseract", () => api("/verify/browseract", { method: "POST", body: JSON.stringify({ url: browserUrl }) }))}>Run BrowserAct URL</button>
        <button disabled={busy === "mediacrawler"} onClick={() => runAction("mediacrawler", () => api("/verify/mediacrawler", { method: "POST", body: JSON.stringify({ enabled: true }) }))}>Check MediaCrawler</button>
      </div>
      <label>BrowserAct test URL<input value={browserUrl} onChange={(event) => setBrowserUrl(event.target.value)} /></label>
      <div className="subscription-list">
        {subscriptions.map((subscription) => (
          <button className="list-row clickable" key={subscription.id} onClick={() => selectSubscription(subscription)}>
            <strong>{subscription.title}</strong>
            <span>{subscription.type}</span>
            <code>{subscription.source}</code>
            <StatusPill state={healthById.get(subscription.id)?.status === "healthy"} label={healthById.get(subscription.id)?.status ?? (subscription.enabled ? "enabled" : "disabled")} />
          </button>
        ))}
      </div>
      <div className="source-health-grid">
        {sourceHealth.map((health) => (
          <article className={`source-health-card ${health.status}`} key={health.id}>
            <div className="source-health-head">
              <StatusPill state={health.status === "healthy" ? "success" : health.status === "failed" ? "error" : "loading"} label={health.status} />
              <span>{health.type}</span>
              <span>{health.errorCategory}</span>
            </div>
            <h3>{health.title}</h3>
            <p>{health.message}</p>
            <div className="metric-grid compact-metrics">
              <span><strong>{health.itemCount}</strong> items</span>
              <span><strong>{new Date(health.checkedAt).toLocaleTimeString()}</strong> checked</span>
            </div>
            <code>{health.source}</code>
            {health.sampleItems.length > 0 && (
              <div className="source-samples">
                {health.sampleItems.slice(0, 3).map((item) => (
                  <a href={item.url} target="_blank" rel="noreferrer" key={item.id}>
                    <strong>{item.title}</strong>
                    {item.summary && <small>{item.summary}</small>}
                  </a>
                ))}
              </div>
            )}
            <div className="action-row">
              <button onClick={() => selectSubscription(subscriptions.find((subscription) => subscription.id === health.id) ?? {
                id: health.id,
                title: health.title,
                type: health.type,
                source: health.source,
                enabled: health.enabled
              })}>Use in run</button>
            </div>
          </article>
        ))}
      </div>
      <div className="grid">
        <ResultPanel title="Source verification" result={results.rss} />
        <ResultPanel title="BrowserAct verification" result={results.browseract} />
      </div>
    </section>
  );
}

export function RunPanel({
  runSettings,
  setRunSettings,
  subscriptions,
  togglePlatform,
  busy,
  runPipeline,
  runEvents,
  results
}: {
  runSettings: RunSettings;
  setRunSettings: (settings: RunSettings) => void;
  subscriptions: SourceSubscription[];
  togglePlatform: (platform: Platform) => void;
  busy?: string;
  runPipeline: () => Promise<VerificationResult>;
  runEvents: Array<Record<string, unknown>>;
  results: Record<string, VerificationResult>;
}) {
  return (
    <section className="panel" id="run">
      <div className="section-title">
        <div>
          <p className="eyebrow">Pipeline</p>
          <h2>Run AI selection and draft generation</h2>
        </div>
        <button disabled={busy === "pipeline"} onClick={() => void runPipeline()}>Run pipeline</button>
      </div>
      <div className="form-grid">
        <label>Source mode<select value={runSettings.sourceMode} onChange={(event) => setRunSettings({ ...runSettings, sourceMode: event.target.value as RunSettings["sourceMode"] })}><option value="aihot">AIHot latest</option><option value="subscription">Subscription</option><option value="custom">Custom query/source</option></select></label>
        <label>Subscription<select value={runSettings.subscriptionId} onChange={(event) => setRunSettings({ ...runSettings, subscriptionId: event.target.value })}>{subscriptions.map((subscription) => <option key={subscription.id} value={subscription.id}>{subscription.title}</option>)}</select></label>
        <label>Custom query/source<input value={runSettings.customQuery} onChange={(event) => setRunSettings({ ...runSettings, customQuery: event.target.value })} /></label>
        <label>Selection count topN<input type="number" min={1} max={20} value={runSettings.topN} onChange={(event) => setRunSettings({ ...runSettings, topN: Math.max(1, Number(event.target.value) || 1) })} /></label>
      </div>
      <div className="toggle-row">
        {platformOptions.map((platform) => (
          <label key={platform}><span><input type="checkbox" checked={runSettings.platforms.includes(platform)} onChange={() => togglePlatform(platform)} /> {platform}</span></label>
        ))}
        <label><span><input type="checkbox" checked={runSettings.allowBrowserFallback} onChange={(event) => setRunSettings({ ...runSettings, allowBrowserFallback: event.target.checked })} /> BrowserAct</span></label>
        <label><span><input type="checkbox" checked={runSettings.allowMediaCrawlerFallback} onChange={(event) => setRunSettings({ ...runSettings, allowMediaCrawlerFallback: event.target.checked })} /> MediaCrawler fallback</span></label>
      </div>
      <div className="timeline">
        {stages.map((stage) => <span className={stageStatus(runEvents, stage)} key={stage}>{stage}<small>{stageStatus(runEvents, stage)}</small></span>)}
      </div>
      <ResultPanel title="Last pipeline result" result={results.pipeline} />
    </section>
  );
}

export function HistoryPanel({
  runs,
  selectedRun,
  selectedArticle,
  selectedSummary,
  loadRun
}: {
  runs: RunSummary[];
  selectedRun?: PipelineRun;
  selectedArticle?: Record<string, unknown>;
  selectedSummary?: Record<string, unknown>;
  loadRun: (runId: string) => void;
}) {
  return (
    <section className="panel" id="history">
      <div className="section-title">
        <div>
          <p className="eyebrow">History</p>
          <h2>Runs and selected content</h2>
        </div>
      </div>
      <div className="history-layout">
        <div className="subscription-list">
          {runs.slice(0, 12).map((run) => (
            <button className="list-row clickable" key={run.runId} onClick={() => loadRun(run.runId)}>
              <strong>{run.runId}</strong>
              <span>{new Date(run.updatedAt).toLocaleString()}</span>
            </button>
          ))}
        </div>
        <article className="run-detail">
          <div className="section-title compact">
            <h3>{selectedRun?.runId ?? "No run selected"}</h3>
            {selectedRun && <StatusPill state={selectedRun.status} label={selectedRun.status} />}
          </div>
          {selectedRun && (
            <>
              <div className="metric-grid">
                <span><strong>{selectedRun.sourceItems.length}</strong> items</span>
                <span><strong>{selectedRun.selections.length}</strong> selected</span>
                <span><strong>{selectedRun.verifiedArticles.filter((article) => article.status === "verified").length}</strong> verified</span>
                <span><strong>{selectedRun.drafts.length}</strong> drafts</span>
              </div>
              <h4>Selection results</h4>
              <pre>{JSON.stringify(selectedRun.selections, null, 2)}</pre>
              <h4>Original text status</h4>
              <pre>{JSON.stringify(selectedArticle ?? selectedRun.verifiedArticles[0], null, 2)}</pre>
              <h4>Chinese summary</h4>
              <pre>{JSON.stringify(selectedSummary, null, 2)}</pre>
            </>
          )}
        </article>
      </div>
    </section>
  );
}

export function ReviewPanel({
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
    <section className="panel" id="review">
      <div className="section-title">
        <div>
          <p className="eyebrow">Review</p>
          <h2>Waiting queue and human control points</h2>
        </div>
        <StatusPill state={queueMetrics.blocked > 0 ? "error" : "success"} label={`${reviewQueue.length} items`} />
      </div>
      <div className="metric-grid">
        <span><strong>{queueMetrics.blocked}</strong> blocked</span>
        <span><strong>{queueMetrics.waiting}</strong> waiting</span>
        <span><strong>{queueMetrics.review}</strong> needs review</span>
        <span><strong>{reviewQueue.filter((item) => item.priority === "high").length}</strong> high priority</span>
      </div>
      <div className="queue-list">
        {reviewQueue.length === 0 && <p className="helper">No queue items yet. Run a pipeline or select a previous run.</p>}
        {reviewQueue.map((item) => (
          <article className={`queue-card ${item.status} ${item.category === "asset" ? "asset-card" : ""}`} key={item.id}>
            <div>
              <div className="queue-head">
                <StatusPill state={item.status === "blocked" ? "error" : item.status === "ready" ? "success" : "loading"} label={item.status} />
                <span>{item.category}</span>
                {item.platform && <span>{item.platform}</span>}
                {item.priority === "high" && <span>high priority</span>}
              </div>
              <h3>{item.title}</h3>
              <p>{item.reason}</p>
              <p className="helper">{item.action}</p>
              <code>{item.runId}</code>
            </div>
            <div className="queue-actions">
              {item.evidenceUrl && <a href={item.evidenceUrl} target="_blank" rel="noreferrer">Open source</a>}
              {item.artifactPath && <button onClick={() => loadArtifact(item.artifactPath ?? "")}>Open artifact</button>}
              {item.category === "asset" && <button type="button" onClick={() => approveAsset(item)}>Approve asset</button>}
              {item.category === "asset" && <button type="button">Regenerate</button>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ReaderPanel({
  artifactButtons,
  artifact,
  loadArtifact
}: {
  artifactButtons: Array<{ label: string; path: string }>;
  artifact?: Artifact;
  loadArtifact: (artifactPath: string) => void;
}) {
  return (
    <section className="panel" id="reader">
      <div className="section-title">
        <div>
          <p className="eyebrow">Reader</p>
          <h2>Original text and platform drafts</h2>
        </div>
      </div>
      <div className="action-row">
        {artifactButtons.map((button) => (
          <button key={button.path} onClick={() => loadArtifact(button.path)}>{button.label}</button>
        ))}
      </div>
      <article className="reader">
        <div className="section-title compact">
          <h3>{artifact?.path ?? "Select an artifact"}</h3>
        </div>
        <pre>{artifact?.content ?? "Run a pipeline or select a previous run, then open original text or draft artifacts here."}</pre>
      </article>
    </section>
  );
}
