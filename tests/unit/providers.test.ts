import test from "node:test";
import assert from "node:assert/strict";
import {
  createBrowserActFullTextProvider,
  createDefaultTextProvider,
  createHttpFullTextProvider,
  createOpenAICompatibleSelector,
  createOpenAICompatibleTextProvider
} from "../../packages/providers/src/index.js";
import type { CandidateSelection, SourceItem, VerifiedArticle } from "../../packages/core/src/types.js";

const item: SourceItem = {
  id: "rsshub-test",
  sourceType: "rss",
  collectorAdapter: "rsshub",
  complianceStatus: "not_required",
  title: "BrowserAct provider test",
  url: "https://example.com/full-text",
  summary: "Brief summary"
};

const article: VerifiedArticle = {
  sourceItemId: item.id,
  status: "partial",
  method: "rss",
  evidenceUrl: item.url,
  failureReason: "Needs original text."
};

const selection: CandidateSelection = {
  sourceItemId: item.id,
  score: 88,
  reason: "Strong AI workflow relevance.",
  targetPlatforms: ["review", "wechat", "xhs"],
  angle: "AI workflow automation",
  tags: ["ai"]
};

test("BrowserAct full-text provider turns command output into verified article text", async () => {
  const provider = createBrowserActFullTextProvider({
    command: "browser-act",
    runCommand: async (command, args) => {
      assert.equal(command, "browser-act");
      assert.deepEqual(args, ["stealth-extract", item.url, "--content-type", "markdown"]);
      return {
        exitCode: 0,
        stdout: "# Full article\n\nBrowserAct extracted article text.",
        stderr: ""
      };
    }
  });

  const result = await provider.acquire(item, article);

  assert.equal(result.status, "verified");
  assert.equal(result.method, "browseract");
  assert.equal(result.evidenceUrl, item.url);
  assert.equal(result.fullText, "# Full article\n\nBrowserAct extracted article text.");
  assert.equal(result.failureReason, undefined);
});

test("BrowserAct full-text provider returns failed article when command fails", async () => {
  const provider = createBrowserActFullTextProvider({
    command: "browser-act",
    runCommand: async () => ({
      exitCode: 2,
      stdout: "",
      stderr: "browser not configured"
    })
  });

  const result = await provider.acquire(item, article);

  assert.equal(result.status, "failed");
  assert.equal(result.method, "browseract");
  assert.equal(result.fullText, undefined);
  assert.equal(result.failureReason, "BrowserAct 原文获取失败：browser not configured");
});

test("HTTP full-text provider extracts readable text from HTML", async () => {
  const provider = createHttpFullTextProvider({
    minTextLength: 20,
    fetchImpl: async () => new Response(`
      <html>
        <head><title>Ignored</title><script>noise()</script></head>
        <body>
          <article>
            <h1>Original article</h1>
            <p>AI teams now use agents to collect signals and draft research notes.</p>
            <p>This paragraph should be preserved as readable text.</p>
          </article>
        </body>
      </html>
    `, { status: 200, headers: { "content-type": "text/html" } })
  });

  const result = await provider.acquire(item, article);

  assert.equal(result.status, "verified");
  assert.equal(result.method, "http");
  assert.match(result.fullText ?? "", /Original article/);
  assert.match(result.fullText ?? "", /This paragraph should be preserved/);
  assert.equal(result.failureReason, undefined);
});

test("HTTP full-text provider extracts plain text and reports readable failures", async () => {
  const plainProvider = createHttpFullTextProvider({
    minTextLength: 20,
    fetchImpl: async () => new Response("Plain original article text with enough detail for a summary.", {
      status: 200,
      headers: { "content-type": "text/plain" }
    })
  });
  const failedProvider = createHttpFullTextProvider({
    fetchImpl: async () => new Response("not found", { status: 404, statusText: "Not Found" })
  });

  const plain = await plainProvider.acquire(item, article);
  const failed = await failedProvider.acquire(item, article);

  assert.equal(plain.status, "verified");
  assert.equal(plain.method, "http");
  assert.match(plain.fullText ?? "", /Plain original article text/);
  assert.equal(failed.status, "failed");
  assert.equal(failed.method, "http");
  assert.match(failed.failureReason ?? "", /HTTP 原文获取失败/);
});

test("default text provider returns readable Chinese fallback summary", async () => {
  const provider = createDefaultTextProvider();

  const result = await provider.summarize({
    ...article,
    status: "verified",
    method: "browseract",
    fullText: "AI 工作流产品正在从演示进入日常运营。团队需要更稳定的审核与发布链路。"
  }, selection);

  assert.equal(result.title, `AI 趋势信号 ${article.sourceItemId}`);
  assert.match(result.summary, /这条 AI 热点信号值得进入人工复核/);
  assert.match(result.translatedOriginal ?? "", /未配置真实翻译模型/);
  assert.deepEqual(result.keyPoints, [
    "要点 1：AI 工作流产品正在从演示进入日常运营",
    "要点 2：团队需要更稳定的审核与发布链路"
  ]);
});

test("OpenAI-compatible text provider creates translated Chinese summary from chat completion JSON", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown>; authorization?: string }> = [];
  const provider = createOpenAICompatibleTextProvider({
    baseUrl: "https://models.example.test/v1",
    apiKey: "test-key",
    model: "summary-model",
    fetchImpl: async (url, init) => {
      requests.push({
        url: String(url),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        authorization: init?.headers instanceof Headers ? init.headers.get("authorization") ?? undefined : (init?.headers as Record<string, string>).authorization
      });
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              title: "智能体工作流正在落地",
              translatedOriginal: "AI 智能体正在变成实际的工作流操作者。",
              summary: "AI 智能体正在从演示走向日常工作流。",
              angle: "从工具演示到日常运营",
              keyPoints: ["智能体收集信号", "团队需要审核 gate"],
              riskNotes: ["核查厂商说法"]
            })
          }
        }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  const result = await provider.summarize({
    ...article,
    status: "verified",
    method: "browseract",
    fullText: "Long original article text about agentic AI workflows."
  }, selection);

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "https://models.example.test/v1/chat/completions");
  assert.equal(requests[0]?.authorization, "Bearer test-key");
  assert.equal(requests[0]?.body.model, "summary-model");
  assert.match(JSON.stringify(requests[0]?.body), /translatedOriginal/);
  assert.match(JSON.stringify(requests[0]?.body), /简体中文/);
  assert.equal(result.title, "智能体工作流正在落地");
  assert.equal(result.translatedOriginal, "AI 智能体正在变成实际的工作流操作者。");
  assert.equal(result.summary, "AI 智能体正在从演示走向日常工作流。");
  assert.deepEqual(result.keyPoints, ["智能体收集信号", "团队需要审核 gate"]);
});

test("OpenAI-compatible selector scores candidates with Chinese reason", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown>; authorization?: string }> = [];
  const selector = createOpenAICompatibleSelector({
    baseUrl: "https://models.example.test/v1",
    apiKey: "test-key",
    model: "selector-model",
    fetchImpl: async (url, init) => {
      requests.push({
        url: String(url),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        authorization: init?.headers instanceof Headers ? init.headers.get("authorization") ?? undefined : (init?.headers as Record<string, string>).authorization
      });
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              score: 93,
              reason: "信息新、来源清晰，适合进入选题。",
              angle: "从 AI 工作流产品化角度展开。",
              tags: ["aihot", "agent"]
            })
          }
        }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  const result = await selector.score(article);

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "https://models.example.test/v1/chat/completions");
  assert.equal(requests[0]?.authorization, "Bearer test-key");
  assert.equal(requests[0]?.body.model, "selector-model");
  assert.match(JSON.stringify(requests[0]?.body), /简体中文/);
  assert.equal(result.score, 93);
  assert.equal(result.reason, "信息新、来源清晰，适合进入选题。");
  assert.equal(result.angle, "从 AI 工作流产品化角度展开。");
});

test("OpenAI-compatible selector falls back when model returns invalid JSON", async () => {
  const selector = createOpenAICompatibleSelector({
    baseUrl: "https://models.example.test/v1",
    apiKey: "test-key",
    model: "selector-model",
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: "{\"score\": 88, \"reason\": \"数组坏了\", \"tags\": [\"ai\", }"
        }
      }]
    }), { status: 200, headers: { "content-type": "application/json" } })
  });

  const result = await selector.score(article);

  assert.equal(result.score, 50);
  assert.match(result.reason, /模型返回的结构化 JSON 无法解析/);
  assert.ok(result.tags.includes("model-json-fallback"));
});

test("OpenAI-compatible text provider falls back when model returns invalid JSON", async () => {
  const provider = createOpenAICompatibleTextProvider({
    baseUrl: "https://models.example.test/v1",
    apiKey: "test-key",
    model: "summary-model",
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: "{\"title\":\"坏 JSON\",\"summary\":\"缺少数组闭合\",\"keyPoints\":[\"a\","
        }
      }]
    }), { status: 200, headers: { "content-type": "application/json" } })
  });

  const result = await provider.summarize({
    ...article,
    status: "verified",
    method: "http",
    fullText: "Original article text."
  }, selection);

  assert.equal(result.title, "未命名 AI 趋势摘要");
  assert.match(result.summary, /模型返回的结构化 JSON 无法解析/);
  assert.match(result.riskNotes[0] ?? "", /模型返回的结构化 JSON 无法解析/);
});
