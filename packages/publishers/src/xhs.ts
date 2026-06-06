import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PlatformDraft, PlannedCommand, PublishResult } from "../../core/src/types.js";
import type { XhsConfig } from "../../config/src/local-config.js";

export interface XhsCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type XhsCommandRunner = (command: string, args: string[], options: { cwd: string }) => Promise<XhsCommandResult>;

export interface XhsDraftGate {
  ok: boolean;
  status: "dry-run" | "blocked" | "ready";
  message: string;
  projectDir: string;
  bridgeUrl: string;
}

function xhsCommands(draft: PlatformDraft, bridgeUrl = "ws://localhost:9343"): PlannedCommand[] {
  return [
    {
      name: "xhs-check-login",
      command: ["uv", "run", "python", "scripts/cli.py", "check-login", "--bridge-url", bridgeUrl],
      reason: "Confirm Hermes bridge, Chrome extension, and Xiaohongshu login state.",
      successSignal: "check-login reports authenticated browser state"
    },
    {
      name: "xhs-fill-publish",
      command: ["uv", "run", "python", "scripts/cli.py", "fill-publish", "--draft-id", draft.id, "--bridge-url", bridgeUrl],
      reason: "Fill title, body, tags, and image assets into the browser publish page.",
      successSignal: "page visibly contains title, body, and uploaded images"
    },
    {
      name: "xhs-save-draft",
      command: ["uv", "run", "python", "scripts/cli.py", "save-draft", "--bridge-url", bridgeUrl],
      reason: "Save the browser page into the Xiaohongshu draft box after explicit realDraft approval.",
      requiresExplicitApproval: true,
      successSignal: "browser page shows the draft-saved signal"
    }
  ];
}

async function defaultCommandRunner(): Promise<XhsCommandResult> {
  return {
    exitCode: 1,
    stdout: "",
    stderr: "No XHS command runner configured for real browser draft save."
  };
}

async function writeXhsHandoff(
  draft: PlatformDraft,
  config: XhsConfig,
  plannedCommands: PlannedCommand[],
  handoffDir?: string
): Promise<string | undefined> {
  if (!handoffDir) return undefined;
  await mkdir(handoffDir, { recursive: true });
  const artifactPath = path.join(handoffDir, `xhs-${draft.id}.json`);
  await writeFile(artifactPath, JSON.stringify({
    workflow: "xhs-browser-draft-setup",
    platform: "xhs",
    projectDir: config.projectDir,
    bridgeUrl: config.bridgeUrl,
    draft,
    plannedCommands,
    verificationSignal: "browser page draft-saved signal required"
  }, null, 2), "utf8");
  return artifactPath;
}

function hasDraftSavedSignal(output: string): boolean {
  return /draft-saved|saved draft|save-draft.*success|草稿.*保存|草稿箱|已保存/i.test(output);
}

async function pathExists(targetPath: string, existsImpl?: (targetPath: string) => Promise<boolean>): Promise<boolean> {
  if (existsImpl) return existsImpl(targetPath);
  try {
    const fs = await import("node:fs/promises");
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function checkXhsDraftGate(
  config: XhsConfig,
  options: {
    allowRealDraft?: boolean;
    existsImpl?: (targetPath: string) => Promise<boolean>;
  } = {}
): Promise<XhsDraftGate> {
  const projectDir = path.resolve(config.projectDir);
  const bridgeUrl = config.bridgeUrl || "ws://localhost:9343";

  if (options.allowRealDraft !== true) {
    return {
      ok: true,
      status: "dry-run",
      message: "Dry-run XHS browser handoff is queued. Set allowRealDraft=true to check real browser draft gates.",
      projectDir,
      bridgeUrl
    };
  }
  if (!config.enabled) {
    return {
      ok: false,
      status: "blocked",
      message: "Real XHS draft save requires XHS config enabled=true.",
      projectDir,
      bridgeUrl
    };
  }
  if (!await pathExists(projectDir, options.existsImpl)) {
    return {
      ok: false,
      status: "blocked",
      message: `XHS project directory is missing: ${projectDir}. Install xiaohongshu-skills and configure projectDir.`,
      projectDir,
      bridgeUrl
    };
  }
  if (!await pathExists(path.join(projectDir, "scripts", "cli.py"), options.existsImpl)) {
    return {
      ok: false,
      status: "blocked",
      message: "XHS CLI is missing: scripts/cli.py is required.",
      projectDir,
      bridgeUrl
    };
  }

  return {
    ok: true,
    status: "ready",
    message: "XHS project and CLI are present. Real save still requires bridge, extension, login, fill-publish, and page-level draft-saved signal.",
    projectDir,
    bridgeUrl
  };
}

export function createXhsBrowserPublisher(
  config: XhsConfig,
  options: {
    runCommand?: XhsCommandRunner;
    existsImpl?: (targetPath: string) => Promise<boolean>;
  } = {}
) {
  const runCommand = options.runCommand ?? defaultCommandRunner;

  return {
    platform: "xhs" as const,
    async healthcheck() {
      const gate = await checkXhsDraftGate(config, { allowRealDraft: true, existsImpl: options.existsImpl });
      return { ok: gate.ok, message: gate.message, gate };
    },
    async preview(draft: PlatformDraft) {
      return {
        ok: true,
        message: `XHS draft ${draft.id} can be checked through check-login, fill-publish, then save-draft.`
      };
    },
    async publishDraft(
      draft: PlatformDraft,
      publishOptions: { allowRealDraft?: boolean; handoffDir?: string } = {}
    ): Promise<PublishResult> {
      const plannedCommands = xhsCommands(draft, config.bridgeUrl);
      const artifactPath = await writeXhsHandoff(draft, config, plannedCommands, publishOptions.handoffDir);

      if (publishOptions.allowRealDraft !== true) {
        return {
          draftId: draft.id,
          platform: "xhs",
          status: "queued",
          artifactPath,
          message: "Planned XHS browser draft flow is queued. Real save requires allowRealDraft=true and browser health gates.",
          verificationSignal: "browser page draft-saved signal required",
          plannedCommands
        };
      }

      const gate = await checkXhsDraftGate(config, { allowRealDraft: true, existsImpl: options.existsImpl });
      if (!gate.ok) {
        return {
          draftId: draft.id,
          platform: "xhs",
          status: "failed",
          artifactPath,
          message: gate.message,
          verificationSignal: "Hermes bridge, Chrome extension, login, fill-publish, and page-level save signal are required.",
          plannedCommands
        };
      }

      const cwd = path.resolve(config.projectDir);
      const commandRuns = [
        await runCommand("uv", ["run", "python", "scripts/cli.py", "check-login", "--bridge-url", config.bridgeUrl], { cwd }),
        await runCommand("uv", ["run", "python", "scripts/cli.py", "fill-publish", "--draft-id", draft.id, "--bridge-url", config.bridgeUrl], { cwd }),
        await runCommand("uv", ["run", "python", "scripts/cli.py", "save-draft", "--bridge-url", config.bridgeUrl], { cwd })
      ];
      const failed = commandRuns.find((result) => result.exitCode !== 0);
      if (failed) {
        return {
          draftId: draft.id,
          platform: "xhs",
          status: "failed",
          artifactPath,
          message: `XHS browser command failed: ${(failed.stderr || failed.stdout || "unknown error").trim()}`,
          verificationSignal: "All check-login, fill-publish, and save-draft commands must complete before page verification.",
          plannedCommands
        };
      }

      const saveOutput = `${commandRuns[2]?.stdout ?? ""}\n${commandRuns[2]?.stderr ?? ""}`;
      if (!hasDraftSavedSignal(saveOutput)) {
        return {
          draftId: draft.id,
          platform: "xhs",
          status: "failed",
          artifactPath,
          message: "XHS save-draft command finished, but no page-level draft-saved signal was observed.",
          verificationSignal: "browser page shows the draft-saved signal",
          plannedCommands
        };
      }

      return {
        draftId: draft.id,
        platform: "xhs",
        status: "success",
        artifactPath,
        message: "XHS browser draft saved successfully with page-level saved signal.",
        verificationSignal: "browser page shows the draft-saved signal",
        plannedCommands
      };
    },
    async readLastResult(): Promise<PublishResult | undefined> {
      return undefined;
    }
  };
}
