import type { ArticleSummary, CandidateSelection, ImageProvider, MediaAsset, PlatformDraft, TextProvider, VerifiedArticle } from "../../core/src/types.js";

function compactText(value: string, limit: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

export function createDefaultTextProvider(): TextProvider {
  return {
    async summarize(article: VerifiedArticle, selection: CandidateSelection): Promise<ArticleSummary> {
      const sourceText = compactText(article.fullText ?? article.failureReason ?? "No full text available.", 1200);
      const firstSentence = sourceText.split(/[。.!?！？]/).find((part) => part.trim().length > 0)?.trim() ?? sourceText;
      const keyPoints = sourceText
        .split(/[。.!?！？\n]/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .slice(0, 3);

      return {
        sourceItemId: article.sourceItemId,
        title: `Trend signal ${article.sourceItemId}`,
        summary: firstSentence || "No summary available.",
        angle: selection.angle ?? "AI trend with practical publishing value.",
        keyPoints: keyPoints.length > 0 ? keyPoints : [selection.reason],
        riskNotes: article.status === "verified" ? [] : [article.failureReason ?? `Article status is ${article.status}.`]
      };
    }
  };
}

export function createDefaultImageProvider(): ImageProvider {
  return {
    async planPrompt(draft: PlatformDraft, asset: MediaAsset): Promise<MediaAsset> {
      const platformLabel = draft.platform === "wechat" ? "WeChat official account" : draft.platform === "xhs" ? "Xiaohongshu" : "review";
      return {
        ...asset,
        source: "placeholder",
        prompt: `Create a ${asset.ratio ?? "platform-fit"} visual for ${platformLabel}: ${draft.title}. ${draft.digest ?? ""}`.trim()
      };
    }
  };
}
