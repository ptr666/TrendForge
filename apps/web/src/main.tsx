import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type ApiState = "idle" | "loading" | "success" | "error";

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

interface ProviderState {
  browserAct?: { enabled: boolean; command: string };
  text?: { provider: string; baseUrl: string; model: string; keyConfigured: boolean; keyPreview?: string };
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
  summaries: Array<Record<string, unknown>>;
  drafts: Array<{ id: string; platform: string; title: string; artifactPath?: string }>;
  assets: Array<Record<string, unknown>>;
  publishResults: Array<Record<string, unknown>>;
}

const apiBase = import.meta.env.VITE_TRENDFORGE_API ?? "http://127.0.0.1:4780";
const stages = ["collect", "verify", "select", "fetch_full_text", "summarize", "generate", "compose_media", "publish"];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

function StatusPill({ state, label }: { state: ApiState | boolean; label: string }) {
  const className = typeof state === "boolean" ? (state ? "ok" : "warn") : state;
  return <span className={`pill ${className}`}>{label}</span>;
}

function ResultPanel({ title, result }: { title: string; result?: VerificationResult }) {
  return (
    <section className="result-panel" aria-live="polite">
      <div className="section-title">
        <h3>{title}</h3>
        {result && <StatusPill state={Boolean(result.ok)} label={result.ok ? "verified" : "needs attention"} />}
      </div>
      <pre>{result ? JSON.stringify(result, null, 2) : "No result yet."}</pre>
    </section>
  );
}

function App() {
  const [health, setHealth] = useState<ApiState>("idle");
  const [providers, setProviders] = useState<ProviderState>({});
  const [subscriptions, setSubscriptions] = useState<SourceSubscription[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<PipelineRun | undefined>();
  const [rssSource, setRssSource] = useState("tests/fixtures/rss/ai-workflow.xml");
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
  const [results, setResults] = useState<Record<string, VerificationResult>>({});
  const [busy, setBusy] = useState<string | undefined>();

  async function refresh() {
    setHealth("loading");
    try {
      await api("/health");
      const [providerData, subscriptionData, runData] = await Promise.all([
        api<ProviderState>("/providers"),
        api<{ subscriptions: SourceSubscription[] }>("/subscriptions"),
        api<{ runs: RunSummary[] }>("/runs")
      ]);
      setProviders(providerData);
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

  async function saveSubscription() {
    const merged = [...subscriptions.filter((item) => item.id !== newSubscription.id), newSubscription];
    await api("/subscriptions", { method: "PUT", body: JSON.stringify({ subscriptions: merged }) });
    await refresh();
  }

  async function runPipeline() {
    const run = await api<PipelineRun>("/pipeline/run", {
      method: "POST",
      body: JSON.stringify({
        runId: `web-${Date.now()}`,
        query: rssSource,
        requestedPlatforms: ["review", "wechat", "xhs"],
        allowBrowserFallback: true,
        allowMediaCrawlerFallback: false,
        allowRealDraft: false,
        topN: 1
      })
    });
    setSelectedRun(run);
    await refresh();
    return { ok: run.status === "success", status: run.status, runId: run.runId, drafts: run.drafts };
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">TF</span>
          <div>
            <h1>TrendForge</h1>
            <p>Local AI publishing cockpit</p>
          </div>
        </div>
        <nav aria-label="Pipeline stages">
          {stages.map((stage, index) => (
            <a href={`#${stage}`} key={stage}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {stage.replaceAll("_", " ")}
            </a>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="hero">
          <div>
            <p className="eyebrow">Workbench</p>
            <h2>Verify sources, providers, and complete publishing drafts from one control plane.</h2>
            <p className="hero-copy">Real BrowserAct, MediaCrawler, and model checks only run when you press a verification button.</p>
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
            <h3>DeepSeek / Model</h3>
            <p>{providers.text?.model ?? "deterministic"}</p>
            <StatusPill state={Boolean(providers.text?.keyConfigured)} label={providers.text?.provider ?? "deterministic"} />
          </article>
          <article className="card">
            <h3>MediaCrawler</h3>
            <p>{providers.mediaCrawler?.allowedPlatforms?.join(", ") ?? "xhs, dy, bili, wb, zhihu"}</p>
            <StatusPill state={Boolean(providers.mediaCrawler?.enabled)} label={providers.mediaCrawler?.enabled ? "enabled" : "gated"} />
          </article>
        </section>

        <section className="panel" id="collect">
          <div className="section-title">
            <div>
              <p className="eyebrow">Sources</p>
              <h2>RSS subscriptions</h2>
            </div>
            <button onClick={() => void saveSubscription()}>Save subscription</button>
          </div>
          <div className="form-grid">
            <label>ID<input value={newSubscription.id} onChange={(event) => setNewSubscription({ ...newSubscription, id: event.target.value })} /></label>
            <label>Title<input value={newSubscription.title} onChange={(event) => setNewSubscription({ ...newSubscription, title: event.target.value })} /></label>
            <label>Type<select value={newSubscription.type} onChange={(event) => setNewSubscription({ ...newSubscription, type: event.target.value as SourceSubscription["type"] })}><option value="rss">rss</option><option value="rsshub">rsshub</option><option value="aihot">aihot</option></select></label>
            <label>Source<input value={newSubscription.source} onChange={(event) => setNewSubscription({ ...newSubscription, source: event.target.value })} /></label>
          </div>
          <div className="subscription-list">
            {subscriptions.map((subscription) => (
              <div key={subscription.id} className="list-row">
                <strong>{subscription.title}</strong>
                <span>{subscription.type}</span>
                <code>{subscription.source}</code>
                <StatusPill state={subscription.enabled} label={subscription.enabled ? "enabled" : "disabled"} />
              </div>
            ))}
          </div>
        </section>

        <section className="panel" id="verify">
          <div className="section-title">
            <div>
              <p className="eyebrow">Verification Lab</p>
              <h2>Real provider checks</h2>
            </div>
          </div>
          <div className="form-grid">
            <label>RSS or fixture<input value={rssSource} onChange={(event) => setRssSource(event.target.value)} /></label>
            <label>BrowserAct URL<input value={browserUrl} onChange={(event) => setBrowserUrl(event.target.value)} /></label>
          </div>
          <div className="action-row">
            <button disabled={busy === "rss"} onClick={() => void runAction("rss", () => api("/verify/rss", { method: "POST", body: JSON.stringify({ source: rssSource }) }))}>Verify RSS</button>
            <button disabled={busy === "browseract"} onClick={() => void runAction("browseract", () => api("/verify/browseract", { method: "POST", body: JSON.stringify({ url: browserUrl }) }))}>Run BrowserAct</button>
            <button disabled={busy === "mediacrawler"} onClick={() => void runAction("mediacrawler", () => api("/verify/mediacrawler", { method: "POST", body: JSON.stringify({ enabled: true }) }))}>Check MediaCrawler</button>
            <button disabled={busy === "model"} onClick={() => void runAction("model", () => api("/verify/model", { method: "POST" }))}>Call DeepSeek</button>
          </div>
          <div className="grid">
            <ResultPanel title="RSS" result={results.rss} />
            <ResultPanel title="BrowserAct" result={results.browseract} />
            <ResultPanel title="MediaCrawler" result={results.mediacrawler} />
            <ResultPanel title="Model" result={results.model} />
          </div>
        </section>

        <section className="panel" id="publish">
          <div className="section-title">
            <div>
              <p className="eyebrow">Pipeline</p>
              <h2>Run full draft flow</h2>
            </div>
            <button disabled={busy === "pipeline"} onClick={() => void runAction("pipeline", runPipeline)}>Run pipeline</button>
          </div>
          <div className="timeline">
            {stages.map((stage) => <span key={stage}>{stage}</span>)}
          </div>
          {selectedRun && (
            <div className="draft-grid">
              {selectedRun.drafts.map((draft) => (
                <article className="draft-card" key={draft.id}>
                  <span>{draft.platform}</span>
                  <h3>{draft.title}</h3>
                  <code>{draft.artifactPath ?? "no artifact yet"}</code>
                </article>
              ))}
            </div>
          )}
          <ResultPanel title="Last pipeline result" result={results.pipeline} />
        </section>

        <section className="panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">History</p>
              <h2>Recent runs</h2>
            </div>
          </div>
          <div className="subscription-list">
            {runs.slice(0, 8).map((run) => (
              <button className="list-row clickable" key={run.runId} onClick={async () => setSelectedRun(await api<PipelineRun>(`/runs/${encodeURIComponent(run.runId)}`))}>
                <strong>{run.runId}</strong>
                <span>{new Date(run.updatedAt).toLocaleString()}</span>
              </button>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
