import { createDefaultImageProvider } from "../../providers/src/index.js";
import type { ImageProvider, MediaAsset, MediaComposer, PlatformDraft } from "../../core/src/types.js";

export function createDefaultMediaComposer(imageProvider: ImageProvider = createDefaultImageProvider()): MediaComposer {
  return {
    async planAssets(draft: PlatformDraft): Promise<MediaAsset[]> {
      if (draft.platform === "wechat") {
        return [{
          id: `cover-${draft.id}`,
          draftId: draft.id,
          type: "cover",
          source: "placeholder",
          ratio: "16:9"
        }];
      }
      if (draft.platform === "xhs") {
        return [{
          id: `xhs-image-${draft.id}`,
          draftId: draft.id,
          type: "xhs_image",
          source: "placeholder",
          ratio: "3:4"
        }];
      }
      return [];
    },
    async generateAssets(assets: MediaAsset[]): Promise<MediaAsset[]> {
      return assets;
    },
    async attachAssets(draft: PlatformDraft, assets: MediaAsset[]): Promise<PlatformDraft> {
      const generated = [];
      for (const asset of assets) {
        const planned = await imageProvider.planPrompt(draft, asset);
        Object.assign(asset, planned);
        generated.push(asset);
      }
      draft.assetIds = generated.map((asset) => asset.id);
      return draft;
    }
  };
}
