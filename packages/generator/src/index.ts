import type { ArticleSummary, CandidateSelection, DraftGenerator, PlatformDraft, VerifiedArticle } from "../../core/src/types.js";

function baseDraft(platform: PlatformDraft["platform"], selection: CandidateSelection, article: VerifiedArticle, summary: ArticleSummary): PlatformDraft {
  const platformLabel = platform === "wechat" ? "WeChat" : platform === "xhs" ? "XHS" : "review";
  const title = platform === "review" ? `TrendForge ${platformLabel} draft` : summary.title;
  const sourceText = article.fullText ?? article.failureReason ?? "No full text available yet.";
  const keyPoints = summary.keyPoints.map((point) => `- ${point}`).join("\n");
  const body = platform === "xhs"
    ? `${summary.summary}\n\n${summary.angle}\n\n${summary.keyPoints.join("\n")}\n\n#AI热点 #趋势观察 #内容工作流`
    : platform === "wechat"
      ? `# ${title}\n\n${summary.summary}\n\n## 为什么值得关注\n\n${summary.angle}\n\n## 关键信息\n\n${keyPoints}\n\n> 选材理由：${selection.reason}`
      : `## ${title}\n\n${summary.summary}\n\n### Angle\n\n${summary.angle}\n\n### Key points\n\n${keyPoints}\n\n### Source excerpt\n\n${sourceText.slice(0, 1000)}\n\nSelection score: ${selection.score}\nReason: ${selection.reason}`;
  return {
    id: `${platform}-${selection.sourceItemId}`,
    sourceItemId: selection.sourceItemId,
    platform,
    title,
    body,
    digest: selection.reason,
    tone: platform === "xhs" ? "short_social" : platform === "wechat" ? "longform" : "review",
    metadata: {
      summary,
      articleStatus: article.status,
      evidenceUrl: article.evidenceUrl,
      riskNotes: summary.riskNotes
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
