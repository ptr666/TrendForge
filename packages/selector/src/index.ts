import type { CandidateSelection, Selector, VerifiedArticle } from "../../core/src/types.js";

export function createDefaultSelector(): Selector {
  return {
    async score(article: VerifiedArticle): Promise<CandidateSelection> {
      const verifiedBonus = article.status === "verified" ? 30 : article.status === "partial" ? 10 : 0;
      const textBonus = Math.min(20, Math.floor((article.fullText?.length ?? 0) / 500));
      const penalty = article.status === "failed" ? 50 : 0;
      return {
        sourceItemId: article.sourceItemId,
        score: Math.max(0, 50 + verifiedBonus + textBonus - penalty),
        reason: article.status === "verified"
          ? "Verified source item with usable text."
          : article.status === "partial"
            ? "Partial source item kept for review."
            : "Failed item retained only for traceability.",
        targetPlatforms: ["review", "wechat", "xhs"],
        tags: [article.method, article.status]
      };
    },
    selectTopN(selections: CandidateSelection[], limit: number): CandidateSelection[] {
      return [...selections].sort((a, b) => b.score - a.score).slice(0, limit);
    }
  };
}
