import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  checkWechatDraftGate,
  createWechatOfficialPublisher,
  requestWechatAccessToken,
  requestWechatDraftAdd
} from "../../packages/publishers/src/wechat.js";
import { readWechatConfig, toPublicWechatConfig, writeWechatConfig } from "../../packages/config/src/local-config.js";
import type { MediaAsset, PlatformDraft } from "../../packages/core/src/types.js";

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

test("WeChat draft gate accepts a local cover image path after token check passes", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-wechat-cover-gate-"));
  const coverPath = path.join(rootDir, "cover.png");
  await writeFile(coverPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  try {
    const gate = await checkWechatDraftGate({
      enabled: true,
      appId: "wx-app",
      appSecret: "wx-secret",
      coverImagePath: coverPath
    }, {
      allowRealDraft: true,
      fetchImpl: async () => new Response(JSON.stringify({
        access_token: "wechat-token",
        expires_in: 7200
      }), { status: 200, headers: { "content-type": "application/json" } })
    });

    assert.equal(gate.ok, true);
    assert.equal(gate.status, "ready");
    assert.match(gate.message, /cover image/i);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("WeChat draft gate accepts a generated cover asset after token check passes", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-wechat-generated-cover-gate-"));
  const coverPath = path.join(rootDir, "generated-cover.png");
  await writeFile(coverPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const assets: MediaAsset[] = [{
    id: "cover-asset",
    draftId: "wechat-draft",
    platform: "wechat",
    type: "cover",
    source: "generated",
    status: "needs-approval",
    path: coverPath
  }];

  try {
    const gate = await checkWechatDraftGate({
      enabled: true,
      appId: "wx-app",
      appSecret: "wx-secret"
    }, {
      allowRealDraft: true,
      assets,
      fetchImpl: async () => new Response(JSON.stringify({
        access_token: "wechat-token",
        expires_in: 7200
      }), { status: 200, headers: { "content-type": "application/json" } })
    });

    assert.equal(gate.ok, true);
    assert.equal(gate.status, "ready");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("WeChat config can inherit credentials from the official-account legacy script without exposing the secret", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-wechat-legacy-"));
  const legacyPath = path.join(rootDir, "wechat-publish-v3.js");

  await writeFile(legacyPath, [
    "const APPID = 'wx-legacy-app';",
    "const APPSECRET = 'legacy-wechat-secret';"
  ].join("\n"));

  try {
    await writeWechatConfig({
      enabled: true,
      appId: "",
      legacyCredentialSource: legacyPath
    }, rootDir);

    const config = await readWechatConfig(rootDir);
    const publicConfig = toPublicWechatConfig(config);

    assert.equal(config.appId, "wx-legacy-app");
    assert.equal(config.appSecret, "legacy-wechat-secret");
    assert.equal(publicConfig.secretConfigured, true);
    assert.match(publicConfig.secretPreview ?? "", /^\*+cret$/);
    assert.equal("appSecret" in publicConfig, false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
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
    assert.match(body.articles?.[0]?.content ?? "", /<h1/);
    assert.doesNotMatch(body.articles?.[0]?.content ?? "", /^#\s/m);
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
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-wechat-real-cover-"));
  const coverPath = path.join(rootDir, "cover.png");
  await writeFile(coverPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const draft: PlatformDraft = {
    id: "wechat-source",
    sourceItemId: "source",
    platform: "wechat",
    title: "中文 AI 热点",
    body: "# 中文 AI 热点\n\n这是一篇公众号草稿。\n\n<img src=\"https://example.com/inline.png\">",
    digest: "用于测试的公众号摘要。"
  };
  const calls: string[] = [];
  const publisher = createWechatOfficialPublisher({
    enabled: true,
    appId: "wx-app",
    appSecret: "wx-secret",
    coverImagePath: coverPath
  }, {
    fetchImpl: async (url, init) => {
      calls.push(String(url));
      const calledUrl = new URL(String(url));
      if (calledUrl.pathname.endsWith("/token")) {
        return new Response(JSON.stringify({ access_token: "wechat-token", expires_in: 7200 }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (calledUrl.pathname.endsWith("/material/add_material")) {
        assert.equal(init?.method, "POST");
        return new Response(JSON.stringify({ media_id: "uploaded-cover-media-id" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (calledUrl.pathname.endsWith("/media/uploadimg")) {
        assert.equal(init?.method, "POST");
        return new Response(JSON.stringify({ url: "https://mmbiz.qpic.cn/uploaded-inline.png" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (calledUrl.pathname.endsWith("/draft/add")) {
        const body = JSON.parse(String(init?.body)) as { articles?: Array<{ thumb_media_id?: string; content?: string }> };
        assert.equal(body.articles?.[0]?.thumb_media_id, "uploaded-cover-media-id");
        assert.match(body.articles?.[0]?.content ?? "", /mmbiz\.qpic\.cn\/uploaded-inline\.png/);
        assert.match(body.articles?.[0]?.content ?? "", /<h1/);
        assert.doesNotMatch(body.articles?.[0]?.content ?? "", /^#\s/m);
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
  assert.ok(calls.some((call) => call.includes("/cgi-bin/material/add_material")));
  assert.ok(calls.some((call) => call.includes("/cgi-bin/media/uploadimg")));
  assert.ok(calls.some((call) => call.includes("/cgi-bin/draft/add")));
  assert.equal(JSON.stringify(result).includes("wechat-token"), false);
  await rm(rootDir, { recursive: true, force: true });
});

test("WeChat official publisher uploads generated cover and inline assets", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-wechat-generated-assets-"));
  const coverPath = path.join(rootDir, "generated-cover.png");
  const inlinePath = path.join(rootDir, "generated-inline.png");
  await writeFile(coverPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await writeFile(inlinePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const draft: PlatformDraft = {
    id: "wechat-generated-source",
    sourceItemId: "source",
    platform: "wechat",
    title: "生成图片公众号草稿",
    body: "# 生成图片公众号草稿\n\n这是一篇公众号草稿。",
    digest: "用于测试生成图片资产。"
  };
  const assets: MediaAsset[] = [{
    id: "cover-asset",
    draftId: draft.id,
    platform: "wechat",
    type: "cover",
    source: "generated",
    status: "needs-approval",
    path: coverPath
  }, {
    id: "inline-asset",
    draftId: draft.id,
    platform: "wechat",
    type: "inline_image",
    source: "generated",
    status: "needs-approval",
    path: inlinePath,
    altText: "正文信息图"
  }];
  const uploadedSources: string[] = [];
  const publisher = createWechatOfficialPublisher({
    enabled: true,
    appId: "wx-app",
    appSecret: "wx-secret",
    coverMediaId: "configured-cover-media-id"
  }, {
    fetchImpl: async (url, init) => {
      const calledUrl = new URL(String(url));
      if (calledUrl.pathname.endsWith("/token")) {
        return new Response(JSON.stringify({ access_token: "wechat-token", expires_in: 7200 }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (calledUrl.pathname.endsWith("/material/add_material")) {
        uploadedSources.push("cover");
        return new Response(JSON.stringify({ media_id: "generated-cover-media-id" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (calledUrl.pathname.endsWith("/media/uploadimg")) {
        uploadedSources.push("inline");
        return new Response(JSON.stringify({ url: "https://mmbiz.qpic.cn/generated-inline.png" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (calledUrl.pathname.endsWith("/draft/add")) {
        const body = JSON.parse(String(init?.body)) as { articles?: Array<{ thumb_media_id?: string; content?: string }> };
        assert.equal(body.articles?.[0]?.thumb_media_id, "generated-cover-media-id");
        assert.match(body.articles?.[0]?.content ?? "", /generated-inline\.png/);
        assert.match(body.articles?.[0]?.content ?? "", /<figure/);
        assert.doesNotMatch(body.articles?.[0]?.content ?? "", /^#\s/m);
      }
      return new Response(JSON.stringify({ media_id: "draft-media-id" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  try {
    const result = await publisher.publishDraft(draft, { allowRealDraft: true, assets });

    assert.equal(result.status, "success");
    assert.deepEqual(uploadedSources, ["cover", "inline"]);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
