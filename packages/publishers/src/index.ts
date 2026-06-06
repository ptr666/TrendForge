import type { PlatformDraft, PublisherAdapter, PublishResult } from "../../core/src/types.js";

class PlannedPublisher implements PublisherAdapter {
  constructor(public readonly platform: "wechat" | "xhs") {}

  async healthcheck() {
    const message = this.platform === "wechat"
      ? "WeChat workflow adapter ready. Real draft creation requires explicit user action, credentials, and IP whitelist."
      : "XHS workflow adapter ready. Real draft save requires explicit user action, Hermes bridge, extension, and login state.";
    return { ok: true, message };
  }

  async preview(draft: PlatformDraft) {
    if (this.platform === "wechat") {
      return {
        ok: true,
        message: `Planned WeChat preview/check for ${draft.id}: use wechat-official-account-workflow, then npm run preview and npm run check.`
      };
    }
    return {
      ok: true,
      message: `Planned browser draft preview for ${draft.id}; verify bridge and page state first.`
    };
  }

  async publishDraft(draft: PlatformDraft): Promise<PublishResult> {
    const message = this.platform === "wechat"
      ? "Planned WeChat draft flow: generate article brief/Markdown, npm run preview, npm run check, then create a draft only after explicit realDraft approval."
      : "Planned XHS draft flow: check-login, fill-publish, verify visible page content, then save-draft only after explicit realDraft approval.";
    return {
      draftId: draft.id,
      platform: this.platform,
      status: "queued",
      message,
      verificationSignal: this.platform === "wechat" ? "state/published.json and output/article-final.html required" : "browser page draft-saved signal required"
    };
  }

  async readLastResult(): Promise<PublishResult | undefined> {
    return undefined;
  }
}

export function createPlannedPublishers(): PublisherAdapter[] {
  return [new PlannedPublisher("wechat"), new PlannedPublisher("xhs")];
}

export const createNoopPublishers = createPlannedPublishers;
