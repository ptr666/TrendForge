import type { PlannedCommand, PlatformDraft, PublisherAdapter, PublishResult } from "../../core/src/types.js";

function wechatCommands(draft: PlatformDraft): PlannedCommand[] {
  return [
    {
      name: "wechat-preview",
      command: ["npm", "run", "preview", "--", "--draft-id", draft.id],
      reason: "Render the WeChat article preview before official API draft creation.",
      successSignal: "output/article-final.html exists"
    },
    {
      name: "wechat-check",
      command: ["npm", "run", "check", "--", "--draft-id", draft.id],
      reason: "Check credentials, IP whitelist, article fields, and cover readiness.",
      successSignal: "workflow check passes"
    },
    {
      name: "wechat-create-draft",
      command: ["node", "wechat-final.js", "--draft-id", draft.id],
      reason: "Create an official-account draft only after explicit realDraft approval.",
      requiresExplicitApproval: true,
      successSignal: "state/published.json contains the created draft id"
    }
  ];
}

function xhsCommands(draft: PlatformDraft): PlannedCommand[] {
  return [
    {
      name: "xhs-check-login",
      command: ["uv", "run", "python", "scripts/cli.py", "check-login"],
      reason: "Confirm Hermes bridge, Chrome extension, and Xiaohongshu login state.",
      successSignal: "check-login reports authenticated browser state"
    },
    {
      name: "xhs-fill-publish",
      command: ["uv", "run", "python", "scripts/cli.py", "fill-publish", "--draft-id", draft.id],
      reason: "Fill title, body, tags, and image assets into the browser publish page.",
      successSignal: "page visibly contains title, body, and uploaded images"
    },
    {
      name: "xhs-save-draft",
      command: ["uv", "run", "python", "scripts/cli.py", "save-draft"],
      reason: "Save the browser page into the Xiaohongshu draft box after explicit realDraft approval.",
      requiresExplicitApproval: true,
      successSignal: "browser page shows the draft-saved signal"
    }
  ];
}

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

  async publishDraft(draft: PlatformDraft, options: { allowRealDraft?: boolean } = {}): Promise<PublishResult> {
    const plannedCommands = this.platform === "wechat" ? wechatCommands(draft) : xhsCommands(draft);
    if (options.allowRealDraft === true) {
      return {
        draftId: draft.id,
        platform: this.platform,
        status: "failed",
        message: this.platform === "wechat"
          ? "Real WeChat draft creation blocked: workflow health gate requires credentials and IP whitelist readiness."
          : "Real XHS draft save blocked: workflow health gate requires Hermes bridge, extension, and login readiness.",
        verificationSignal: this.platform === "wechat" ? "state/published.json and output/article-final.html required" : "browser page draft-saved signal required",
        plannedCommands
      };
    }

    const message = this.platform === "wechat"
      ? "Planned WeChat draft flow: generate article brief/Markdown, npm run preview, npm run check, then create a draft only after explicit realDraft approval."
      : "Planned XHS draft flow: check-login, fill-publish, verify visible page content, then save-draft only after explicit realDraft approval.";
    return {
      draftId: draft.id,
      platform: this.platform,
      status: "queued",
      message,
      verificationSignal: this.platform === "wechat" ? "state/published.json and output/article-final.html required" : "browser page draft-saved signal required",
      plannedCommands
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
