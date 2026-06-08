import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  ArticleSummary,
  CandidateSelection,
  FullTextProvider,
  ImageProvider,
  MediaAsset,
  PlatformDraft,
  Selector,
  SourceItem,
  TextProvider,
  VerifiedArticle
} from "../../core/src/types.js";

const execFileAsync = promisify(execFile);

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;

async function defaultCommandRunner(command: string, args: string[]): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { maxBuffer: 1024 * 1024 * 8 });
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const processError = error as Error & { code?: number | string; stdout?: string; stderr?: string };
    return {
      exitCode: typeof processError.code === "number" ? processError.code : 1,
      stdout: processError.stdout ?? "",
      stderr: processError.stderr ?? processError.message
    };
  }
}

function compactText(value: string, limit: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function splitSentences(value: string): string[] {
  return value
    .split(/[。！？；.!?;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " "
  };
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity] ?? match;
  });
}

function htmlToReadableText(html: string): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const withBreaks = withoutNoise
    .replace(/<\/(p|div|article|section|h[1-6]|li|blockquote|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

function looksLikeHtml(contentType: string, body: string): boolean {
  return contentType.includes("text/html") || /<\/?[a-z][\s\S]*>/i.test(body);
}

export function createDefaultTextProvider(): TextProvider {
  return {
    async summarize(article: VerifiedArticle, selection: CandidateSelection): Promise<ArticleSummary> {
      const sourceText = compactText(article.fullText ?? article.failureReason ?? "没有可用原文。", 1200);
      const sentences = splitSentences(sourceText);
      const firstSentence = sentences[0] ?? sourceText;
      const keyPoints = sentences.slice(0, 3);

      return {
        sourceItemId: article.sourceItemId,
        title: `AI 趋势信号 ${article.sourceItemId}`,
        translatedOriginal: article.status === "verified"
          ? `未配置真实翻译模型，以下为原文摘录，需接入 OpenAI-compatible 文本模型后生成中文译文：\n\n${sourceText}`
          : undefined,
        summary: article.status === "verified"
          ? `这条 AI 热点信号值得进入人工复核：${firstSentence}`
          : `原文获取未完成，当前只能基于失败原因或摘要进行初步判断：${firstSentence}`,
        angle: selection.angle ?? "从 AI 产品化、工作流落地和内容传播价值三个角度继续评估。",
        keyPoints: keyPoints.length > 0
          ? keyPoints.map((point, index) => `要点 ${index + 1}：${point}`)
          : [selection.reason],
        riskNotes: article.status === "verified" ? [] : [article.failureReason ?? `文章状态为 ${article.status}。`]
      };
    }
  };
}

export function createHttpFullTextProvider(options: {
  fetchImpl?: typeof fetch;
  fallback?: FullTextProvider;
  minTextLength?: number;
} = {}): FullTextProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const minTextLength = options.minTextLength ?? 120;

  return {
    async acquire(item: SourceItem, article: VerifiedArticle): Promise<VerifiedArticle> {
      try {
        const response = await fetchImpl(item.url, {
          headers: {
            "user-agent": "TrendForge/0.1 full-text fetcher",
            accept: "text/html, text/markdown, text/plain;q=0.9, */*;q=0.5"
          }
        });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const body = await response.text();
        const contentType = response.headers.get("content-type") ?? "";
        const fullText = looksLikeHtml(contentType, body)
          ? htmlToReadableText(body)
          : body.replace(/\r\n/g, "\n").trim();
        if (fullText.length < minTextLength) {
          throw new Error(`抽取出的正文太短：${fullText.length} 字符。`);
        }
        return {
          ...article,
          status: "verified",
          method: "http",
          evidenceUrl: item.url,
          fullText,
          failureReason: undefined
        };
      } catch (error) {
        if (options.fallback) return options.fallback.acquire(item, article);
        return {
          ...article,
          status: article.fullText?.trim() ? "partial" : "failed",
          method: "http",
          evidenceUrl: item.url,
          failureReason: `HTTP 原文获取失败：${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  };
}

export function createBrowserActFullTextProvider(options: {
  command?: string;
  runCommand?: CommandRunner;
} = {}): FullTextProvider {
  const command = options.command ?? "browser-act";
  const runCommand = options.runCommand ?? defaultCommandRunner;

  return {
    async acquire(item: SourceItem, article: VerifiedArticle): Promise<VerifiedArticle> {
      const result = await runCommand(command, ["stealth-extract", item.url, "--content-type", "markdown"]);
      const fullText = result.stdout.trim();

      if (result.exitCode !== 0 || fullText.length === 0) {
        return {
          ...article,
          status: "failed",
          method: "browseract",
          evidenceUrl: item.url,
          fullText: undefined,
          failureReason: `BrowserAct 原文获取失败：${(result.stderr || "empty output").trim()}`
        };
      }

      return {
        ...article,
        status: "verified",
        method: "browseract",
        evidenceUrl: item.url,
        fullText,
        failureReason: undefined
      };
    }
  };
}

export function createPromptOnlyImageProvider(): ImageProvider {
  return {
    async planPrompt(draft: PlatformDraft, asset: MediaAsset): Promise<MediaAsset> {
      const platformInstruction = draft.platform === "wechat"
        ? "生成一张适合微信公众号头图的 16:9 横版封面，不要放置不可读的小字。"
        : "生成一张适合小红书图文笔记的 3:4 竖版主图，突出标题感和传播感。";
      return {
        ...asset,
        source: "generated",
        prompt: [
          platformInstruction,
          `标题：${draft.title}`,
          `摘要：${draft.digest ?? draft.body.slice(0, 360)}`
        ].join("\n")
      };
    }
  };
}

interface OpenAICompatibleOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  fetchImpl?: typeof fetch;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

function jsonParseFailure(content: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `模型返回的结构化 JSON 无法解析：${message}。原始返回片段：${compactText(content, 240)}`;
}

function extractJsonObject(content: string): string | undefined {
  const trimmed = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : undefined;
}

function parseModelJson(content: string): Record<string, unknown> | undefined {
  const candidate = extractJsonObject(content);
  if (!candidate) return undefined;
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function readSummaryJson(content: string): Omit<ArticleSummary, "sourceItemId"> {
  let parsed: Record<string, unknown> | undefined;
  let failureReason: string | undefined;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    parsed = parseModelJson(content);
    if (!parsed) failureReason = jsonParseFailure(content, error);
  }
  parsed ??= {};
  return {
    title: String(parsed.title ?? "未命名 AI 趋势摘要"),
    translatedOriginal: typeof parsed.translatedOriginal === "string" ? parsed.translatedOriginal : undefined,
    summary: String(parsed.summary ?? failureReason ?? "模型未返回摘要。"),
    angle: String(parsed.angle ?? "这个信号具备 AI 趋势观察和内容发布价值。"),
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(String) : [],
    riskNotes: Array.isArray(parsed.riskNotes) ? parsed.riskNotes.map(String) : failureReason ? [failureReason] : []
  };
}

export function createOpenAICompatibleTextProvider(options: OpenAICompatibleOptions): TextProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = `${options.baseUrl.replace(/\/$/, "")}/chat/completions`;

  return {
    async summarize(article: VerifiedArticle, selection: CandidateSelection): Promise<ArticleSummary> {
      const sourceText = compactText(article.fullText ?? article.failureReason ?? "No full text available.", 9000);
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {})
        },
        body: JSON.stringify({
          model: options.model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: [
                "你是中文 AI 热点内容编辑。",
                "请先把来源原文翻译为自然、准确的简体中文，再总结为适合公众号和小红书二次创作的中文素材。",
                "必须返回严格 JSON，字段为 title、translatedOriginal、summary、angle、keyPoints、riskNotes。",
                "除产品名、公司名、模型名等专有名词外，所有字段都必须使用简体中文。",
                "translatedOriginal 保留原文结构，不要省略关键事实；summary 要简洁，keyPoints 为 3-5 条中文要点。"
              ].join("\n")
            },
            {
              role: "user",
              content: JSON.stringify({
                sourceItemId: article.sourceItemId,
                status: article.status,
                selectionReason: selection.reason,
                angle: selection.angle,
                text: sourceText
              })
            }
          ]
        })
      });

      if (!response.ok) throw new Error(`Text provider failed: ${response.status} ${response.statusText}`);

      const payload = await response.json() as ChatCompletionResponse;
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error("Text provider failed: missing assistant content.");

      return {
        sourceItemId: article.sourceItemId,
        ...readSummaryJson(content)
      };
    }
  };
}

function readSelectionJson(content: string, article: VerifiedArticle): CandidateSelection {
  let parsed: Record<string, unknown> | undefined;
  let failureReason: string | undefined;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    parsed = parseModelJson(content);
    if (!parsed) failureReason = jsonParseFailure(content, error);
  }
  parsed ??= {};
  return {
    sourceItemId: article.sourceItemId,
    score: Number.isFinite(Number(parsed.score)) ? Math.max(0, Math.min(100, Number(parsed.score))) : 50,
    reason: String(parsed.reason ?? failureReason ?? "模型未返回选题理由。"),
    targetPlatforms: ["review", "wechat", "xhs"],
    angle: parsed.angle ? String(parsed.angle) : undefined,
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [article.method, article.status, ...(failureReason ? ["model-json-fallback"] : [])]
  };
}

export function createOpenAICompatibleSelector(options: OpenAICompatibleOptions): Selector {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = `${options.baseUrl.replace(/\/$/, "")}/chat/completions`;

  return {
    async score(article: VerifiedArticle): Promise<CandidateSelection> {
      const sourceText = compactText(article.fullText ?? article.failureReason ?? "No full text available.", 3000);
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {})
        },
        body: JSON.stringify({
          model: options.model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: [
                "你是中文 AI 热点选题编辑。",
                "请根据来源摘要或原文判断是否值得进入内容生产。",
                "返回严格 JSON，字段为 score(0-100)、reason、angle、tags。",
                "reason 和 angle 必须使用简体中文。",
                "优先选择新近、可信、信息密度高、适合公众号或小红书讲清楚的 AI 产品、模型、研究和产业动态。"
              ].join("\n")
            },
            {
              role: "user",
              content: JSON.stringify({
                sourceItemId: article.sourceItemId,
                status: article.status,
                method: article.method,
                evidenceUrl: article.evidenceUrl,
                text: sourceText
              })
            }
          ]
        })
      });

      if (!response.ok) throw new Error(`Selector provider failed: ${response.status} ${response.statusText}`);

      const payload = await response.json() as ChatCompletionResponse;
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error("Selector provider failed: missing assistant content.");
      return readSelectionJson(content, article);
    },
    selectTopN(selections: CandidateSelection[], limit: number): CandidateSelection[] {
      return [...selections].sort((a, b) => b.score - a.score).slice(0, limit);
    }
  };
}

export function createDefaultImageProvider(): ImageProvider {
  return {
    async planPrompt(draft: PlatformDraft, asset: MediaAsset): Promise<MediaAsset> {
      const platformLabel = draft.platform === "wechat" ? "微信公众号" : draft.platform === "xhs" ? "小红书" : "评审稿";
      return {
        ...asset,
        source: "placeholder",
        prompt: `为${platformLabel}生成一张 ${asset.ratio ?? "平台适配"} 图片：${draft.title}。${draft.digest ?? ""}`.trim()
      };
    }
  };
}
