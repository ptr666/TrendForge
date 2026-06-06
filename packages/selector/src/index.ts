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
            ? "AIHot 条目具备可用热点信号。"
            : "原文已验证，具备可用内容。"
          : article.status === "partial"
            ? "AIHot/RSS 摘要可用于初筛，仍需原文验证。"
            : "获取失败，仅保留用于诊断。",
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
