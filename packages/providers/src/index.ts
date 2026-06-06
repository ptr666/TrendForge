import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ArticleSummary, CandidateSelection, ImageProvider, MediaAsset, PlatformDraft, TextProvider, VerifiedArticle } from "../../core/src/types.js";
import type { FullTextProvider, SourceItem } from "../../core/src/types.js";

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

export function createDefaultTextProvider(): TextProvider {
  return {
    async summarize(article: VerifiedArticle, selection: CandidateSelection): Promise<ArticleSummary> {
      const sourceText = compactText(article.fullText ?? article.failureReason ?? "No full text available.", 1200);
      const firstSentence = sourceText.split(/[。！？.!?]/).find((part) => part.trim().length > 0)?.trim() ?? sourceText;
      const keyPoints = sourceText
        .split(/[。！？.!?\n]/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .slice(0, 3);

      return {
        sourceItemId: article.sourceItemId,
        title: `AI 趋势信号 ${article.sourceItemId}`,
        summary: firstSentence || "暂无可用摘要。",
        angle: selection.angle ?? "这个信号具备 AI 趋势观察和内容发布价值。",
        keyPoints: keyPoints.length > 0 ? keyPoints : [selection.reason],
        riskNotes: article.status === "verified" ? [] : [article.failureReason ?? `文章状态为 ${article.status}。`]
      };
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
          failureReason: `BrowserAct extraction failed: ${(result.stderr || "empty output").trim()}`
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

function readSummaryJson(content: string): Omit<ArticleSummary, "sourceItemId"> {
  const parsed = JSON.parse(content) as Partial<Omit<ArticleSummary, "sourceItemId">>;
  return {
    title: String(parsed.title ?? "未命名 AI 趋势摘要"),
    summary: String(parsed.summary ?? "模型未返回摘要。"),
    angle: String(parsed.angle ?? "这个信号具备 AI 趋势观察和内容发布价值。"),
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(String) : [],
    riskNotes: Array.isArray(parsed.riskNotes) ? parsed.riskNotes.map(String) : []
  };
}

export function createOpenAICompatibleTextProvider(options: OpenAICompatibleOptions): TextProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = `${options.baseUrl.replace(/\/$/, "")}/chat/completions`;

  return {
    async summarize(article: VerifiedArticle, selection: CandidateSelection): Promise<ArticleSummary> {
      const sourceText = compactText(article.fullText ?? article.failureReason ?? "No full text available.", 6000);
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
              content: "你是中文 AI 热点内容编辑。请把来源文本总结为适合公众号和小红书二次创作的中文素材。必须返回严格 JSON，字段为 title、summary、angle、keyPoints、riskNotes；除专有名词外，所有字段内容都使用简体中文。"
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

      if (!response.ok) {
        throw new Error(`Text provider failed: ${response.status} ${response.statusText}`);
      }

      const payload = await response.json() as ChatCompletionResponse;
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Text provider failed: missing assistant content.");
      }

      return {
        sourceItemId: article.sourceItemId,
        ...readSummaryJson(content)
      };
    }
  };
}

export function createDefaultImageProvider(): ImageProvider {
  return {
    async planPrompt(draft: PlatformDraft, asset: MediaAsset): Promise<MediaAsset> {
      const platformLabel = draft.platform === "wechat" ? "WeChat official account" : draft.platform === "xhs" ? "Xiaohongshu" : "review";
      return {
        ...asset,
        source: "placeholder",
        prompt: `Create a ${asset.ratio ?? "platform-fit"} visual for ${platformLabel}: ${draft.title}. ${draft.digest ?? ""}`.trim()
      };
    }
  };
}
