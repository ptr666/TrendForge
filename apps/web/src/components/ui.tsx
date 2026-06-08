import type { ApiState, VerificationResult } from "../types.js";

const labelMap: Record<string, string> = {
  idle: "待命",
  loading: "加载中",
  success: "成功",
  error: "错误",
  ready: "就绪",
  planned: "已规划",
  enabled: "已启用",
  disabled: "已禁用",
  healthy: "健康",
  empty: "无内容",
  failed: "失败",
  verified: "已验证",
  partial: "部分可用",
  pending: "待处理",
  blocked: "已阻塞",
  waiting: "等待中",
  "needs-review": "需审核",
  "needs-approval": "需审批",
  approved: "已批准",
  queued: "已排队",
  skipped: "已跳过",
  started: "已开始",
  finished: "已完成",
  seen: "已记录",
  "dry-run": "演练模式",
  collect: "采集",
  verify: "校验",
  score: "评分",
  fetch_full_text: "获取原文",
  select: "筛选",
  summarize: "总结",
  candidate_review: "候选评审",
  generate: "生成草稿",
  draft_generation: "草稿生成",
  compose_media: "规划图片",
  publish: "平台交接",
  review: "评审稿",
  wechat: "微信公众号",
  xhs: "小红书",
  aihot: "AIHot",
  rss: "RSS",
  rsshub: "RSSHub",
  deterministic: "本地确定性模式",
  "openai-compatible": "OpenAI-compatible",
  "original-text": "原文",
  summary: "总结",
  draft: "草稿",
  asset: "图片资产",
  publisher: "平台交接",
  pipeline: "流程问题"
};

export function displayLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  return labelMap[value] ?? value;
}

export function StatusPill({ state, label }: { state: ApiState | boolean | string; label: string }) {
  const className = typeof state === "boolean" ? (state ? "success" : "error") : state;
  return <span className={`pill ${className}`}>{displayLabel(label)}</span>;
}

export function RawJsonDetails({ data, label = "查看调试 JSON" }: { data?: unknown; label?: string }) {
  if (data === undefined) return null;
  return (
    <details className="raw-json">
      <summary>{label}</summary>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </details>
  );
}

function feedbackText(result?: VerificationResult): string {
  if (!result) return "还没有执行过。";
  if (result.failureReason) return result.failureReason;
  if (typeof result.message === "string") return result.message;
  if (typeof result.count === "number") return `操作完成，共得到 ${result.count} 条内容。`;
  if (typeof result.textLength === "number") return `原文获取完成，文本长度 ${result.textLength}。`;
  if (result.ok === false) return "操作失败，请展开调试信息查看原因。";
  return "操作完成。";
}

export function ActionFeedback({ title, result }: { title: string; result?: VerificationResult }) {
  const ok = result ? result.ok !== false : undefined;
  return (
    <section className="result-panel" aria-live="polite">
      <div className="section-title compact">
        <h3>{title}</h3>
        {result && <StatusPill state={ok ? "success" : "error"} label={ok ? "success" : "failed"} />}
      </div>
      <p className="feedback-copy">{feedbackText(result)}</p>
      {Array.isArray(result?.items) && result.items.length > 0 && (
        <div className="mini-list">
          {result.items.slice(0, 3).map((item, index) => (
            <span key={index}>{String(item.title ?? item.url ?? `样例 ${index + 1}`)}</span>
          ))}
        </div>
      )}
      <RawJsonDetails data={result} />
    </section>
  );
}

export function ResultDialog({
  active,
  onClose
}: {
  active?: { title: string; result: VerificationResult };
  onClose: () => void;
}) {
  if (!active) return null;

  const ok = active.result.ok !== false;
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="result-dialog" role="dialog" aria-modal="true" aria-live="polite" aria-label={active.title} onClick={(event) => event.stopPropagation()}>
        <div className="section-title compact">
          <div>
            <p className="eyebrow">操作反馈</p>
            <h2>{active.title}</h2>
          </div>
          <StatusPill state={ok ? "success" : "error"} label={ok ? "success" : "failed"} />
        </div>
        <p className="dialog-message">{feedbackText(active.result)}</p>
        <RawJsonDetails data={active.result} />
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>关闭</button>
        </div>
      </section>
    </div>
  );
}
