import type { CandidateSelection, DraftGenerator, PlatformDraft, VerifiedArticle } from "../../core/src/types.js";

function baseDraft(platform: PlatformDraft["platform"], selection: CandidateSelection, article: VerifiedArticle): PlatformDraft {
  const platformLabel = platform === "wechat" ? "公众号" : platform === "xhs" ? "小红书" : "审阅";
  const title = `TrendForge ${platformLabel}草稿`;
  const sourceText = article.fullText ?? article.failureReason ?? "No full text available yet.";
  const body = platform === "xhs"
    ? `${sourceText.slice(0, 800)}\n\n#AI热点 #趋势观察 #内容工作流`
    : platform === "wechat"
      ? `# ${title}\n\n${sourceText}\n\n> 选材理由：${selection.reason}`
      : `## ${title}\n\n${sourceText}\n\nSelection score: ${selection.score}\nReason: ${selection.reason}`;
  return {
    id: `${platform}-${selection.sourceItemId}`,
    sourceItemId: selection.sourceItemId,
    platform,
    title,
    body,
    digest: selection.reason,
    tone: platform === "xhs" ? "short_social" : platform === "wechat" ? "longform" : "review"
  };
}

export function createDefaultDraftGenerator(): DraftGenerator {
  return {
    async generateReviewDraft(selection: CandidateSelection, article: VerifiedArticle) {
      return baseDraft("review", selection, article);
    },
    async generateWechatDraft(selection: CandidateSelection, article: VerifiedArticle) {
      return baseDraft("wechat", selection, article);
    },
    async generateXhsDraft(selection: CandidateSelection, article: VerifiedArticle) {
      return baseDraft("xhs", selection, article);
    }
  };
}
