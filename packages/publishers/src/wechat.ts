import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MediaAsset, PlatformDraft, PublishResult } from "../../core/src/types.js";
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

export interface WechatUploadResult {
  ok: boolean;
  status: number;
  mediaId?: string;
  url?: string;
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

function usableAssetPath(asset: MediaAsset): string | undefined {
  if (asset.status === "blocked") return undefined;
  if (!asset.path) return undefined;
  if (asset.source !== "generated" && asset.source !== "local") return undefined;
  return asset.path;
}

function coverAssetPath(assets: MediaAsset[] = []): string | undefined {
  return assets.find((asset) => asset.type === "cover" && usableAssetPath(asset))?.path;
}

function inlineImageAssets(assets: MediaAsset[] = []): MediaAsset[] {
  return assets.filter((asset) => asset.type === "inline_image" && usableAssetPath(asset));
}

function draftWithInlineImages(draft: PlatformDraft, assets: MediaAsset[] = []): PlatformDraft {
  const imageHtml = inlineImageAssets(assets)
    .map((asset) => `<figure><img src="${asset.path}" alt="${asset.altText ?? draft.title}" /><figcaption>${asset.altText ?? ""}</figcaption></figure>`)
    .join("\n");
  if (!imageHtml) return draft;
  return {
    ...draft,
    body: `${draft.body}\n\n${imageHtml}`
  };
}

function detectMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

async function fileFromPath(filePath: string): Promise<{ bytes: Buffer; filename: string; mimeType: string }> {
  const resolved = path.resolve(filePath);
  return {
    bytes: await readFile(resolved),
    filename: path.basename(resolved),
    mimeType: detectMimeType(resolved)
  };
}

async function remoteFileFromUrl(url: string, fetchImpl: typeof fetch): Promise<{ bytes: Buffer; filename: string; mimeType: string }> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Remote image download failed: ${response.status} ${response.statusText}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const pathname = new URL(url).pathname;
  return {
    bytes,
    filename: path.basename(pathname) || `remote-${Date.now()}`,
    mimeType: response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream"
  };
}

async function requestWechatMediaUpload(
  accessToken: string,
  apiPath: string,
  file: { bytes: Buffer; filename: string; mimeType: string },
  fetchImpl: typeof fetch
): Promise<WechatUploadResult> {
  const url = new URL(`https://api.weixin.qq.com${apiPath}`);
  url.searchParams.set("access_token", accessToken);
  const form = new FormData();
  const bodyBytes = new Uint8Array(file.bytes);
  form.append("media", new Blob([bodyBytes.buffer], { type: file.mimeType }), file.filename);
  const response = await fetchImpl(url, { method: "POST", body: form });
  const payload = await response.json() as Record<string, unknown>;
  return {
    ok: response.ok && (typeof payload.media_id === "string" || typeof payload.url === "string"),
    status: response.status,
    mediaId: typeof payload.media_id === "string" ? payload.media_id : undefined,
    url: typeof payload.url === "string" ? payload.url : undefined,
    errcode: payload.errcode,
    errmsg: payload.errmsg
  };
}

async function uploadCoverMediaId(config: WechatConfig, accessToken: string, fetchImpl: typeof fetch, assets: MediaAsset[] = []): Promise<string | undefined> {
  const generatedCoverPath = coverAssetPath(assets);
  if (generatedCoverPath) {
    const file = await fileFromPath(generatedCoverPath);
    const uploaded = await requestWechatMediaUpload(accessToken, "/cgi-bin/material/add_material", file, fetchImpl);
    if (!uploaded.mediaId) {
      throw new Error(`WeChat generated cover upload failed: ${uploaded.errmsg ?? uploaded.errcode ?? uploaded.status}`);
    }
    return uploaded.mediaId;
  }
  if (config.coverMediaId) return config.coverMediaId;
  if (!config.coverImagePath) return undefined;
  const file = await fileFromPath(config.coverImagePath);
  const uploaded = await requestWechatMediaUpload(accessToken, "/cgi-bin/material/add_material", file, fetchImpl);
  if (!uploaded.mediaId) {
    throw new Error(`WeChat cover upload failed: ${uploaded.errmsg ?? uploaded.errcode ?? uploaded.status}`);
  }
  return uploaded.mediaId;
}

async function uploadArticleImage(accessToken: string, src: string, fetchImpl: typeof fetch): Promise<string> {
  const file = /^https?:\/\//i.test(src)
    ? await remoteFileFromUrl(src, fetchImpl)
    : await fileFromPath(src);
  const uploaded = await requestWechatMediaUpload(accessToken, "/cgi-bin/media/uploadimg", file, fetchImpl);
  if (!uploaded.url) {
    throw new Error(`WeChat article image upload failed: ${uploaded.errmsg ?? uploaded.errcode ?? uploaded.status}`);
  }
  return uploaded.url;
}

async function replaceArticleImages(accessToken: string, html: string, fetchImpl: typeof fetch): Promise<{ html: string; uploadedImages: Array<{ source: string; url: string }> }> {
  const seen = new Map<string, string>();
  const matches = [...html.matchAll(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi)];
  let nextHtml = html;
  const uploadedImages = [];
  for (const match of matches) {
    const source = match[1];
    if (!source || /^data:/i.test(source)) continue;
    let uploadedUrl = seen.get(source);
    if (!uploadedUrl) {
      uploadedUrl = await uploadArticleImage(accessToken, source, fetchImpl);
      seen.set(source, uploadedUrl);
      uploadedImages.push({ source, url: uploadedUrl });
    }
    nextHtml = nextHtml.replaceAll(`src="${source}"`, `src="${uploadedUrl}"`).replaceAll(`src='${source}'`, `src="${uploadedUrl}"`);
  }
  return { html: nextHtml, uploadedImages };
}

export async function requestWechatDraftAdd(
  accessToken: string,
  draft: PlatformDraft,
  coverMediaId: string,
  assetsOrFetch: MediaAsset[] | typeof fetch = [],
  fetchImpl: typeof fetch = fetch
): Promise<WechatDraftResult> {
  const assets = Array.isArray(assetsOrFetch) ? assetsOrFetch : [];
  const realFetchImpl = typeof assetsOrFetch === "function" ? assetsOrFetch : fetchImpl;
  const url = new URL("https://api.weixin.qq.com/cgi-bin/draft/add");
  url.searchParams.set("access_token", accessToken);
  const draftWithLocalImages = draftWithInlineImages(draft, assets);
  const articleImageResult = await replaceArticleImages(accessToken, draftWithLocalImages.body, realFetchImpl);
  const draftWithUploadedImages = { ...draftWithLocalImages, body: articleImageResult.html };

  const response = await realFetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(wechatArticleFromDraft(draftWithUploadedImages, coverMediaId))
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
  options: { allowRealDraft?: boolean; fetchImpl?: typeof fetch; assets?: MediaAsset[] } = {}
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
  if (!config.coverMediaId && !config.coverImagePath && !coverAssetPath(options.assets ?? [])) {
    return {
      ok: false,
      status: "blocked",
      message: "WeChat token check passed, but coverMediaId or coverImagePath is required before official draft creation.",
      token
    };
  }

  return {
    ok: true,
    status: "ready",
    message: `WeChat credentials, token check, and ${config.coverMediaId ? "cover media id" : "cover image upload"} are ready for official draft creation.`,
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
      publishOptions: { allowRealDraft?: boolean; handoffDir?: string; assets?: MediaAsset[] } = {}
    ): Promise<PublishResult> {
      const assets = publishOptions.assets ?? [];
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

      const gate = await checkWechatDraftGate(config, { allowRealDraft: true, fetchImpl, assets });
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

      let coverMediaId = "";
      try {
        coverMediaId = await uploadCoverMediaId(config, token.token, fetchImpl, assets) ?? "";
      } catch (error) {
        return {
          draftId: draft.id,
          platform: "wechat",
          status: "failed",
          artifactPath,
          message: error instanceof Error ? error.message : String(error),
          verificationSignal: "WeChat cover image must upload through /cgi-bin/material/add_material and return media_id.",
          plannedCommands
        };
      }

      const created = await requestWechatDraftAdd(token.token, draft, coverMediaId, assets, fetchImpl);
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
