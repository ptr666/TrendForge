import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api.js";
import {
  AiHotDailyPanel,
  CandidateReviewList,
  ConfigPanel,
  DraftPreviewGridV2,
  Hero,
  HistoryPanel,
  IssuesPanel,
  ScreenPanel,
  Sidebar,
  StatusGrid,
  asString
} from "./components/panels.js";
import { ArtifactViewer, ResultDialog } from "./components/ui.js";
import type {
  AcceptedRun,
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
} from "./types.js";
import "./styles.css";

const actionTitles: Record<string, string> = {
  refresh: "AIHot 刷新结果",
  model: "模型测试结果",
  imageModel: "图片模型配置结果",
  wechat: "微信连接检查结果",
  xhs: "小红书连接检查结果",
  screen: "热点分析结果",
  drafts: "草稿生成结果",
  "asset-regenerate": "图片重生成结果",
  publish: "平台草稿推进结果",
  "run-delete": "历史删除结果",
  "runs-clear": "历史清空结果"
};

function aiHotItemId(item: Record<string, unknown>, index: number): string {
  return asString(item.id) || asString(item.url) || `aihot-item-${index}`;
}

function displayPlatform(platform: string): string {
  if (platform === "wechat") return "微信草稿箱";
  if (platform === "xhs") return "小红书草稿";
  if (platform === "review") return "评审稿";
  return platform || "未知平台";
}

function publishFeedback(run: PipelineRun, currentResults: Array<Record<string, unknown>>): VerificationResult {
  const handoffCount = currentResults.filter((result) => asString(result.artifactPath)).length;
  const successResults = currentResults.filter((result) => asString(result.status) === "success");
  const failedResults = currentResults.filter((result) => asString(result.status) === "failed");
  const successLabels = successResults.map((result) => {
    const platform = displayPlatform(asString(result.platform));
    const externalId = asString(result.externalId);
    return externalId ? `${platform}创建成功：${externalId}` : `${platform}创建成功`;
  });
  const failedLabels = failedResults.map((result) => {
    const platform = displayPlatform(asString(result.platform));
    return `${platform}：${asString(result.message) || asString(result.verificationSignal) || "推进失败"}`;
  });
  const message = successResults.length > 0
    ? `已成功创建 ${successResults.length} 个平台草稿。${successLabels.join("；")}`
    : failedResults.length > 0
      ? `本次平台推进有 ${failedResults.length} 项失败。${failedLabels.join("；")}`
      : `已推进 ${currentResults.length} 个平台草稿结果 / ${handoffCount} 份平台交接信息。`;

  return {
    ok: currentResults.length > 0 && failedResults.length === 0,
    status: run.status,
    count: currentResults.length,
    handoffCount,
    message,
    items: currentResults.map((result) => ({
      title: `${displayPlatform(asString(result.platform))} / ${asString(result.status)}`,
      url: asString(result.externalId) || asString(result.artifactPath),
      message: asString(result.message) || asString(result.verificationSignal)
    }))
  };
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
  const [imageModelConfig, setImageModelConfig] = useState<PublicImageModelConfig>({
    enabled: false,
    provider: "none",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-image-1",
    keyConfigured: false
  });
  const [imageModelApiKey, setImageModelApiKey] = useState("");
  const [wechatConfig, setWechatConfig] = useState<PublicWechatConfig>({
    enabled: false,
    appId: "",
    secretConfigured: false,
    coverMediaId: "",
    coverImagePath: "",
    legacyCredentialSource: ""
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
  const [runsDir, setRunsDir] = useState<string | undefined>();
  const [selectedRun, setSelectedRun] = useState<PipelineRun | undefined>();
  const [runEvents, setRunEvents] = useState<Array<Record<string, unknown>>>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [artifact, setArtifact] = useState<Artifact | undefined>();
  const [activeArtifact, setActiveArtifact] = useState<Artifact | undefined>();
  const [activeArtifactTitle, setActiveArtifactTitle] = useState<string | undefined>();
  const [runSettings, setRunSettings] = useState<RunSettings>({
    selectedSourceIds: ["aihot-default"],
    selectedAiHotItemIds: [],
    candidateCount: 3,
    selectedCandidateIds: [],
    platforms: ["review", "wechat", "xhs"],
    allowBrowserFallback: true,
    allowMediaCrawlerFallback: false,
    allowRealDraft: false
  });
  const [results, setResults] = useState<Record<string, VerificationResult>>({});
  const [activeResult, setActiveResult] = useState<{ title: string; result: VerificationResult } | undefined>();
  const [busy, setBusy] = useState<string | undefined>();
  const [taskProgress, setTaskProgress] = useState<TaskProgress | undefined>();

  function summarizeEvents(kind: TaskProgress["kind"], runId: string, startedAt: number, events: Array<Record<string, unknown>>): TaskProgress {
    const taskStartStage = kind === "screen" ? "started" : kind === "publish" ? "platform_publish" : "draft_generation";
    const startIndex = (() => {
      for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (asString(event.stage) !== taskStartStage) continue;
        if (kind !== "screen" || asString(event.mode) === "screen") return index;
      }
      return -1;
    })();
    const scopedEvents = startIndex >= 0 ? events.slice(startIndex) : [];
    const latest = scopedEvents.at(-1);
    const latestUnscoped = events.at(-1);
    const latestUnscopedFailed = asString(latestUnscoped?.stage) === "finished" && asString(latestUnscoped?.status) === "failed";
    const finished = [...scopedEvents].reverse().find((event) => asString(event.stage) === "finished");
    const issue = [...scopedEvents].reverse().find((event) => {
      const status = asString(event.status);
      if (status === "failed" || status === "blocked") return true;
      return kind === "screen" && status === "skipped";
    }) ?? (startIndex < 0 && latestUnscopedFailed ? latestUnscoped : undefined);
    const processedEvent = [...scopedEvents].reverse().find((event) => typeof event.processedCount === "number" || typeof event.count === "number");
    const processedCount = typeof processedEvent?.processedCount === "number"
      ? processedEvent.processedCount
      : typeof processedEvent?.count === "number"
        ? processedEvent.count
        : scopedEvents.filter((event) => asString(event.sourceItemId)).length;
    const finishedStatus = asString(finished?.status);
    const status = latestUnscopedFailed && startIndex < 0
      ? "failed"
      : finishedStatus === "failed"
        ? "failed"
        : finishedStatus === "partial" ? "partial" : finished ? "success" : "running";
    const title = kind === "screen"
      ? "热点分析进行中"
      : kind === "publish" ? "平台草稿推进中" : "草稿生成进行中";
    return {
      kind,
      runId,
      title,
      startedAt,
      currentStage: asString(latest?.stage) || (startIndex < 0 ? "waiting" : "started"),
      processedCount,
      elapsedMs: Date.now() - startedAt,
      status,
      failureReason: asString(issue?.message) || asString(issue?.reason)
    };
  }

  async function waitForRunCompletion(kind: TaskProgress["kind"], runId: string): Promise<PipelineRun> {
    const startedAt = Date.now();
    setTaskProgress(summarizeEvents(kind, runId, startedAt, []));
    for (;;) {
      const events = await api<{ events: Array<Record<string, unknown>> }>(`/runs/${encodeURIComponent(runId)}/events`);
      const progress = summarizeEvents(kind, runId, startedAt, events.events);
      setRunEvents(events.events);
      setTaskProgress(progress);
      if (progress.status !== "running") {
        if (progress.status === "failed") throw new Error(progress.failureReason || "任务执行失败，请查看运行事件。");
        return api<PipelineRun>(`/runs/${encodeURIComponent(runId)}`);
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
    }
  }

  async function refresh(options: { quiet?: boolean } = {}): Promise<AiHotLatest | undefined> {
    setHealth("loading");
    try {
      const [providerData, modelData, imageModelData, wechatData, xhsData, aiHotData, runData, publisherData] = await Promise.all([
        api<ProviderState>("/providers"),
        api<PublicModelConfig>("/config/model"),
        api<PublicImageModelConfig>("/config/image-model"),
        api<PublicWechatConfig>("/config/wechat"),
        api<PublicXhsConfig>("/config/xhs"),
        api<AiHotLatest>("/sources/aihot/latest"),
        api<{ runs: RunSummary[]; runsDir?: string }>("/runs"),
        api<{ publishers: PublisherHealth[] }>("/publishers")
      ]);
      setProviders(providerData);
      setModelConfig(modelData);
      setImageModelConfig(imageModelData);
      setWechatConfig(wechatData);
      setXhsConfig(xhsData);
      setAiHotLatest(aiHotData);
      setRuns(runData.runs);
      setRunsDir(runData.runsDir);
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

  async function saveImageModelConfig() {
    const saved = await api<PublicImageModelConfig>("/config/image-model", {
      method: "PUT",
      body: JSON.stringify({
        enabled: imageModelConfig.enabled,
        provider: imageModelConfig.provider,
        baseUrl: imageModelConfig.baseUrl,
        model: imageModelConfig.model,
        apiKey: imageModelApiKey,
        keepExistingKey: imageModelConfig.keyConfigured && imageModelApiKey.trim().length === 0
      })
    });
    setImageModelConfig(saved);
    setImageModelApiKey("");
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
        coverImagePath: wechatConfig.coverImagePath,
        legacyCredentialSource: wechatConfig.legacyCredentialSource,
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

  async function loadArtifact(artifactPath: string, title?: string) {
    const loaded = await api<Artifact>(`/artifacts?path=${encodeURIComponent(artifactPath)}`);
    setArtifact(loaded);
    setActiveArtifact(loaded);
    setActiveArtifactTitle(title);
  }

  function clearSelectedRunState() {
    setSelectedRun(undefined);
    setRunEvents([]);
    setReviewQueue([]);
    setArtifact(undefined);
    setActiveArtifact(undefined);
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
    const runId = `screen-${Date.now()}`;
    const accepted = await api<AcceptedRun>("/pipeline/screen", {
      method: "POST",
      body: JSON.stringify({
        runId,
        async: true,
        sourceIds: ["aihot-default"],
        sourceItemIds: selectedAiHotItemIds,
        candidateCount: runSettings.candidateCount,
        allowBrowserFallback: runSettings.allowBrowserFallback,
        allowMediaCrawlerFallback: runSettings.allowMediaCrawlerFallback
      })
    });
    const run = await waitForRunCompletion("screen", accepted.runId);
    setSelectedRun(run);
    setReviewQueue(run.reviewQueue ?? []);
    setRunSettings((current) => ({
      ...current,
      selectedSourceIds: ["aihot-default"],
      selectedAiHotItemIds,
      selectedCandidateIds: run.candidateReviews?.map((candidate) => candidate.sourceItemId) ?? []
    }));
    await loadRun(run.runId);
    const skippedCount = run.errors?.filter((error) => asString(error.stage).startsWith("select:")).length ?? 0;
    return {
      ok: run.status !== "failed",
      status: run.status,
      count: run.candidateReviews?.length ?? 0,
      message: `热点分析完成，得到 ${run.candidateReviews?.length ?? 0} 条候选。${skippedCount > 0 ? `有 ${skippedCount} 条信息因原文不可用被跳过。` : ""}请在候选评审中查看原文、译文、总结和评分。`
    };
  }

  async function generateDrafts() {
    if (!selectedRun) {
      return { ok: false, failureReason: "请先完成热点分析。" };
    }
    if (runSettings.selectedCandidateIds.length === 0) {
      return { ok: false, failureReason: "请先在候选评审中勾选至少一条候选。" };
    }
    const accepted = await api<AcceptedRun>("/pipeline/drafts", {
      method: "POST",
      body: JSON.stringify({
        runId: selectedRun.runId,
        async: true,
        sourceItemIds: runSettings.selectedCandidateIds,
        requestedPlatforms: runSettings.platforms,
        allowRealDraft: false
      })
    });
    const run = await waitForRunCompletion("drafts", accepted.runId);
    setSelectedRun(run);
    setReviewQueue(run.reviewQueue ?? []);
    await loadRun(run.runId);
    return {
      ok: run.status !== "failed",
      status: run.status,
      count: run.drafts.length,
      message: `已生成 ${run.drafts.length} 份本地草稿。请先打开评审稿和平台草稿预览，确认后再单独推进平台草稿箱。`
    };
  }

  async function publishDrafts() {
    if (!selectedRun) {
      return { ok: false, failureReason: "请先完成草稿生成。" };
    }
    const requestedPlatforms = runSettings.platforms.filter((platform): platform is Exclude<Platform, "review"> => platform === "wechat" || platform === "xhs");
    if (requestedPlatforms.length === 0) {
      return { ok: false, failureReason: "请先选择微信公众号或小红书平台。" };
    }
    const publishableDrafts = selectedRun.drafts.filter((draft) => requestedPlatforms.includes(draft.platform as Exclude<Platform, "review">));
    if (publishableDrafts.length === 0) {
      return { ok: false, failureReason: "当前运行还没有可推进的平台草稿，请先生成微信或小红书草稿。" };
    }
    const confirmText = runSettings.allowRealDraft
      ? "将尝试创建真实平台草稿箱草稿。只有连接检查通过才会执行，确认继续吗？"
      : "将生成平台交接信息，不会创建真实草稿箱内容。确认继续吗？";
    if (!window.confirm(confirmText)) {
      return { ok: false, failureReason: "已取消平台草稿推进。" };
    }
    const requestedDraftIds = new Set(publishableDrafts.map((draft) => draft.id));
    const accepted = await api<AcceptedRun>("/pipeline/publish-drafts", {
      method: "POST",
      body: JSON.stringify({
        runId: selectedRun.runId,
        async: true,
        draftIds: publishableDrafts.map((draft) => draft.id),
        requestedPlatforms,
        allowRealDraft: runSettings.allowRealDraft
      })
    });
    const run = await waitForRunCompletion("publish", accepted.runId);
    setSelectedRun(run);
    setReviewQueue(run.reviewQueue ?? []);
    await loadRun(run.runId);
    const currentResults = run.publishResults.filter((result) => {
      const platform = asString(result.platform);
      return requestedDraftIds.has(asString(result.draftId)) && requestedPlatforms.includes(platform as Exclude<Platform, "review">);
    });
    return publishFeedback(run, currentResults);
  }

  async function regenerateAsset(assetId: string) {
    if (!selectedRun) {
      return { ok: false, failureReason: "请先选择一个运行。" };
    }
    const run = await api<PipelineRun>(`/runs/${encodeURIComponent(selectedRun.runId)}/assets/${encodeURIComponent(assetId)}/regenerate`, {
      method: "POST"
    });
    setSelectedRun(run);
    setReviewQueue(run.reviewQueue ?? []);
    await loadRun(run.runId);
    const asset = run.assets.find((candidate) => candidate.id === assetId);
    return {
      ok: asset?.status !== "blocked",
      status: asset?.status,
      message: asset?.status === "blocked"
        ? `图片重生成失败：${asset.errorMessage ?? "未知错误"}`
        : `图片已重生成到第 ${asset?.revision ?? 1} 版。`,
      asset
    };
  }

  const candidates: CandidateReview[] = selectedRun?.candidateReviews ?? [];
  const actionableQueue = reviewQueue.filter((item) => {
    if (item.category === "summary" || item.category === "draft" || item.category === "original-text") return false;
    if (item.category === "pipeline" && item.id.includes(":pipeline:select:")) return false;
    if (item.category === "publisher") return item.status === "blocked";
    if (item.category === "asset") return item.status === "blocked";
    return item.status === "blocked";
  });
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
          taskProgress={taskProgress?.kind === "screen" ? taskProgress : undefined}
          busy={busy}
        />
        <CandidateReviewList
          candidates={candidates}
          selectedIds={runSettings.selectedCandidateIds}
          toggleCandidate={toggleCandidate}
          selectAll={selectAllCandidates}
          clearSelection={() => setRunSettings((current) => ({ ...current, selectedCandidateIds: [] }))}
          loadArtifact={(artifactPath, title) => void loadArtifact(artifactPath, title)}
        />
        <DraftPreviewGridV2
          run={selectedRun}
          selectedCandidateIds={runSettings.selectedCandidateIds}
          runSettings={runSettings}
          setRunSettings={setRunSettings}
          togglePlatform={togglePlatform}
          generateDrafts={() => void runAction("drafts", generateDrafts)}
          publishDrafts={() => void runAction("publish", publishDrafts)}
          regenerateAsset={(assetId) => void runAction("asset-regenerate", () => regenerateAsset(assetId))}
          loadArtifact={(artifactPath, title) => void loadArtifact(artifactPath, title)}
          taskProgress={taskProgress?.kind === "drafts" ? taskProgress : undefined}
          publishProgress={taskProgress?.kind === "publish" ? taskProgress : undefined}
          busy={busy}
        />
        <IssuesPanel reviewQueue={actionableQueue} queueMetrics={queueMetrics} loadArtifact={(artifactPath, title) => void loadArtifact(artifactPath, title)} />
        <HistoryPanel
          runs={runs}
          runsDir={runsDir}
          selectedRun={selectedRun}
          artifact={artifact}
          loadRun={(runId) => void loadRun(runId)}
          loadArtifact={(artifactPath, title) => void loadArtifact(artifactPath, title)}
          deleteRun={(runId) => void deleteRun(runId)}
          clearRuns={() => void clearRuns()}
        />
        <ConfigPanel
          modelConfig={modelConfig}
          setModelConfig={setModelConfig}
          modelApiKey={modelApiKey}
          setModelApiKey={setModelApiKey}
          saveModelConfig={saveModelConfig}
          imageModelConfig={imageModelConfig}
          setImageModelConfig={setImageModelConfig}
          imageModelApiKey={imageModelApiKey}
          setImageModelApiKey={setImageModelApiKey}
          saveImageModelConfig={() => runAction("imageModel", async () => {
            await saveImageModelConfig();
            return {
              ok: true,
              message: imageModelConfig.enabled
                ? "图片模型配置已保存。下次生成草稿时会规划微信封面和小红书图片提示词。"
                : "图片模型配置已保存为关闭状态。草稿生成不会申请图片资产。"
            };
          })}
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
      <ArtifactViewer artifact={activeArtifact} title={activeArtifactTitle} onClose={() => setActiveArtifact(undefined)} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
