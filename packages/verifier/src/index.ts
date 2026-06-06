import type { SourceItem, VerifiedArticle, Verifier } from "../../core/src/types.js";

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

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
      return fetchFullText(item);
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
    try {
      const response = await fetch(item.url);
      if (!response.ok) {
        return {
          sourceItemId: item.id,
          status: "failed",
          method: "http",
          evidenceUrl: item.url,
          failureReason: `HTTP fetch failed: ${response.status} ${response.statusText}`
        };
      }
      const html = await response.text();
      const fullText = stripHtml(html);
      return {
        sourceItemId: item.id,
        status: fullText.length > 0 ? "verified" : "partial",
        method: "http",
        evidenceUrl: item.url,
        fullText,
        failureReason: fullText.length > 0 ? undefined : "HTTP response had no extractable text."
      };
    } catch (error) {
      return {
        sourceItemId: item.id,
        status: "failed",
        method: "http",
        evidenceUrl: item.url,
        failureReason: error instanceof Error ? error.message : String(error)
      };
    }
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
