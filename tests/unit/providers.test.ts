import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createBrowserActFullTextProvider,
  createDefaultTextProvider,
  createHttpFullTextProvider,
  createOpenAICompatibleImageProvider,
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

test("HTTP full-text provider fails short extracted originals even when a brief exists", async () => {
  const provider = createHttpFullTextProvider({
    fetchImpl: async () => new Response("Too short.", {
      status: 200,
      headers: { "content-type": "text/plain" }
    })
  });

  const result = await provider.acquire(item, {
    ...article,
    fullText: "Existing brief text should not be treated as verified original text."
  });

  assert.equal(result.status, "failed");
  assert.equal(result.method, "http");
  assert.match(result.failureReason ?? "", /抽取出的正文太短/);
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

test("OpenAI-compatible image provider calls Responses image generation and writes an asset file", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-image-provider-"));
  const requests: Array<{ url: string; body: Record<string, unknown>; authorization?: string }> = [];
  const provider = createOpenAICompatibleImageProvider({
    baseUrl: "http://images.example.test",
    apiKey: "image-key",
    model: "image-model",
    outputDir: rootDir,
    fetchImpl: async (url, init) => {
      requests.push({
        url: String(url),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        authorization: init?.headers instanceof Headers ? init.headers.get("authorization") ?? undefined : (init?.headers as Record<string, string>).authorization
      });
      return new Response(JSON.stringify({
        output: [{
          type: "image_generation_call",
          result: Buffer.from("fake-png").toString("base64")
        }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  try {
    const result = await provider.planPrompt({
      id: "wechat-draft-1",
      sourceItemId: "source-1",
      platform: "wechat",
      title: "AI workflow cover",
      body: "Draft body",
      digest: "Digest"
    }, {
      id: "cover-wechat-draft-1",
      draftId: "wechat-draft-1",
      type: "cover",
      source: "placeholder",
      ratio: "16:9",
      filename: "custom-cover",
      metadata: {
        outputDir: path.join(rootDir, "run-assets")
      }
    });

    assert.equal(requests[0]?.url, "http://images.example.test/v1/responses");
    assert.equal(requests[0]?.authorization, "Bearer image-key");
    assert.equal(requests[0]?.body.model, "image-model");
    assert.deepEqual(requests[0]?.body.tools, [{ type: "image_generation" }]);
    assert.match(String(requests[0]?.body.input), /16:9/);
    assert.equal(result.source, "generated");
    assert.equal(result.path, path.join(rootDir, "run-assets", "custom-cover.png"));
    assert.equal((await readFile(result.path ?? "")).toString("utf8"), "fake-png");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("OpenAI-compatible image provider falls back to images generations when Responses rejects image model", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-image-generations-"));
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const provider = createOpenAICompatibleImageProvider({
    baseUrl: "http://images.example.test",
    apiKey: "image-key",
    model: "gpt-image-2",
    outputDir: rootDir,
    fetchImpl: async (url, init) => {
      requests.push({
        url: String(url),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>
      });
      if (String(url).endsWith("/responses")) {
        return new Response(JSON.stringify({
          error: {
            message: "model gpt-image-2 is only supported on /v1/images/generations and /v1/images/edits"
          }
        }), { status: 503, statusText: "Service Unavailable", headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        data: [{
          b64_json: Buffer.from("fake-generations-png").toString("base64")
        }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  try {
    const result = await provider.planPrompt({
      id: "xhs-draft-1",
      sourceItemId: "source-1",
      platform: "xhs",
      title: "AI workflow image",
      body: "Draft body"
    }, {
      id: "xhs-image-draft-1",
      draftId: "xhs-draft-1",
      type: "xhs_image",
      source: "placeholder",
      ratio: "3:4"
    });

    assert.equal(requests[0]?.url, "http://images.example.test/v1/responses");
    assert.equal(requests[1]?.url, "http://images.example.test/v1/images/generations");
    assert.equal(requests[1]?.body.model, "gpt-image-2");
    assert.equal(requests[1]?.body.size, "1024x1536");
    assert.equal((await readFile(result.path ?? "")).toString("utf8"), "fake-generations-png");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("OpenAI-compatible image provider times out stalled image requests", async () => {
  const provider = createOpenAICompatibleImageProvider({
    baseUrl: "http://images.example.test",
    apiKey: "image-key",
    model: "image-model",
    requestTimeoutMs: 10,
    fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })
  });

  await assert.rejects(
    () => provider.planPrompt({
      id: "wechat-draft-timeout",
      sourceItemId: "source-timeout",
      platform: "wechat",
      title: "Timeout image",
      body: "Draft body"
    }, {
      id: "cover-wechat-draft-timeout",
      draftId: "wechat-draft-timeout",
      type: "cover",
      source: "placeholder",
      ratio: "16:9"
    }),
    /timed out/
  );
});

test("OpenAI-compatible provider treats bare host base URL as v1 chat completions endpoint", async () => {
  const requests: string[] = [];
  const provider = createOpenAICompatibleTextProvider({
    baseUrl: "http://models.example.test",
    apiKey: "test-key",
    model: "summary-model",
    fetchImpl: async (url) => {
      requests.push(String(url));
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              title: "标题",
              translatedOriginal: "译文",
              summary: "总结",
              angle: "角度",
              keyPoints: [],
              riskNotes: []
            })
          }
        }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  await provider.summarize({ ...article, status: "verified", method: "http", fullText: "text" }, selection);

  assert.equal(requests[0], "http://models.example.test/v1/chat/completions");
});

test("OpenAI-compatible provider reports HTML responses as endpoint configuration errors", async () => {
  const provider = createOpenAICompatibleTextProvider({
    baseUrl: "http://models.example.test",
    apiKey: "test-key",
    model: "summary-model",
    fetchImpl: async () => new Response("<!doctype html><html><title>Dashboard</title></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" }
    })
  });

  await assert.rejects(
    provider.summarize({ ...article, status: "verified", method: "http", fullText: "text" }, selection),
    /模型接口返回了 HTML/
  );
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
