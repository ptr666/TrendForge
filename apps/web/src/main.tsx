import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api.js";
import {
  ConfigPanel,
  Hero,
  HistoryPanel,
  ReaderPanel,
  ReviewPanel,
  Sidebar,
  SourcesPanel,
  StatusGrid,
  RunPanel,
  asString,
  platformOptions
} from "./components/panels.js";
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
} from "./types.js";
import "./styles.css";

function App() {
  const [health, setHealth] = useState<ApiState>("idle");
  const [providers, setProviders] = useState<ProviderState>({});
  const [publisherHealth, setPublisherHealth] = useState<PublisherHealth[]>([]);
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
    secretConfigured: false,
    coverMediaId: ""
  });
  const [wechatSecret, setWechatSecret] = useState("");
  const [xhsConfig, setXhsConfig] = useState<PublicXhsConfig>({
    enabled: false,
    projectDir: "vendor/xiaohongshu-skills",
    bridgeUrl: "ws://localhost:9343"
  });
  const [subscriptions, setSubscriptions] = useState<SourceSubscription[]>([]);
  const [sourceHealth, setSourceHealth] = useState<SourceHealth[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<PipelineRun | undefined>();
  const [runEvents, setRunEvents] = useState<Array<Record<string, unknown>>>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
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
      const [providerData, modelData, wechatData, xhsData, subscriptionData, sourceHealthData, runData, queueData, publisherData] = await Promise.all([
        api<ProviderState>("/providers"),
        api<PublicModelConfig>("/config/model"),
        api<PublicWechatConfig>("/config/wechat"),
        api<PublicXhsConfig>("/config/xhs"),
        api<{ subscriptions: SourceSubscription[] }>("/subscriptions"),
        api<{ health: SourceHealth[] }>("/sources/health"),
        api<{ runs: RunSummary[] }>("/runs"),
        api<{ queue: ReviewQueueItem[] }>("/review-queue"),
        api<{ publishers: PublisherHealth[] }>("/publishers")
      ]);
      setProviders(providerData);
      setModelConfig(modelData);
      setWechatConfig(wechatData);
      setXhsConfig(xhsData);
      setSubscriptions(subscriptionData.subscriptions);
      setSourceHealth(sourceHealthData.health);
      setRuns(runData.runs);
      setReviewQueue(queueData.queue);
      setPublisherHealth(publisherData.publishers);
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
        coverMediaId: wechatConfig.coverMediaId,
        keepExistingSecret: wechatConfig.secretConfigured && wechatSecret.trim().length === 0
      })
    });
    setWechatConfig(saved);
    setWechatSecret("");
    await refresh();
  }

  async function saveXhsConfig() {
    const saved = await api<PublicXhsConfig>("/config/xhs", {
      method: "PUT",
      body: JSON.stringify(xhsConfig)
    });
    setXhsConfig(saved);
    await refresh();
  }

  async function saveSubscription() {
    const merged = [...subscriptions.filter((item) => item.id !== newSubscription.id), newSubscription];
    await api("/subscriptions", { method: "PUT", body: JSON.stringify({ subscriptions: merged }) });
    await refresh();
  }

  async function loadRun(runId: string) {
    const [run, events, queue] = await Promise.all([
      api<PipelineRun>(`/runs/${encodeURIComponent(runId)}`),
      api<{ events: Array<Record<string, unknown>> }>(`/runs/${encodeURIComponent(runId)}/events`),
      api<{ queue: ReviewQueueItem[] }>(`/runs/${encodeURIComponent(runId)}/review-queue`)
    ]);
    setSelectedRun(run);
    setRunEvents(events.events);
    setReviewQueue(queue.queue);
    setArtifact(undefined);
  }

  async function loadArtifact(artifactPath: string) {
    setArtifact(await api<Artifact>(`/artifacts?path=${encodeURIComponent(artifactPath)}`));
  }

  async function approveAsset(item: ReviewQueueItem) {
    if (!item.runId || !item.id.includes(":asset:")) return;
    const assetId = item.id.split(":asset:")[1];
    if (!assetId) return;
    await api(`/runs/${encodeURIComponent(item.runId)}/assets/${encodeURIComponent(assetId)}/approve`, { method: "POST" });
    await loadRun(item.runId);
    await refresh();
  }

  function togglePlatform(platform: Platform) {
    setRunSettings((current) => {
      const platforms = current.platforms.includes(platform)
        ? current.platforms.filter((candidate) => candidate !== platform)
        : [...current.platforms, platform];
      return { ...current, platforms: platforms.length > 0 ? platforms : ["review"] };
    });
  }

  function selectSubscription(subscription: SourceSubscription) {
    setRunSettings({ ...runSettings, sourceMode: "subscription", subscriptionId: subscription.id });
    setNewSubscription(subscription);
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
  const queueMetrics = {
    blocked: reviewQueue.filter((item) => item.status === "blocked").length,
    waiting: reviewQueue.filter((item) => item.status === "waiting").length,
    review: reviewQueue.filter((item) => item.status === "needs-review").length
  };
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
      <Sidebar />

      <section className="workspace">
        <Hero health={health} refresh={() => void refresh()} />
        <StatusGrid providers={providers} publisherHealth={publisherHealth} modelConfig={modelConfig} wechatConfig={wechatConfig} reviewQueue={reviewQueue} queueMetrics={queueMetrics} />
        <ConfigPanel
          modelConfig={modelConfig}
          setModelConfig={setModelConfig}
          modelApiKey={modelApiKey}
          setModelApiKey={setModelApiKey}
          saveModelConfig={saveModelConfig}
          wechatConfig={wechatConfig}
          setWechatConfig={setWechatConfig}
          wechatSecret={wechatSecret}
          setWechatSecret={setWechatSecret}
          saveWechatConfig={saveWechatConfig}
          xhsConfig={xhsConfig}
          setXhsConfig={setXhsConfig}
          saveXhsConfig={saveXhsConfig}
          busy={busy}
          runAction={(name, action) => void runAction(name, action)}
          results={results}
        />
        <SourcesPanel
          subscriptions={subscriptions}
          sourceHealth={sourceHealth}
          newSubscription={newSubscription}
          setNewSubscription={setNewSubscription}
          saveSubscription={saveSubscription}
          browserUrl={browserUrl}
          setBrowserUrl={setBrowserUrl}
          busy={busy}
          runAction={(name, action) => void runAction(name, action)}
          results={results}
          selectSubscription={selectSubscription}
        />
        <RunPanel
          runSettings={runSettings}
          setRunSettings={setRunSettings}
          subscriptions={subscriptions}
          togglePlatform={togglePlatform}
          busy={busy}
          runPipeline={runPipeline}
          runEvents={runEvents}
          results={results}
        />
        <HistoryPanel runs={runs} selectedRun={selectedRun} selectedArticle={selectedArticle} selectedSummary={selectedSummary} loadRun={(runId) => void loadRun(runId)} />
        <ReviewPanel reviewQueue={reviewQueue} queueMetrics={queueMetrics} loadArtifact={(artifactPath) => void loadArtifact(artifactPath)} approveAsset={(item) => void approveAsset(item)} />
        <ReaderPanel artifactButtons={artifactButtons} artifact={artifact} loadArtifact={(artifactPath) => void loadArtifact(artifactPath)} />
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
