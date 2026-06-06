export interface WechatTokenResult {
  ok: boolean;
  status: number;
  expiresIn?: unknown;
  errcode?: unknown;
  errmsg?: unknown;
  tokenPreview?: string;
}

function maskSecret(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.length <= 4 ? "****" : `${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

export async function requestWechatAccessToken(
  appId: string,
  appSecret: string,
  fetchImpl: typeof fetch = fetch
): Promise<WechatTokenResult> {
  // Health check only: never return the raw token to the API or Web workbench.
  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", appSecret);

  const response = await fetchImpl(url);
  const payload = await response.json() as Record<string, unknown>;
  return {
    ok: response.ok && typeof payload.access_token === "string",
    status: response.status,
    expiresIn: payload.expires_in,
    errcode: payload.errcode,
    errmsg: payload.errmsg,
    tokenPreview: typeof payload.access_token === "string" ? maskSecret(payload.access_token) : undefined
  };
}
