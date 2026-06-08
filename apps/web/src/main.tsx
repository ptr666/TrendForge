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
  refresh: "AIHot \u5237\u65b0\u7ed3\u679c",
  model: "\u6a21\u578b\u6d4b\u8bd5\u7ed3\u679c",
  imageModel: "\u56fe\u7247\u6a21\u578b\u914d\u7f6e\u7ed3\u679c",
  wechat: "\u5fae\u4fe1\u8bf7\u6c42\u7ed3\u679c",
  xhs: "\u5c0f\u7ea2\u4e66 gate \u68c0\u67e5\u7ed3\u679c",
  screen: "\u70ed\u70b9\u5206\u6790\u7ed3\u679c",
  drafts: "\u8349\u7a3f\u751f\u6210\u7ed3\u679c",
  publish: "\u5e73\u53f0\u8349\u7a3f\u63a8\u8fdb\u7ed3\u679c",
  "run-delete": "\u5386\u53f2\u5220\u9664\u7ed3\u679c",
  "runs-clear": "\u5386\u53f2\u6e05\u7a7a\u7ed3\u679c"
};

/*
const brokenActionTitles: Record<string, string> = {
  refresh: "AIHot 刷新结果",
  model: "模型测试结果",
  imageModel: "图片模型配置结果",
  wechat: "微信请求结果",
  xhs: "小红书 gate 检查结果",
  screen: "热点分析结果",
  drafts: "草稿生成结果",
  publish: "平台草稿推进结果",
  "run-delete": "历史删除结果",
  "runs-clear": "历史清空结果"
};

/*
const brokenActionTitles: Record<string, string> = {
  refresh: "AIHot 刷新结果",
  model: "模型测试结果",
  imageModel: "图片模型配置结果",
  wechat: "微信请求结果",
  xhs: "小红书 gate 检查结果",
  screen: "热点分析结果",
  drafts: "草稿生成结果",
  "run-delete": "历史删除结果",
  "runs-clear": "历史清空结果"
};
*/

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

  /*
  function summarizeEvents(kind: TaskProgress["kind"], runId: string, startedAt: number, events: Array<Record<string, unknown>>): TaskProgress {
    const latest = events.at(-1);
    const finished = [...events].reverse().find((event) => asString(event.stage) === "finished");
    const failed = [...events].reverse().find((event) => asString(event.status) === "failed" || asString(event.message));
    const latestCount = events.filter((event) => typeof event.count === "number").at(-1)?.count;
    const processedCount = typeof latestCount === "number" ? latestCount : events.filter((event) => asString(event.sourceItemId)).length;
    const status = asString(finished?.status) === "failed" || asString(failed?.status) === "failed" ? "failed" : finished ? "success" : "running";
    return {
      kind,
      runId,
      title: kind === "screen" ? "热点分析进行中" : "草稿生成进行中",
      startedAt,
      currentStage: asString(latest?.stage) || "started",
      processedCount,
      elapsedMs: Date.now() - startedAt,
      status,
      failureReason: asString(failed?.message) || asString(failed?.reason)
    };
  }

  */
  function summarizeEvents(kind: TaskProgress["kind"], runId: string, startedAt: number, events: Array<Record<string, unknown>>): TaskProgress {
    const latest = events.at(-1);
    const finished = [...events].reverse().find((event) => asString(event.stage) === "finished");
    const failed = [...events].reverse().find((event) => asString(event.status) === "failed" || asString(event.message));
    const latestCount = events.filter((event) => typeof event.count === "number").at(-1)?.count;
    const processedCount = typeof latestCount === "number" ? latestCount : events.filter((event) => asString(event.sourceItemId)).length;
    const status = asString(finished?.status) === "failed" || asString(failed?.status) === "failed" ? "failed" : finished ? "success" : "running";
    const title = kind === "screen"
      ? "\u70ed\u70b9\u5206\u6790\u8fdb\u884c\u4e2d"
      : kind === "publish" ? "\u5e73\u53f0\u8349\u7a3f\u63a8\u8fdb\u4e2d" : "\u8349\u7a3f\u751f\u6210\u8fdb\u884c\u4e2d";
    return {
      kind,
      runId,
      title,
      startedAt,
      currentStage: asString(latest?.stage) || "started",
      processedCount,
      elapsedMs: Date.now() - startedAt,
      status,
      failureReason: asString(failed?.message) || asString(failed?.reason)
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

  /*
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
    return {
      ok: run.status !== "failed",
      status: run.status,
      count: run.candidateReviews?.length ?? 0,
      message: `热点分析完成，得到 ${run.candidateReviews?.length ?? 0} 条候选。请在候选评审中查看原文、译文、总结和评分。`
    };
  }

  async function generateDrafts() {
    if (!selectedRun) {
      return { ok: false, failureReason: "请先完成热点分析。" };
    }
    if (runSettings.selectedCandidateIds.length === 0) {
      return { ok: false, failureReason: "请先在候选评审中勾选至少一条候选。" };
    }
    if (runSettings.allowRealDraft && !window.confirm("将尝试创建真实微信公众号/小红书平台草稿。只有 gate 通过才会执行，确认继续吗？")) {
      return { ok: false, failureReason: "已取消真实平台草稿推进。" };
    }
    const accepted = await api<AcceptedRun>("/pipeline/drafts", {
      method: "POST",
      body: JSON.stringify({
        runId: selectedRun.runId,
        async: true,
        sourceItemIds: runSettings.selectedCandidateIds,
        requestedPlatforms: runSettings.platforms,
        allowRealDraft: runSettings.allowRealDraft
      })
    });
    const run = await waitForRunCompletion("drafts", accepted.runId);
    setSelectedRun(run);
    setReviewQueue(run.reviewQueue ?? []);
    await loadRun(run.runId);
    const handoffCount = run.publishResults.filter((result) => asString(result.artifactPath)).length;
    return {
      ok: run.status !== "failed",
      status: run.status,
      count: run.drafts.length,
      handoffCount,
      message: `已生成 ${run.drafts.length} 份草稿 / ${handoffCount} 个 handoff。可以在草稿生成区域打开评审稿、Markdown 产物或 publisher handoff。`
    };
  }

  */
  async function refreshAiHotResult(): Promise<VerificationResult> {
    const latest = await refresh({ quiet: true });
    const count = latest?.items.length ?? 0;
    return {
      ok: latest?.health.status !== "failed",
      count,
      message: latest?.health.status === "failed"
        ? latest.health.message
        : `AIHot \u5237\u65b0\u5b8c\u6210\uff0c\u5f53\u524d\u9875\u9762\u53ef\u89c1 ${count} \u6761\u5185\u5bb9\u3002`
    };
  }

  async function screenCandidates() {
    if (selectedAiHotItemIds.length === 0) {
      return { ok: false, failureReason: "\u8bf7\u5148\u5728 AIHot \u65e5\u62a5\u4e2d\u9009\u62e9\u81f3\u5c11\u4e00\u6761\u4fe1\u606f\u3002" };
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
    return {
      ok: run.status !== "failed",
      status: run.status,
      count: run.candidateReviews?.length ?? 0,
      message: `\u70ed\u70b9\u5206\u6790\u5b8c\u6210\uff0c\u5f97\u5230 ${run.candidateReviews?.length ?? 0} \u6761\u5019\u9009\u3002\u8bf7\u5728\u5019\u9009\u8bc4\u5ba1\u4e2d\u67e5\u770b\u539f\u6587\u3001\u8bd1\u6587\u3001\u603b\u7ed3\u548c\u8bc4\u5206\u3002`
    };
  }

  async function generateDrafts() {
    if (!selectedRun) {
      return { ok: false, failureReason: "\u8bf7\u5148\u5b8c\u6210\u70ed\u70b9\u5206\u6790\u3002" };
    }
    if (runSettings.selectedCandidateIds.length === 0) {
      return { ok: false, failureReason: "\u8bf7\u5148\u5728\u5019\u9009\u8bc4\u5ba1\u4e2d\u52fe\u9009\u81f3\u5c11\u4e00\u6761\u5019\u9009\u3002" };
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
      message: `\u5df2\u751f\u6210 ${run.drafts.length} \u4efd\u672c\u5730\u8349\u7a3f\u3002\u8bf7\u5148\u6253\u5f00\u8bc4\u5ba1\u7a3f\u548c\u5e73\u53f0 Markdown \u9884\u89c8\uff0c\u786e\u8ba4\u540e\u518d\u5355\u72ec\u63a8\u8fdb\u5e73\u53f0\u8349\u7a3f\u7bb1\u3002`
    };
  }

  async function publishDrafts() {
    if (!selectedRun) {
      return { ok: false, failureReason: "\u8bf7\u5148\u5b8c\u6210\u8349\u7a3f\u751f\u6210\u3002" };
    }
    const requestedPlatforms = runSettings.platforms.filter((platform): platform is Exclude<Platform, "review"> => platform === "wechat" || platform === "xhs");
    if (requestedPlatforms.length === 0) {
      return { ok: false, failureReason: "\u8bf7\u5148\u9009\u62e9\u5fae\u4fe1\u516c\u4f17\u53f7\u6216\u5c0f\u7ea2\u4e66\u5e73\u53f0\u3002" };
    }
    const publishableDrafts = selectedRun.drafts.filter((draft) => requestedPlatforms.includes(draft.platform as Exclude<Platform, "review">));
    if (publishableDrafts.length === 0) {
      return { ok: false, failureReason: "\u5f53\u524d\u8fd0\u884c\u8fd8\u6ca1\u6709\u53ef\u63a8\u8fdb\u7684\u5e73\u53f0\u8349\u7a3f\uff0c\u8bf7\u5148\u751f\u6210\u5fae\u4fe1\u6216\u5c0f\u7ea2\u4e66\u8349\u7a3f\u3002" };
    }
    const confirmText = runSettings.allowRealDraft
      ? "\u5c06\u5c1d\u8bd5\u521b\u5efa\u771f\u5b9e\u5e73\u53f0\u8349\u7a3f\u7bb1\u8349\u7a3f\u3002\u53ea\u6709 gate \u901a\u8fc7\u624d\u4f1a\u6267\u884c\uff0c\u786e\u8ba4\u7ee7\u7eed\u5417\uff1f"
      : "\u5c06\u751f\u6210\u5e73\u53f0 handoff\uff0c\u4e0d\u4f1a\u521b\u5efa\u771f\u5b9e\u8349\u7a3f\u7bb1\u5185\u5bb9\u3002\u786e\u8ba4\u7ee7\u7eed\u5417\uff1f";
    if (!window.confirm(confirmText)) {
      return { ok: false, failureReason: "\u5df2\u53d6\u6d88\u5e73\u53f0\u8349\u7a3f\u63a8\u8fdb\u3002" };
    }
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
    const handoffCount = run.publishResults.filter((result) => asString(result.artifactPath)).length;
    const successResults = run.publishResults.filter((result) => asString(result.status) === "success");
    const failedResults = run.publishResults.filter((result) => asString(result.status) === "failed");
    const successLabels = successResults.map((result) => {
      const platform = asString(result.platform) === "wechat" ? "\u5fae\u4fe1\u8349\u7a3f\u7bb1" : asString(result.platform) === "xhs" ? "\u5c0f\u7ea2\u4e66\u8349\u7a3f" : asString(result.platform);
      const externalId = asString(result.externalId);
      return externalId ? `${platform}\u521b\u5efa\u6210\u529f\uff1a${externalId}` : `${platform}\u521b\u5efa\u6210\u529f`;
    });
    const message = successResults.length > 0
      ? `\u5df2\u6210\u529f\u521b\u5efa ${successResults.length} \u4e2a\u5e73\u53f0\u8349\u7a3f\u3002${successLabels.join("\uff1b")}`
      : `\u5df2\u63a8\u8fdb ${run.publishResults.length} \u4e2a\u5e73\u53f0\u8349\u7a3f\u7ed3\u679c / ${handoffCount} \u4e2a handoff\u3002`;
    return {
      ok: run.status !== "failed" && failedResults.length === 0,
      status: run.status,
      count: run.publishResults.length,
      handoffCount,
      message,
      items: run.publishResults.map((result) => ({
        title: `${asString(result.platform)} / ${asString(result.status)}`,
        url: asString(result.externalId) || asString(result.artifactPath),
        message: asString(result.message) || asString(result.verificationSignal)
      }))
    };
  }

  const candidates: CandidateReview[] = selectedRun?.candidateReviews ?? [];
  const actionableQueue = reviewQueue.filter((item) => item.category !== "summary" && item.category !== "draft" && item.category !== "asset");
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
          loadArtifact={(artifactPath, title) => void loadArtifact(artifactPath, title)}
          taskProgress={taskProgress?.kind === "drafts" ? taskProgress : undefined}
          publishProgress={taskProgress?.kind === "publish" ? taskProgress : undefined}
          busy={busy}
        />
        <IssuesPanel reviewQueue={actionableQueue} queueMetrics={queueMetrics} loadArtifact={(artifactPath, title) => void loadArtifact(artifactPath, title)} approveAsset={(item) => void approveAsset(item)} />
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
