import test from "node:test";
import assert from "node:assert/strict";
import {
  checkWechatDraftGate,
  createWechatOfficialPublisher,
  requestWechatAccessToken,
  requestWechatDraftAdd
} from "../../packages/publishers/src/wechat.js";
import type { PlatformDraft } from "../../packages/core/src/types.js";

test("WeChat token request calls official API and masks returned token", async () => {
  const calls: string[] = [];
  const result = await requestWechatAccessToken("wx-app-id", "wx-secret", async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({
      access_token: "wechat-access-token-secret",
      expires_in: 7200
    }), { status: 200, headers: { "content-type": "application/json" } });
  });

  const calledUrl = new URL(calls[0] ?? "");

  assert.equal(calledUrl.origin + calledUrl.pathname, "https://api.weixin.qq.com/cgi-bin/token");
  assert.equal(calledUrl.searchParams.get("grant_type"), "client_credential");
  assert.equal(calledUrl.searchParams.get("appid"), "wx-app-id");
  assert.equal(calledUrl.searchParams.get("secret"), "wx-secret");
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.expiresIn, 7200);
  assert.match(result.tokenPreview ?? "", /^\*+cret$/);
});

test("WeChat draft gate keeps dry-run queued without touching official API", async () => {
  let called = false;
  const gate = await checkWechatDraftGate({ enabled: false, appId: "" }, {
    allowRealDraft: false,
    fetchImpl: async () => {
      called = true;
      return new Response("{}");
    }
  });

  assert.equal(gate.ok, true);
  assert.equal(gate.status, "dry-run");
  assert.equal(called, false);
});

test("WeChat draft gate fails closed when real draft config is missing", async () => {
  const gate = await checkWechatDraftGate({ enabled: true, appId: "wx-app" }, { allowRealDraft: true });

  assert.equal(gate.ok, false);
  assert.equal(gate.status, "blocked");
  assert.match(gate.message, /appSecret/);
});

test("WeChat draft gate requires cover media after token check passes", async () => {
  const gate = await checkWechatDraftGate({
    enabled: true,
    appId: "wx-app",
    appSecret: "wx-secret"
  }, {
    allowRealDraft: true,
    fetchImpl: async () => new Response(JSON.stringify({
      access_token: "wechat-token",
      expires_in: 7200
    }), { status: 200, headers: { "content-type": "application/json" } })
  });

  assert.equal(gate.ok, false);
  assert.equal(gate.status, "blocked");
  assert.match(gate.message, /coverMediaId/);
  assert.match(gate.token?.tokenPreview ?? "", /^\*+oken$/);
  assert.equal(JSON.stringify(gate).includes("wechat-token"), false);
});

test("WeChat draft creation calls official draft API and returns media id", async () => {
  const calls: string[] = [];
  const draft: PlatformDraft = {
    id: "wechat-source",
    sourceItemId: "source",
    platform: "wechat",
    title: "中文 AI 热点",
    body: "# 中文 AI 热点\n\n这是一篇公众号草稿。",
    digest: "用于测试的公众号摘要。"
  };

  const result = await requestWechatDraftAdd("wechat-token", draft, "cover-media-id", async (url, init) => {
    calls.push(String(url));
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body)) as { articles?: Array<{ thumb_media_id?: string; title?: string; content?: string }> };
    assert.equal(body.articles?.[0]?.thumb_media_id, "cover-media-id");
    assert.equal(body.articles?.[0]?.title, "中文 AI 热点");
    assert.match(body.articles?.[0]?.content ?? "", /公众号草稿/);
    return new Response(JSON.stringify({ media_id: "draft-media-id" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });

  const calledUrl = new URL(calls[0] ?? "");
  assert.equal(calledUrl.origin + calledUrl.pathname, "https://api.weixin.qq.com/cgi-bin/draft/add");
  assert.equal(calledUrl.searchParams.get("access_token"), "wechat-token");
  assert.equal(result.ok, true);
  assert.equal(result.mediaId, "draft-media-id");
});

test("WeChat official publisher creates a real draft only when gates pass", async () => {
  const draft: PlatformDraft = {
    id: "wechat-source",
    sourceItemId: "source",
    platform: "wechat",
    title: "中文 AI 热点",
    body: "# 中文 AI 热点\n\n这是一篇公众号草稿。",
    digest: "用于测试的公众号摘要。"
  };
  const calls: string[] = [];
  const publisher = createWechatOfficialPublisher({
    enabled: true,
    appId: "wx-app",
    appSecret: "wx-secret",
    coverMediaId: "cover-media-id"
  }, {
    fetchImpl: async (url) => {
      calls.push(String(url));
      const calledUrl = new URL(String(url));
      if (calledUrl.pathname.endsWith("/token")) {
        return new Response(JSON.stringify({ access_token: "wechat-token", expires_in: 7200 }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ media_id: "draft-media-id" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  const dryRun = await publisher.publishDraft(draft, { allowRealDraft: false });
  const result = await publisher.publishDraft(draft, { allowRealDraft: true });

  assert.equal(dryRun.status, "queued");
  assert.equal(result.status, "success");
  assert.equal(result.externalId, "draft-media-id");
  assert.ok(calls.some((call) => call.includes("/cgi-bin/token")));
  assert.ok(calls.some((call) => call.includes("/cgi-bin/draft/add")));
  assert.equal(JSON.stringify(result).includes("wechat-token"), false);
});
