import type { ImageProvider, MediaAsset, MediaComposer, PlatformDraft } from "../../core/src/types.js";

function slugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "item";
}

function roleForType(type: MediaAsset["type"]): MediaAsset["role"] {
  if (type === "cover") return "cover";
  if (type === "inline_image") return "inline";
  return "platform";
}

function platformStylePrompt(draft: PlatformDraft, type: MediaAsset["type"]): string {
  if (draft.platform === "wechat") {
    return type === "cover"
      ? "微信公众号横版头图：克制、专业、适合中文科技长文，强视觉中心，避免密集小字和平台水印。"
      : "微信公众号正文信息图：适合长文中段阅读，强调结构化信息、清晰层级和可读留白。";
  }
  if (draft.platform === "xhs") {
    return type === "cover"
      ? "小红书 3:4 竖版封面卡：强标题感、高识别度、信息密度适中，适合瀑布流首图。"
      : "小红书图文笔记内容卡：竖版、轻量图解、适合滑动阅读，视觉更生活化和社交化。";
  }
  return "平台预览图片。";
}

export function prepareMediaAsset(runId: string, draft: PlatformDraft, asset: MediaAsset, index: number, outputDir: string): MediaAsset {
  const revision = asset.revision ?? 1;
  const role = asset.role ?? roleForType(asset.type);
  const baseId = `tf-${slugPart(runId)}-${slugPart(draft.sourceItemId)}-${draft.platform}-${role}-${index}`;
  const id = asset.id.startsWith("tf-") ? asset.id : `${baseId}-r${revision}`;
  const filename = asset.filename ?? `${baseId}-r${revision}`;
  return {
    ...asset,
    id,
    draftId: draft.id,
    platform: draft.platform,
    role,
    index,
    revision,
    filename,
    altText: asset.altText ?? `${draft.title} ${role === "cover" ? "封面图" : "配图"}`,
    stylePrompt: asset.stylePrompt ?? platformStylePrompt(draft, asset.type),
    metadata: {
      ...(asset.metadata ?? {}),
      outputDir
    }
  };
}

export function createDefaultMediaComposer(imageProvider?: ImageProvider): MediaComposer {
  return {
    async planAssets(draft: PlatformDraft): Promise<MediaAsset[]> {
      if (!imageProvider) return [];
      if (draft.platform === "wechat") {
        return [
          {
            id: `cover-${draft.id}`,
            draftId: draft.id,
            platform: "wechat",
            type: "cover",
            role: "cover",
            index: 1,
            revision: 1,
            source: "placeholder",
            status: "planned",
            approvalRequired: true,
            ratio: "16:9"
          },
          {
            id: `inline-${draft.id}`,
            draftId: draft.id,
            platform: "wechat",
            type: "inline_image",
            role: "inline",
            index: 1,
            revision: 1,
            source: "placeholder",
            status: "planned",
            approvalRequired: true,
            ratio: "16:9"
          }
        ];
      }
      if (draft.platform === "xhs") {
        return [
          {
            id: `cover-${draft.id}`,
            draftId: draft.id,
            platform: "xhs",
            type: "cover",
            role: "cover",
            index: 1,
            revision: 1,
            source: "placeholder",
            status: "planned",
            approvalRequired: true,
            ratio: "3:4"
          },
          {
            id: `xhs-image-${draft.id}`,
            draftId: draft.id,
            platform: "xhs",
            type: "xhs_image",
            role: "platform",
            index: 1,
            revision: 1,
            source: "placeholder",
            status: "planned",
            approvalRequired: true,
            ratio: "3:4"
          }
        ];
      }
      return [];
    },
    async generateAssets(assets: MediaAsset[]): Promise<MediaAsset[]> {
      return assets;
    },
    async attachAssets(draft: PlatformDraft, assets: MediaAsset[]): Promise<PlatformDraft> {
      if (!imageProvider || assets.length === 0) {
        draft.assetIds = [];
        return draft;
      }
      const generated = [];
      for (const asset of assets) {
        try {
          const planned = await imageProvider.planPrompt(draft, asset);
          Object.assign(asset, { ...planned, status: "needs-approval", approvalRequired: true, errorMessage: undefined });
        } catch (error) {
          Object.assign(asset, {
            source: "placeholder",
            status: "blocked",
            approvalRequired: true,
            errorMessage: error instanceof Error ? error.message : String(error)
          });
        }
        generated.push(asset);
      }
      draft.assetIds = generated.map((asset) => asset.id);
      return draft;
    }
  };
}
