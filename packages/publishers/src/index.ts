import type { PlatformDraft, PublisherAdapter, PublishResult } from "../../core/src/types.js";

class PlannedPublisher implements PublisherAdapter {
  constructor(public readonly platform: "wechat" | "xhs") {}

  async healthcheck() {
    return { ok: true, message: `${this.platform} publisher adapter ready in dry-run mode.` };
  }

  async preview(draft: PlatformDraft) {
    if (this.platform === "wechat") {
      return {
        ok: true,
        message: `Planned command: cd workflows/wechat-official && npm run preview for ${draft.id}.`
      };
    }
    return {
      ok: true,
      message: `Planned browser draft preview for ${draft.id}; verify bridge and page state first.`
    };
  }

  async publishDraft(draft: PlatformDraft): Promise<PublishResult> {
    const message = this.platform === "wechat"
      ? "Dry-run only. Planned WeChat flow: generate article brief/Markdown, npm run preview, npm run check, then explicit npm run publish."
      : "Dry-run only. Planned XHS flow: check-login, fill-publish, verify visible page content, then save-draft.";
    return {
      draftId: draft.id,
      platform: this.platform,
      status: "skipped",
      message,
      verificationSignal: this.platform === "wechat" ? "preview/check required" : "page draft signal required"
    };
  }

  async readLastResult(): Promise<PublishResult | undefined> {
    return undefined;
  }
}

export function createNoopPublishers(): PublisherAdapter[] {
  return [new PlannedPublisher("wechat"), new PlannedPublisher("xhs")];
}
