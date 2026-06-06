import type { SourceItem, VerifiedArticle, Verifier } from "../../core/src/types.js";

function methodFor(item: SourceItem): VerifiedArticle["method"] {
  if (item.collectorAdapter === "aihot") return "aihot";
  if (item.collectorAdapter === "browseract") return "browseract";
  if (item.collectorAdapter === "mediacrawler") return "mediacrawler";
  if (item.collectorAdapter === "manual") return "manual";
  return "rss";
}

export function createDefaultVerifier(): Verifier {
  async function verify(item: SourceItem): Promise<VerifiedArticle> {
    if (item.rawText && item.rawText.trim().length > 0 && !item.url.startsWith("http://") && !item.url.startsWith("https://")) {
      return {
        sourceItemId: item.id,
        status: item.url === "about:blank" ? "partial" : "verified",
        method: methodFor(item),
        evidenceUrl: item.url,
        fullText: item.rawText
      };
    }

    if (item.url.startsWith("http://") || item.url.startsWith("https://")) {
      return {
        sourceItemId: item.id,
        status: "partial",
        method: methodFor(item),
        evidenceUrl: item.url,
        fullText: item.rawText ?? item.summary,
        failureReason: "Original text acquisition requires BrowserAct or MediaCrawler."
      };
    }

    return {
      sourceItemId: item.id,
      status: item.collectorAdapter === "browseract" || item.collectorAdapter === "mediacrawler" ? "pending" : "partial",
      method: methodFor(item),
      evidenceUrl: item.url,
      fullText: item.rawText ?? item.summary,
      failureReason: item.metadata?.reason
        ? String(item.metadata.reason)
        : "No fetchable URL or raw text available yet."
    };
  }

  async function fetchFullText(item: SourceItem): Promise<VerifiedArticle> {
    return verify(item);
  }

  return {
    verify,
    async fetchFullText(item: SourceItem): Promise<VerifiedArticle> {
      return fetchFullText(item);
    },
    async recordEvidence(): Promise<void> {
      return;
    }
  };
}
