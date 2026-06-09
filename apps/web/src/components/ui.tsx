import type { ReactNode } from "react";
import type { ApiState, Artifact, VerificationResult } from "../types.js";

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
  "needs-approval": "待确认",
  approved: "已确认",
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
  compose_media: "图片规划",
  publish: "平台交接",
  review: "评审稿",
  wechat: "微信公众号",
  xhs: "小红书",
  aihot: "AIHot",
  rss: "RSS",
  rsshub: "RSSHub",
  http: "HTTP",
  browseract: "BrowserAct",
  mediacrawler: "MediaCrawler",
  deterministic: "本地确定性模式",
  "openai-compatible": "OpenAI-compatible",
  "original-text": "原文",
  summary: "总结",
  draft: "草稿",
  asset: "图片资产",
  publisher: "平台交接",
  pipeline: "流程问题",
  cover: "封面图",
  xhs_image: "小红书图片",
  inline_image: "正文配图",
  preview: "预览图"
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

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <a href={match[2]} target="_blank" rel="noreferrer" key={`${match[2]}-${match.index}`}>
        {match[1]}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function pushParagraph(elements: ReactNode[], paragraph: string[], keyPrefix: string) {
  if (paragraph.length === 0) return;
  const text = paragraph.join(" ").trim();
  if (text) elements.push(<p key={`${keyPrefix}-p-${elements.length}`}>{renderInline(text)}</p>);
  paragraph.length = 0;
}

function stripFrontmatter(value: string): string {
  const source = value.replace(/^\uFEFF/, "").trimStart();
  if (!source.startsWith("---")) return source.trim();
  const lines = source.split(/\r?\n/);
  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closingIndex < 0) return source.trim();
  return lines.slice(closingIndex + 1).join("\n").trim();
}

function parseJsonArtifact(content: string): unknown | undefined {
  const source = content.replace(/^\uFEFF/, "").trim();
  if (!source.startsWith("{") && !source.startsWith("[")) return undefined;
  try {
    return JSON.parse(source) as unknown;
  } catch {
    return undefined;
  }
}

export function MarkdownPreview({ content, compact = false }: { content?: string; compact?: boolean }) {
  const source = stripFrontmatter(content ?? "");
  if (!source) return <p className="helper">暂无可预览内容。</p>;

  const lines = source.split(/\r?\n/);
  const elements: ReactNode[] = [];
  const paragraph: string[] = [];
  let inCode = false;
  let codeLines: string[] = [];

  lines.forEach((rawLine, index) => {
    const line = rawLine.trimEnd();
    if (line.startsWith("```")) {
      if (inCode) {
        elements.push(<pre key={`code-${index}`}><code>{codeLines.join("\n")}</code></pre>);
        codeLines = [];
        inCode = false;
      } else {
        pushParagraph(elements, paragraph, "md");
        inCode = true;
      }
      return;
    }
    if (inCode) {
      codeLines.push(rawLine);
      return;
    }
    if (!line.trim()) {
      pushParagraph(elements, paragraph, "md");
      return;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      pushParagraph(elements, paragraph, "md");
      const level = Math.min(heading[1].length + (compact ? 1 : 0), 4);
      const text = heading[2];
      if (level <= 2) elements.push(<h2 key={`h-${index}`}>{renderInline(text)}</h2>);
      else if (level === 3) elements.push(<h3 key={`h-${index}`}>{renderInline(text)}</h3>);
      else elements.push(<h4 key={`h-${index}`}>{renderInline(text)}</h4>);
      return;
    }
    if (/^[-*]\s+/.test(line)) {
      pushParagraph(elements, paragraph, "md");
      elements.push(<li key={`li-${index}`}>{renderInline(line.replace(/^[-*]\s+/, ""))}</li>);
      return;
    }
    if (line.startsWith(">")) {
      pushParagraph(elements, paragraph, "md");
      elements.push(<blockquote key={`quote-${index}`}>{renderInline(line.replace(/^>\s?/, ""))}</blockquote>);
      return;
    }
    if (!/^---$/.test(line)) paragraph.push(line);
  });
  pushParagraph(elements, paragraph, "md");
  if (codeLines.length > 0) elements.push(<pre key="code-final"><code>{codeLines.join("\n")}</code></pre>);

  return <div className={`markdown-preview ${compact ? "compact" : ""}`}>{elements}</div>;
}

export function JsonArtifactPreview({ data }: { data: unknown }) {
  if (!data || typeof data !== "object") {
    return <p className="helper">暂无可预览 JSON 内容。</p>;
  }
  const record = data as Record<string, unknown>;
  const workflow = typeof record.workflow === "string" ? record.workflow : undefined;
  const platform = typeof record.platform === "string" ? record.platform : undefined;
  const draft = record.draft && typeof record.draft === "object" ? record.draft as Record<string, unknown> : undefined;
  const plannedCommands = Array.isArray(record.plannedCommands) ? record.plannedCommands : [];
  const successSignal = typeof record.successSignal === "string"
    ? record.successSignal
    : typeof record.verificationSignal === "string"
      ? record.verificationSignal
      : undefined;

  return (
    <div className="json-preview">
      <div className="json-summary-grid">
        {workflow && <span><strong>工作流</strong>{workflow}</span>}
        {platform && <span><strong>平台</strong>{displayLabel(platform)}</span>}
        {draft?.title && <span><strong>草稿标题</strong>{String(draft.title)}</span>}
        {successSignal && <span><strong>验证信号</strong>{successSignal}</span>}
      </div>
      {draft?.body && (
        <section>
          <h3>草稿正文预览</h3>
          <MarkdownPreview compact content={String(draft.body)} />
        </section>
      )}
      {plannedCommands.length > 0 && (
        <section>
          <h3>计划命令</h3>
          <div className="command-list">
            {plannedCommands.map((command, index) => {
              const commandRecord = command && typeof command === "object" ? command as Record<string, unknown> : {};
              const args = Array.isArray(commandRecord.command) ? commandRecord.command.map(String).join(" ") : "";
              return (
                <article key={index}>
                  <strong>{String(commandRecord.name ?? `command-${index + 1}`)}</strong>
                  {commandRecord.reason && <p>{String(commandRecord.reason)}</p>}
                  {args && <code>{args}</code>}
                  {commandRecord.successSignal && <small>{String(commandRecord.successSignal)}</small>}
                </article>
              );
            })}
          </div>
        </section>
      )}
      <details className="raw-json">
        <summary>查看格式化 JSON</summary>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>
  );
}

export function ArtifactContentPreview({ content }: { content: string }) {
  const jsonArtifact = parseJsonArtifact(content);
  return jsonArtifact ? <JsonArtifactPreview data={jsonArtifact} /> : <MarkdownPreview content={content} />;
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

export function ArtifactViewer({
  artifact,
  title,
  onClose
}: {
  artifact?: Artifact;
  title?: string;
  onClose: () => void;
}) {
  if (!artifact) return null;
  const jsonArtifact = parseJsonArtifact(artifact.content);
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="result-dialog artifact-dialog" role="dialog" aria-modal="true" aria-label={title ?? "产物阅读器"} onClick={(event) => event.stopPropagation()}>
        <div className="section-title compact">
          <div>
            <p className="eyebrow">产物阅读器</p>
            <h2>{title ?? "内容预览"}</h2>
            <p className="helper">{artifact.path}</p>
          </div>
          <button type="button" onClick={onClose}>关闭</button>
        </div>
        <article className="reader">
          <ArtifactContentPreview content={artifact.content} />
          <details className="raw-json">
            <summary>{jsonArtifact ? "查看原始 JSON" : "查看原始 Markdown"}</summary>
            <pre>{artifact.content}</pre>
          </details>
        </article>
      </section>
    </div>
  );
}
