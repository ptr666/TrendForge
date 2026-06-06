import type { CandidateSelection, Selector, VerifiedArticle } from "../../core/src/types.js";

export function createDefaultSelector(): Selector {
  return {
    async score(article: VerifiedArticle): Promise<CandidateSelection> {
      const verifiedBonus = article.status === "verified" ? 30 : article.status === "partial" ? 10 : 0;
      const textBonus = Math.min(20, Math.floor((article.fullText?.length ?? 0) / 500));
      const aiHotBonus = article.method === "aihot" ? 15 : 0;
      const penalty = article.status === "failed" ? 50 : 0;
      return {
        sourceItemId: article.sourceItemId,
        score: Math.max(0, 50 + verifiedBonus + textBonus + aiHotBonus - penalty),
        reason: article.status === "verified"
          ? article.method === "aihot"
            ? "AI HOT source item with usable trend signal."
            : "Verified source item with usable text."
          : article.status === "partial"
            ? "Partial source item kept for review."
            : "Failed item retained only for traceability.",
        targetPlatforms: ["review", "wechat", "xhs"],
        angle: article.method === "aihot" ? "这是优先级最高的 AIHot 热点信号，适合先进入内容选题池。" : undefined,
        tags: [article.method, article.status]
      };
    },
    selectTopN(selections: CandidateSelection[], limit: number): CandidateSelection[] {
      return [...selections].sort((a, b) => b.score - a.score).slice(0, limit);
    }
  };
}
