import test from "node:test";
import assert from "node:assert/strict";
import { requestWechatAccessToken } from "../../packages/publishers/src/wechat.js";

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
