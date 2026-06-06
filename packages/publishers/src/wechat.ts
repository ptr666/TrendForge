import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PlatformDraft, PublishResult } from "../../core/src/types.js";
import type { WechatConfig } from "../../config/src/local-config.js";

export interface WechatTokenResult {
  ok: boolean;
  status: number;
  expiresIn?: unknown;
  errcode?: unknown;
  errmsg?: unknown;
  tokenPreview?: string;
}

export interface WechatDraftResult {
  ok: boolean;
  status: number;
  mediaId?: string;
  errcode?: unknown;
  errmsg?: unknown;
}

export interface WechatDraftGate {
  ok: boolean;
  status: "dry-run" | "blocked" | "ready";
  message: string;
  token?: WechatTokenResult;
}

function wechatCommands(draft: PlatformDraft) {
  return [
    {
      name: "wechat-preview",
      command: ["npm", "run", "preview", "--", "--draft-id", draft.id],
      reason: "Render the WeChat article preview before official API draft creation.",
      successSignal: "output/article-final.html exists"
    },
    {
      name: "wechat-check",
      command: ["npm", "run", "check", "--", "--draft-id", draft.id],
      reason: "Check credentials, IP whitelist, article fields, and cover readiness.",
      successSignal: "workflow check passes"
    },
    {
      name: "wechat-create-draft",
      command: ["node", "wechat-final.js", "--draft-id", draft.id],
      reason: "Create an official-account draft only after explicit realDraft approval.",
      requiresExplicitApproval: true,
      successSignal: "state/published.json contains the created draft id"
    }
  ];
}

async function writeWechatHandoff(draft: PlatformDraft, handoffDir?: string): Promise<string | undefined> {
  if (!handoffDir) return undefined;
  await mkdir(handoffDir, { recursive: true });
  const artifactPath = path.join(handoffDir, `wechat-${draft.id}.json`);
  await writeFile(artifactPath, JSON.stringify({
    workflow: "wechat-official-account-workflow",
    platform: "wechat",
    draft,
    plannedCommands: wechatCommands(draft),
    verificationSignal: "state/published.json and output/article-final.html required"
  }, null, 2), "utf8");
  return artifactPath;
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

async function requestWechatAccessTokenRaw(
  appId: string,
  appSecret: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ token?: string; publicResult: WechatTokenResult }> {
  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", appSecret);

  const response = await fetchImpl(url);
  const payload = await response.json() as Record<string, unknown>;
  const token = typeof payload.access_token === "string" ? payload.access_token : undefined;
  return {
    token,
    publicResult: {
      ok: response.ok && Boolean(token),
      status: response.status,
      expiresIn: payload.expires_in,
      errcode: payload.errcode,
      errmsg: payload.errmsg,
      tokenPreview: maskSecret(token)
    }
  };
}

function wechatArticleFromDraft(draft: PlatformDraft, coverMediaId: string) {
  const digest = (draft.digest ?? draft.body).replace(/\s+/g, " ").trim().slice(0, 120);
  return {
    articles: [{
      title: draft.title.slice(0, 64),
      author: "TrendForge",
      digest,
      content: draft.body,
      thumb_media_id: coverMediaId,
      need_open_comment: 0,
      only_fans_can_comment: 0
    }]
  };
}

export async function requestWechatDraftAdd(
  accessToken: string,
  draft: PlatformDraft,
  coverMediaId: string,
  fetchImpl: typeof fetch = fetch
): Promise<WechatDraftResult> {
  const url = new URL("https://api.weixin.qq.com/cgi-bin/draft/add");
  url.searchParams.set("access_token", accessToken);

  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(wechatArticleFromDraft(draft, coverMediaId))
  });
  const payload = await response.json() as Record<string, unknown>;
  return {
    ok: response.ok && typeof payload.media_id === "string",
    status: response.status,
    mediaId: typeof payload.media_id === "string" ? payload.media_id : undefined,
    errcode: payload.errcode,
    errmsg: payload.errmsg
  };
}

export async function checkWechatDraftGate(
  config: WechatConfig,
  options: { allowRealDraft?: boolean; fetchImpl?: typeof fetch } = {}
): Promise<WechatDraftGate> {
  if (options.allowRealDraft !== true) {
    return {
      ok: true,
      status: "dry-run",
      message: "Dry-run publisher handoff is queued. Set allowRealDraft=true to check real WeChat draft gates."
    };
  }
  if (!config.enabled || !config.appId || !config.appSecret) {
    return {
      ok: false,
      status: "blocked",
      message: "Real WeChat draft creation requires enabled=true, appId, and appSecret."
    };
  }

  const token = await requestWechatAccessToken(config.appId, config.appSecret, options.fetchImpl);
  if (!token.ok) {
    return {
      ok: false,
      status: "blocked",
      message: `WeChat token check failed: ${token.errmsg ?? token.errcode ?? token.status}. Check credentials and IP whitelist.`,
      token
    };
  }
  if (!config.coverMediaId) {
    return {
      ok: false,
      status: "blocked",
      message: "WeChat token check passed, but coverMediaId is required before official draft creation.",
      token
    };
  }

  return {
    ok: true,
    status: "ready",
    message: "WeChat credentials, token check, and cover media id are ready for official draft creation.",
    token
  };
}

export function createWechatOfficialPublisher(
  config: WechatConfig,
  options: { fetchImpl?: typeof fetch } = {}
) {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    platform: "wechat" as const,
    async healthcheck() {
      const gate = await checkWechatDraftGate(config, { allowRealDraft: true, fetchImpl });
      return { ok: gate.ok, message: gate.message, gate };
    },
    async preview(draft: PlatformDraft) {
      return {
        ok: true,
        message: `WeChat draft ${draft.id} can be previewed through wechat-official-account-workflow before official draft creation.`
      };
    },
    async publishDraft(
      draft: PlatformDraft,
      publishOptions: { allowRealDraft?: boolean; handoffDir?: string } = {}
    ): Promise<PublishResult> {
      const artifactPath = await writeWechatHandoff(draft, publishOptions.handoffDir);
      const plannedCommands = wechatCommands(draft);
      if (publishOptions.allowRealDraft !== true) {
        return {
          draftId: draft.id,
          platform: "wechat",
          status: "queued",
          artifactPath,
          message: "Planned WeChat draft flow is queued. Real official draft creation requires allowRealDraft=true.",
          verificationSignal: "state/published.json and official draft media_id required",
          plannedCommands
        };
      }

      const gate = await checkWechatDraftGate(config, { allowRealDraft: true, fetchImpl });
      if (!gate.ok) {
        return {
          draftId: draft.id,
          platform: "wechat",
          status: "failed",
          artifactPath,
          message: gate.message,
          verificationSignal: "WeChat credentials, IP whitelist, token, and cover media id must be ready.",
          plannedCommands
        };
      }

      const token = await requestWechatAccessTokenRaw(config.appId, config.appSecret ?? "", fetchImpl);
      if (!token.token) {
        return {
          draftId: draft.id,
          platform: "wechat",
          status: "failed",
          artifactPath,
          message: `WeChat token request failed before draft creation: ${token.publicResult.errmsg ?? token.publicResult.errcode ?? token.publicResult.status}.`,
          verificationSignal: "Official token response must include access_token.",
          plannedCommands
        };
      }

      const created = await requestWechatDraftAdd(token.token, draft, config.coverMediaId ?? "", fetchImpl);
      if (!created.ok) {
        return {
          draftId: draft.id,
          platform: "wechat",
          status: "failed",
          artifactPath,
          message: `WeChat draft creation failed: ${created.errmsg ?? created.errcode ?? created.status}.`,
          verificationSignal: "Official draft/add response must include media_id.",
          plannedCommands
        };
      }

      return {
        draftId: draft.id,
        platform: "wechat",
        status: "success",
        externalId: created.mediaId,
        artifactPath,
        message: "Official WeChat draft created successfully.",
        verificationSignal: "Official draft/add response returned media_id.",
        plannedCommands
      };
    },
    async readLastResult(): Promise<PublishResult | undefined> {
      return undefined;
    }
  };
}
