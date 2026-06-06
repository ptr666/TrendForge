import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type ApiState = "idle" | "loading" | "success" | "error";
type Platform = "review" | "wechat" | "xhs";

interface SourceSubscription {
  id: string;
  title: string;
  type: "aihot" | "rss" | "rsshub";
  source: string;
  enabled: boolean;
  priority?: number;
  tags?: string[];
}

interface RunSummary {
  runId: string;
  updatedAt: string;
}

interface PublicModelConfig {
  enabled: boolean;
  provider: "deterministic" | "openai-compatible";
  baseUrl: string;
  model: string;
  keyConfigured: boolean;
  keyPreview?: string;
}

interface PublicWechatConfig {
  enabled: boolean;
  appId: string;
  secretConfigured: boolean;
  secretPreview?: string;
}

interface ProviderState {
  browserAct?: { enabled: boolean; command: string };
  text?: { provider: string; baseUrl: string; model: string; keyConfigured: boolean; keyPreview?: string };
  localModel?: PublicModelConfig;
  wechat?: PublicWechatConfig;
  mediaCrawler?: { enabled: boolean; requiresComplianceCheck: boolean; allowedPlatforms: string[] };
}

interface VerificationResult {
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

interface PipelineRun {
  runId: string;
  status: string;
  sourceItems: Array<Record<string, unknown>>;
  verifiedArticles: Array<Record<string, unknown>>;
  selections: Array<Record<string, unknown>>;
  summaries: Array<Record<string, unknown>>;
  drafts: Array<{ id: string; platform: Platform; title: string; artifactPath?: string; body?: string }>;
  assets: Array<Record<string, unknown>>;
  publishResults: Array<Record<string, unknown>>;
  errors: Array<Record<string, unknown>>;
}

interface Artifact {
  path: string;
  content: string;
}

interface RunSettings {
  sourceMode: "aihot" | "subscription" | "custom";
  subscriptionId: string;
  customQuery: string;
  topN: number;
  platforms: Platform[];
  allowBrowserFallback: boolean;
  allowMediaCrawlerFallback: boolean;
}

const apiBase = import.meta.env.VITE_TRENDFORGE_API ?? "http://127.0.0.1:4780";
const stages = ["collect", "verify", "score", "fetch_full_text", "select", "summarize", "generate", "compose_media", "publish"];
const platformOptions: Platform[] = ["review", "wechat", "xhs"];

async function api<T>(apiPath: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${apiPath}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

function StatusPill({ state, label }: { state: ApiState | boolean | string; label: string }) {
  const className = typeof state === "boolean" ? (state ? "ok" : "warn") : state;
  return <span className={`pill ${className}`}>{label}</span>;
}

function ResultPanel({ title, result }: { title: string; result?: VerificationResult }) {
  return (
    <section className="result-panel" aria-live="polite">
      <div className="section-title compact">
        <h3>{title}</h3>
        {result && <StatusPill state={Boolean(result.ok)} label={result.ok ? "verified" : "needs attention"} />}
      </div>
      <pre>{result ? JSON.stringify(result, null, 2) : "No result yet."}</pre>
    </section>
  );
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stageStatus(events: Array<Record<string, unknown>>, stage: string): string {
  const matching = events.filter((event) => event.stage === stage);
  const latest = matching.at(-1);
  if (!latest) return "idle";
  return asString(latest.status) || "seen";
}

function App() {
  const [health, setHealth] = useState<ApiState>("idle");
  const [providers, setProviders] = useState<ProviderState>({});
  const [modelConfig, setModelConfig] = useState<PublicModelConfig>({
    enabled: false,
    provider: "deterministic",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    keyConfigured: false
  });
  const [modelApiKey, setModelApiKey] = useState("");
  const [wechatConfig, setWechatConfig] = useState<PublicWechatConfig>({
    enabled: false,
    appId: "",
    secretConfigured: false
  });
  const [wechatSecret, setWechatSecret] = useState("");
  const [subscriptions, setSubscriptions] = useState<SourceSubscription[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<PipelineRun | undefined>();
  const [runEvents, setRunEvents] = useState<Array<Record<string, unknown>>>([]);
  const [artifact, setArtifact] = useState<Artifact | undefined>();
  const [browserUrl, setBrowserUrl] = useState("https://example.com");
  const [newSubscription, setNewSubscription] = useState<SourceSubscription>({
    id: "local-ai-rss",
    title: "Local AI RSS",
    type: "rss",
    source: "https://example.com/feed.xml",
    enabled: true,
    priority: 2,
    tags: ["ui"]
  });
  const [runSettings, setRunSettings] = useState<RunSettings>({
    sourceMode: "aihot",
    subscriptionId: "aihot-skill",
    customQuery: "",
    topN: 1,
    platforms: ["review", "wechat", "xhs"],
    allowBrowserFallback: true,
    allowMediaCrawlerFallback: false
  });
  const [results, setResults] = useState<Record<string, VerificationResult>>({});
  const [busy, setBusy] = useState<string | undefined>();

  async function refresh() {
    setHealth("loading");
    try {
      const [providerData, modelData, wechatData, subscriptionData, runData] = await Promise.all([
        api<ProviderState>("/providers"),
        api<PublicModelConfig>("/config/model"),
        api<PublicWechatConfig>("/config/wechat"),
        api<{ subscriptions: SourceSubscription[] }>("/subscriptions"),
        api<{ runs: RunSummary[] }>("/runs")
      ]);
      setProviders(providerData);
      setModelConfig(modelData);
      setWechatConfig(wechatData);
      setSubscriptions(subscriptionData.subscriptions);
      setRuns(runData.runs);
      setHealth("success");
    } catch {
      setHealth("error");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function runAction(name: string, action: () => Promise<VerificationResult>) {
    setBusy(name);
    try {
      const result = await action();
      setResults((current) => ({ ...current, [name]: result }));
      await refresh();
    } catch (error) {
      setResults((current) => ({
        ...current,
        [name]: { ok: false, failureReason: error instanceof Error ? error.message : String(error) }
      }));
    } finally {
      setBusy(undefined);
    }
  }

  async function saveModelConfig() {
    const saved = await api<PublicModelConfig>("/config/model", {
      method: "PUT",
      body: JSON.stringify({
        enabled: modelConfig.enabled,
        provider: modelConfig.provider,
        baseUrl: modelConfig.baseUrl,
        model: modelConfig.model,
        apiKey: modelApiKey,
        keepExistingKey: modelConfig.keyConfigured && modelApiKey.trim().length === 0
      })
    });
    setModelConfig(saved);
    setModelApiKey("");
    await refresh();
  }

  async function saveWechatConfig() {
    const saved = await api<PublicWechatConfig>("/config/wechat", {
      method: "PUT",
      body: JSON.stringify({
        enabled: wechatConfig.enabled,
        appId: wechatConfig.appId,
        appSecret: wechatSecret,
        keepExistingSecret: wechatConfig.secretConfigured && wechatSecret.trim().length === 0
      })
    });
    setWechatConfig(saved);
    setWechatSecret("");
    await refresh();
  }

  async function saveSubscription() {
    const merged = [...subscriptions.filter((item) => item.id !== newSubscription.id), newSubscription];
    await api("/subscriptions", { method: "PUT", body: JSON.stringify({ subscriptions: merged }) });
    await refresh();
  }

  async function loadRun(runId: string) {
    const [run, events] = await Promise.all([
      api<PipelineRun>(`/runs/${encodeURIComponent(runId)}`),
      api<{ events: Array<Record<string, unknown>> }>(`/runs/${encodeURIComponent(runId)}/events`)
    ]);
    setSelectedRun(run);
    setRunEvents(events.events);
    setArtifact(undefined);
  }

  async function loadArtifact(artifactPath: string) {
    setArtifact(await api<Artifact>(`/artifacts?path=${encodeURIComponent(artifactPath)}`));
  }

  function togglePlatform(platform: Platform) {
    setRunSettings((current) => {
      const platforms = current.platforms.includes(platform)
        ? current.platforms.filter((candidate) => candidate !== platform)
        : [...current.platforms, platform];
      return { ...current, platforms: platforms.length > 0 ? platforms : ["review"] };
    });
  }

  function currentRunQuery(): string | undefined {
    if (runSettings.sourceMode === "aihot") return undefined;
    if (runSettings.sourceMode === "subscription") {
      return subscriptions.find((subscription) => subscription.id === runSettings.subscriptionId)?.source;
    }
    return runSettings.customQuery;
  }

  async function runPipeline() {
    const run = await api<PipelineRun>("/pipeline/run", {
      method: "POST",
      body: JSON.stringify({
        runId: `web-${Date.now()}`,
        query: currentRunQuery(),
        requestedPlatforms: runSettings.platforms,
        allowBrowserFallback: runSettings.allowBrowserFallback,
        allowMediaCrawlerFallback: runSettings.allowMediaCrawlerFallback,
        allowRealDraft: false,
        topN: runSettings.topN
      })
    });
    await refresh();
    await loadRun(run.runId);
    return { ok: run.status === "success", status: run.status, runId: run.runId, drafts: run.drafts };
  }

  const selectedArticle = selectedRun?.verifiedArticles.find((article) => selectedRun.selections.some((selection) => selection.sourceItemId === article.sourceItemId));
  const selectedSummary = selectedRun?.summaries[0];
  const artifactButtons = [
    ...(selectedRun?.verifiedArticles ?? [])
      .filter((article) => typeof article.fullTextArtifactPath === "string")
      .map((article) => ({ label: `原文 ${article.sourceItemId}`, path: asString(article.fullTextArtifactPath) })),
    ...(selectedRun?.drafts ?? [])
      .filter((draft) => typeof draft.artifactPath === "string")
      .map((draft) => ({ label: `${draft.platform} 草稿`, path: draft.artifactPath ?? "" }))
  ];

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">TF</span>
          <div>
            <h1>TrendForge</h1>
            <p>Visual AI publishing cockpit</p>
          </div>
        </div>
        <nav aria-label="Workbench sections">
          {["config", "sources", "run", "history", "reader"].map((section, index) => (
            <a href={`#${section}`} key={section}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {section}
            </a>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="hero">
          <div>
            <p className="eyebrow">Workbench</p>
            <h2>Manage the full AIHot to WeChat/XHS publishing flow visually.</h2>
            <p className="hero-copy">Configure providers, run AI selection, inspect original text, and review platform drafts from one local control plane.</p>
          </div>
          <div className="hero-actions">
            <StatusPill state={health} label={`API ${health}`} />
            <button onClick={() => void refresh()} disabled={health === "loading"}>Refresh</button>
          </div>
        </header>

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
            <p>{wechatConfig.appId || "No appId configured"}</p>
            <StatusPill state={wechatConfig.enabled && wechatConfig.secretConfigured} label={wechatConfig.secretConfigured ? "secret ready" : "needs secret"} />
          </article>
        </section>

        <section className="panel" id="config">
          <div className="section-title">
            <div>
              <p className="eyebrow">Configuration</p>
              <h2>Model and WeChat official account</h2>
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
              <button disabled={busy === "model"} onClick={() => void runAction("model", () => api("/verify/model", { method: "POST" }))}>Test model request</button>
            </article>

            <article className="settings-card">
              <div className="section-title compact">
                <h3>WeChat official account</h3>
                <button onClick={() => void saveWechatConfig()}>Save WeChat</button>
              </div>
              <label><span><input type="checkbox" checked={wechatConfig.enabled} onChange={(event) => setWechatConfig({ ...wechatConfig, enabled: event.target.checked })} /> Enable WeChat API</span></label>
              <label>App ID<input value={wechatConfig.appId} onChange={(event) => setWechatConfig({ ...wechatConfig, appId: event.target.value })} /></label>
              <label>App Secret<input type="password" value={wechatSecret} placeholder={wechatConfig.secretPreview ?? "New app secret"} onChange={(event) => setWechatSecret(event.target.value)} /></label>
              <button disabled={busy === "wechat"} onClick={() => void runAction("wechat", () => api("/verify/wechat", { method: "POST" }))}>Request WeChat token</button>
              <p className="helper">后台会真实请求微信 token 接口，但响应只显示脱敏 token 或错误码。</p>
            </article>
          </div>
          <div className="grid">
            <ResultPanel title="Model test" result={results.model} />
            <ResultPanel title="WeChat request" result={results.wechat} />
          </div>
        </section>

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
            <button disabled={busy === "rss"} onClick={() => void runAction("rss", () => api("/verify/rss", { method: "POST", body: JSON.stringify({ source: newSubscription.source }) }))}>Verify source</button>
            <button disabled={busy === "browseract"} onClick={() => void runAction("browseract", () => api("/verify/browseract", { method: "POST", body: JSON.stringify({ url: browserUrl }) }))}>Run BrowserAct URL</button>
            <button disabled={busy === "mediacrawler"} onClick={() => void runAction("mediacrawler", () => api("/verify/mediacrawler", { method: "POST", body: JSON.stringify({ enabled: true }) }))}>Check MediaCrawler</button>
          </div>
          <label>BrowserAct test URL<input value={browserUrl} onChange={(event) => setBrowserUrl(event.target.value)} /></label>
          <div className="subscription-list">
            {subscriptions.map((subscription) => (
              <button className="list-row clickable" key={subscription.id} onClick={() => {
                setRunSettings({ ...runSettings, sourceMode: "subscription", subscriptionId: subscription.id });
                setNewSubscription(subscription);
              }}>
                <strong>{subscription.title}</strong>
                <span>{subscription.type}</span>
                <code>{subscription.source}</code>
                <StatusPill state={subscription.enabled} label={subscription.enabled ? "enabled" : "disabled"} />
              </button>
            ))}
          </div>
          <div className="grid">
            <ResultPanel title="Source verification" result={results.rss} />
            <ResultPanel title="BrowserAct verification" result={results.browseract} />
          </div>
        </section>

        <section className="panel" id="run">
          <div className="section-title">
            <div>
              <p className="eyebrow">Pipeline</p>
              <h2>Run AI selection and draft generation</h2>
            </div>
            <button disabled={busy === "pipeline"} onClick={() => void runAction("pipeline", runPipeline)}>Run pipeline</button>
          </div>
          <div className="form-grid">
            <label>Source mode<select value={runSettings.sourceMode} onChange={(event) => setRunSettings({ ...runSettings, sourceMode: event.target.value as RunSettings["sourceMode"] })}><option value="aihot">AIHot latest</option><option value="subscription">Subscription</option><option value="custom">Custom query/source</option></select></label>
            <label>Subscription<select value={runSettings.subscriptionId} onChange={(event) => setRunSettings({ ...runSettings, subscriptionId: event.target.value })}>{subscriptions.map((subscription) => <option key={subscription.id} value={subscription.id}>{subscription.title}</option>)}</select></label>
            <label>Custom query/source<input value={runSettings.customQuery} onChange={(event) => setRunSettings({ ...runSettings, customQuery: event.target.value })} /></label>
            <label>筛选数量 topN<input type="number" min={1} max={20} value={runSettings.topN} onChange={(event) => setRunSettings({ ...runSettings, topN: Math.max(1, Number(event.target.value) || 1) })} /></label>
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
                <button className="list-row clickable" key={run.runId} onClick={() => void loadRun(run.runId)}>
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
                  <h4>筛选结果</h4>
                  <pre>{JSON.stringify(selectedRun.selections, null, 2)}</pre>
                  <h4>原文状态</h4>
                  <pre>{JSON.stringify(selectedArticle ?? selectedRun.verifiedArticles[0], null, 2)}</pre>
                  <h4>中文总结</h4>
                  <pre>{JSON.stringify(selectedSummary, null, 2)}</pre>
                </>
              )}
            </article>
          </div>
        </section>

        <section className="panel" id="reader">
          <div className="section-title">
            <div>
              <p className="eyebrow">Reader</p>
              <h2>Original text and platform drafts</h2>
            </div>
          </div>
          <div className="action-row">
            {artifactButtons.map((button) => (
              <button key={button.path} onClick={() => void loadArtifact(button.path)}>{button.label}</button>
            ))}
          </div>
          <article className="reader">
            <div className="section-title compact">
              <h3>{artifact?.path ?? "Select an artifact"}</h3>
            </div>
            <pre>{artifact?.content ?? "Run a pipeline or select a previous run, then open original text or draft artifacts here."}</pre>
          </article>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
