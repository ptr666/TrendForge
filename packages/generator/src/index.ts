import type { ArticleSummary, CandidateSelection, DraftGenerator, PlatformDraft, VerifiedArticle } from "../../core/src/types.js";

function bulletList(points: string[]): string {
  return points.length > 0 ? points.map((point) => `- ${point}`).join("\n") : "- 暂无关键点。";
}

function sourceExcerpt(article: VerifiedArticle): string {
  const text = article.fullText ?? article.failureReason ?? "暂无可用原文。";
  return text.trim().slice(0, 1600);
}

function translatedOriginal(summary: ArticleSummary, article: VerifiedArticle): string {
  return summary.translatedOriginal?.trim() || `未生成中文译文。当前原文状态：${article.status}，获取方式：${article.method}。`;
}

function baseDraft(platform: PlatformDraft["platform"], selection: CandidateSelection, article: VerifiedArticle, summary: ArticleSummary): PlatformDraft {
  const title = platform === "review" ? `TrendForge 评审稿：${summary.title}` : summary.title;
  const keyPoints = bulletList(summary.keyPoints);
  const risks = summary.riskNotes.length > 0 ? bulletList(summary.riskNotes) : "- 暂无明确风险。";

  const body = platform === "xhs"
    ? [
      `# ${summary.title}`,
      "",
      summary.summary,
      "",
      "## 值得关注",
      summary.angle,
      "",
      "## 关键信息",
      keyPoints,
      "",
      "## 可用标签",
      "#AI热点 #趋势观察 #内容工作流",
      "",
      "## 图片需求",
      "未配置图片生成模型时不自动申请图片生成。若需要配图，请单独配置图片模型后再生成平台资产。"
    ].join("\n")
    : platform === "wechat"
      ? [
        `# ${summary.title}`,
        "",
        "## 开头摘要",
        summary.summary,
        "",
        "## 为什么值得关注",
        summary.angle,
        "",
        "## 关键信息",
        keyPoints,
        "",
        "## 原文中文译文",
        translatedOriginal(summary, article),
        "",
        "## 风险与待核查",
        risks,
        "",
        `> 选材理由：${selection.reason}`
      ].join("\n")
      : [
        `# ${title}`,
        "",
        "## 选题评分",
        `${selection.score} / 100`,
        "",
        "## 入选理由",
        selection.reason,
        "",
        "## 内容角度",
        summary.angle,
        "",
        "## 中文总结",
        summary.summary,
        "",
        "## 原文中文译文",
        translatedOriginal(summary, article),
        "",
        "## 关键信息",
        keyPoints,
        "",
        "## 风险与待核查",
        risks,
        "",
        "## 原文摘录",
        sourceExcerpt(article)
      ].join("\n");

  return {
    id: `${platform}-${selection.sourceItemId}`,
    sourceItemId: selection.sourceItemId,
    platform,
    title,
    body,
    digest: summary.summary,
    tone: platform === "xhs" ? "short_social" : platform === "wechat" ? "longform" : "review",
    metadata: {
      summary,
      translatedOriginal: summary.translatedOriginal,
      articleStatus: article.status,
      evidenceUrl: article.evidenceUrl,
      riskNotes: summary.riskNotes,
      imagePolicy: "图片生成模型未单独配置时，不自动申请图片生成。"
    }
  };
}

export function createDefaultDraftGenerator(): DraftGenerator {
  return {
    async generateReviewDraft(selection: CandidateSelection, article: VerifiedArticle, summary: ArticleSummary) {
      return baseDraft("review", selection, article, summary);
    },
    async generateWechatDraft(selection: CandidateSelection, article: VerifiedArticle, summary: ArticleSummary) {
      return baseDraft("wechat", selection, article, summary);
    },
    async generateXhsDraft(selection: CandidateSelection, article: VerifiedArticle, summary: ArticleSummary) {
      return baseDraft("xhs", selection, article, summary);
    }
  };
}
