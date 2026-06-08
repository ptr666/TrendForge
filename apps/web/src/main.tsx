import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api.js";
import {
  AiHotDailyPanel,
  CandidateReviewList,
  ConfigPanel,
  DraftPreviewGrid,
  Hero,
  HistoryPanel,
  IssuesPanel,
  ScreenPanel,
  Sidebar,
  StatusGrid,
  asString
} from "./components/panels.js";
import { ResultDialog } from "./components/ui.js";
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
} from "./types.js";
import "./styles.css";

const actionTitles: Record<string, string> = {
  refresh: "AIHot 刷新结果",
  model: "模型测试结果",
  wechat: "微信请求结果",
  xhs: "小红书 gate 检查结果",
  screen: "热点分析结果",
  drafts: "草稿生成结果",
  "run-delete": "历史删除结果",
  "runs-clear": "历史清空结果"
};

function aiHotItemId(item: Record<string, unknown>, index: number): string {
  return asString(item.id) || asString(item.url) || `aihot-item-${index}`;
}

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
  const [aiHotLatest, setAiHotLatest] = useState<AiHotLatest | undefined>();
  const [selectedAiHotItemIds, setSelectedAiHotItemIds] = useState<string[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<PipelineRun | undefined>();
  const [runEvents, setRunEvents] = useState<Array<Record<string, unknown>>>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [artifact, setArtifact] = useState<Artifact | undefined>();
  const [runSettings, setRunSettings] = useState<RunSettings>({
    selectedSourceIds: ["aihot-default"],
    selectedAiHotItemIds: [],
    candidateCount: 3,
    selectedCandidateIds: [],
    platforms: ["review", "wechat", "xhs"],
    allowBrowserFallback: true,
    allowMediaCrawlerFallback: false
  });
  const [results, setResults] = useState<Record<string, VerificationResult>>({});
  const [activeResult, setActiveResult] = useState<{ title: string; result: VerificationResult } | undefined>();
  const [busy, setBusy] = useState<string | undefined>();

  async function refresh(options: { quiet?: boolean } = {}): Promise<AiHotLatest | undefined> {
    setHealth("loading");
    try {
      const [providerData, modelData, wechatData, xhsData, aiHotData, runData, publisherData] = await Promise.all([
        api<ProviderState>("/providers"),
        api<PublicModelConfig>("/config/model"),
        api<PublicWechatConfig>("/config/wechat"),
        api<PublicXhsConfig>("/config/xhs"),
        api<AiHotLatest>("/sources/aihot/latest"),
        api<{ runs: RunSummary[] }>("/runs"),
        api<{ publishers: PublisherHealth[] }>("/publishers")
      ]);
      setProviders(providerData);
      setModelConfig(modelData);
      setWechatConfig(wechatData);
      setXhsConfig(xhsData);
      setAiHotLatest(aiHotData);
      setRuns(runData.runs);
      setPublisherHealth(publisherData.publishers);
      setSelectedAiHotItemIds((current) => {
        const availableIds = new Set(aiHotData.items.map(aiHotItemId));
        return current.filter((id) => availableIds.has(id));
      });
      setHealth("success");
      if (!options.quiet) {
        setResults((current) => ({
          ...current,
          refresh: {
            ok: aiHotData.health.status !== "failed",
            count: aiHotData.items.length,
            message: aiHotData.health.status === "failed"
              ? aiHotData.health.message
              : `AIHot 刷新完成，共获取 ${aiHotData.items.length} 条内容。`
          }
        }));
      }
      return aiHotData;
    } catch (error) {
      setHealth("error");
      if (!options.quiet) {
        setResults((current) => ({
          ...current,
          refresh: { ok: false, failureReason: error instanceof Error ? error.message : String(error) }
        }));
      }
      return undefined;
    }
  }

  useEffect(() => {
    void refresh({ quiet: true });
  }, []);

  async function runAction(name: string, action: () => Promise<VerificationResult>) {
    setBusy(name);
    try {
      const result = await action();
      setResults((current) => ({ ...current, [name]: result }));
      setActiveResult({ title: actionTitles[name] ?? "操作结果", result });
      await refresh({ quiet: true });
    } catch (error) {
      const result = { ok: false, failureReason: error instanceof Error ? error.message : String(error) };
      setResults((current) => ({ ...current, [name]: result }));
      setActiveResult({ title: actionTitles[name] ?? "操作结果", result });
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
    await refresh({ quiet: true });
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
    await refresh({ quiet: true });
  }

  async function saveXhsConfig() {
    const saved = await api<PublicXhsConfig>("/config/xhs", {
      method: "PUT",
      body: JSON.stringify(xhsConfig)
    });
    setXhsConfig(saved);
    await refresh({ quiet: true });
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
    setRunSettings((current) => ({
      ...current,
      selectedCandidateIds: run.candidateReviews?.map((candidate) => candidate.sourceItemId) ?? current.selectedCandidateIds
    }));
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
    await refresh({ quiet: true });
  }

  function clearSelectedRunState() {
    setSelectedRun(undefined);
    setRunEvents([]);
    setReviewQueue([]);
    setArtifact(undefined);
    setRunSettings((current) => ({ ...current, selectedCandidateIds: [] }));
  }

  async function deleteRun(runId: string) {
    if (!window.confirm(`确定删除运行历史 ${runId} 吗？`)) return;
    await runAction("run-delete", async () => {
      const response = await api<VerificationResult>(`/runs/${encodeURIComponent(runId)}`, { method: "DELETE" });
      if (selectedRun?.runId === runId) clearSelectedRunState();
      return { ...response, message: `运行历史 ${runId} 已删除。` };
    });
  }

  async function clearRuns() {
    if (!window.confirm("确定清空全部运行历史吗？该操作会删除本地 runs 和产物。")) return;
    await runAction("runs-clear", async () => {
      const response = await api<VerificationResult & { deleted?: number }>("/runs", { method: "DELETE" });
      clearSelectedRunState();
      return { ...response, count: response.deleted, message: `已清空 ${response.deleted ?? 0} 条运行历史。` };
    });
  }

  function toggleAiHotItem(sourceItemId: string) {
    setSelectedAiHotItemIds((current) => current.includes(sourceItemId)
      ? current.filter((id) => id !== sourceItemId)
      : [...current, sourceItemId]);
  }

  function selectAllAiHotItems() {
    setSelectedAiHotItemIds((aiHotLatest?.items ?? []).map(aiHotItemId));
  }

  function toggleCandidate(sourceItemId: string) {
    setRunSettings((current) => {
      const selectedCandidateIds = current.selectedCandidateIds.includes(sourceItemId)
        ? current.selectedCandidateIds.filter((id) => id !== sourceItemId)
        : [...current.selectedCandidateIds, sourceItemId];
      return { ...current, selectedCandidateIds };
    });
  }

  function selectAllCandidates() {
    setRunSettings((current) => ({
      ...current,
      selectedCandidateIds: selectedRun?.candidateReviews?.map((candidate) => candidate.sourceItemId) ?? []
    }));
  }

  function togglePlatform(platform: Platform) {
    setRunSettings((current) => {
      const platforms = current.platforms.includes(platform)
        ? current.platforms.filter((candidate) => candidate !== platform)
        : [...current.platforms, platform];
      return { ...current, platforms: platforms.length > 0 ? platforms : ["review"] };
    });
  }

  async function refreshAiHotResult(): Promise<VerificationResult> {
    const latest = await refresh({ quiet: true });
    const count = latest?.items.length ?? 0;
    return {
      ok: latest?.health.status !== "failed",
      count,
      message: latest?.health.status === "failed"
        ? latest.health.message
        : `AIHot 刷新完成，当前页面可见 ${count} 条内容。`
    };
  }

  async function screenCandidates() {
    if (selectedAiHotItemIds.length === 0) {
      return { ok: false, failureReason: "请先在 AIHot 日报中选择至少一条信息。" };
    }
    const run = await api<PipelineRun>("/pipeline/screen", {
      method: "POST",
      body: JSON.stringify({
        runId: `screen-${Date.now()}`,
        sourceIds: ["aihot-default"],
        sourceItemIds: selectedAiHotItemIds,
        candidateCount: runSettings.candidateCount,
        allowBrowserFallback: runSettings.allowBrowserFallback,
        allowMediaCrawlerFallback: runSettings.allowMediaCrawlerFallback
      })
    });
    setSelectedRun(run);
    setReviewQueue(run.reviewQueue ?? []);
    setRunSettings((current) => ({
      ...current,
      selectedSourceIds: ["aihot-default"],
      selectedAiHotItemIds,
      selectedCandidateIds: run.candidateReviews?.map((candidate) => candidate.sourceItemId) ?? []
    }));
    await loadRun(run.runId);
    return {
      ok: run.status !== "failed",
      status: run.status,
      count: run.candidateReviews?.length ?? 0,
      message: `热点分析完成，得到 ${run.candidateReviews?.length ?? 0} 条候选。请在候选评审中查看原因、总结和评分。`
    };
  }

  async function generateDrafts() {
    if (!selectedRun) {
      return { ok: false, failureReason: "请先完成热点分析。" };
    }
    if (runSettings.selectedCandidateIds.length === 0) {
      return { ok: false, failureReason: "请先在候选评审中勾选至少一条候选。" };
    }
    const run = await api<PipelineRun>("/pipeline/drafts", {
      method: "POST",
      body: JSON.stringify({
        runId: selectedRun.runId,
        sourceItemIds: runSettings.selectedCandidateIds,
        requestedPlatforms: runSettings.platforms,
        allowRealDraft: false
      })
    });
    setSelectedRun(run);
    setReviewQueue(run.reviewQueue ?? []);
    await loadRun(run.runId);
    return {
      ok: run.status !== "failed",
      status: run.status,
      count: run.drafts.length,
      message: `草稿生成完成，共 ${run.drafts.length} 份。`
    };
  }

  const candidates: CandidateReview[] = selectedRun?.candidateReviews ?? [];
  const actionableQueue = reviewQueue.filter((item) => item.category !== "summary" && item.category !== "draft");
  const queueMetrics = {
    blocked: actionableQueue.filter((item) => item.status === "blocked").length,
    waiting: actionableQueue.filter((item) => item.status === "waiting").length,
    review: actionableQueue.filter((item) => item.status === "needs-review").length
  };

  return (
    <main className="shell">
      <Sidebar />
      <section className="workspace">
        <Hero
          health={health}
          refresh={() => void refresh()}
          selectedAiHotCount={selectedAiHotItemIds.length}
          candidateCount={candidates.length}
          draftCount={selectedRun?.drafts.length ?? 0}
        />
        <StatusGrid
          providers={providers}
          publisherHealth={publisherHealth}
          modelConfig={modelConfig}
          reviewQueue={actionableQueue}
          queueMetrics={queueMetrics}
          aiHotLatest={aiHotLatest}
        />
        <AiHotDailyPanel
          aiHotLatest={aiHotLatest}
          selectedIds={selectedAiHotItemIds}
          toggleItem={toggleAiHotItem}
          selectAll={selectAllAiHotItems}
          clearSelection={() => setSelectedAiHotItemIds([])}
          refresh={() => void runAction("refresh", refreshAiHotResult)}
          busy={busy}
        />
        <ScreenPanel
          aiHotLatest={aiHotLatest}
          runSettings={runSettings}
          setRunSettings={setRunSettings}
          selectedAiHotItemIds={selectedAiHotItemIds}
          screenCandidates={() => void runAction("screen", screenCandidates)}
          runEvents={runEvents}
          busy={busy}
        />
        <CandidateReviewList
          candidates={candidates}
          selectedIds={runSettings.selectedCandidateIds}
          toggleCandidate={toggleCandidate}
          selectAll={selectAllCandidates}
          clearSelection={() => setRunSettings((current) => ({ ...current, selectedCandidateIds: [] }))}
          loadArtifact={(artifactPath) => void loadArtifact(artifactPath)}
        />
        <DraftPreviewGrid
          run={selectedRun}
          selectedCandidateIds={runSettings.selectedCandidateIds}
          runSettings={runSettings}
          togglePlatform={togglePlatform}
          generateDrafts={() => void runAction("drafts", generateDrafts)}
          loadArtifact={(artifactPath) => void loadArtifact(artifactPath)}
          busy={busy}
        />
        <IssuesPanel reviewQueue={actionableQueue} queueMetrics={queueMetrics} loadArtifact={(artifactPath) => void loadArtifact(artifactPath)} approveAsset={(item) => void approveAsset(item)} />
        <HistoryPanel
          runs={runs}
          selectedRun={selectedRun}
          artifact={artifact}
          loadRun={(runId) => void loadRun(runId)}
          loadArtifact={(artifactPath) => void loadArtifact(artifactPath)}
          deleteRun={(runId) => void deleteRun(runId)}
          clearRuns={() => void clearRuns()}
        />
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
      </section>
      <ResultDialog active={activeResult} onClose={() => setActiveResult(undefined)} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
