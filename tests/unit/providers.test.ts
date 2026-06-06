import test from "node:test";
import assert from "node:assert/strict";
import {
  createBrowserActFullTextProvider,
  createDefaultTextProvider,
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
  assert.equal(result.failureReason, "BrowserAct extraction failed: browser not configured");
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
  assert.match(result.summary, /这条 AI 热点信号显示/);
  assert.deepEqual(result.keyPoints, [
    "原文要点 1：AI 工作流产品正在从演示进入日常运营",
    "原文要点 2：团队需要更稳定的审核与发布链路"
  ]);
});

test("OpenAI-compatible text provider creates summary from chat completion JSON", async () => {
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
              title: "Agentic AI workflows",
              summary: "AI agents are becoming practical workflow operators.",
              angle: "From tool demos to daily operations",
              keyPoints: ["Agents collect signals", "Teams need review gates"],
              riskNotes: ["Verify vendor claims"]
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
  assert.match(JSON.stringify(requests[0]?.body), /简体中文/);
  assert.equal(result.title, "Agentic AI workflows");
  assert.equal(result.summary, "AI agents are becoming practical workflow operators.");
  assert.deepEqual(result.keyPoints, ["Agents collect signals", "Teams need review gates"]);
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
