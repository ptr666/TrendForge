import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);
const cliPath = path.resolve("dist", "apps", "cli", "src", "index.js");
const rssFixturePath = path.resolve("tests", "fixtures", "rss", "ai-workflow.xml");
const aiHotFixturePath = path.resolve("tests", "fixtures", "aihot", "aihot-skill.json");

async function runCli(args: string[], runsDir: string): Promise<unknown> {
  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
    env: { ...process.env, TRENDFORGE_RUNS_DIR: runsDir },
    maxBuffer: 1024 * 1024
  });
  return JSON.parse(stdout) as unknown;
}

async function runCliWithEnv(args: string[], runsDir: string, env: NodeJS.ProcessEnv): Promise<unknown> {
  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
    env: { ...process.env, ...env, TRENDFORGE_RUNS_DIR: runsDir },
    maxBuffer: 1024 * 1024
  });
  return JSON.parse(stdout) as unknown;
}

test("CLI can run RSS pipeline and read back run history events", async () => {
  const runsDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-cli-runs-"));

  try {
    const run = await runCli(["run", "--run-id", "cli-rss-e2e", "--query-file", rssFixturePath], runsDir) as {
      runId?: string;
      drafts?: Array<{ platform: string }>;
      publishResults?: Array<{ platform: string; status: string; artifactPath?: string }>;
    };
    const runs = await runCli(["runs"], runsDir) as { runs?: Array<{ runId: string }> };
    const events = await runCli(["events", "--run-id", "cli-rss-e2e"], runsDir) as {
      events?: Array<Record<string, unknown>>;
    };

    assert.equal(run.runId, "cli-rss-e2e");
    assert.deepEqual(run.drafts?.map((draft) => draft.platform).sort(), ["review", "wechat", "xhs"]);
    assert.ok(run.publishResults?.some((publishResult) => publishResult.platform === "wechat" && publishResult.status === "queued"));
    assert.ok(run.publishResults?.some((publishResult) => publishResult.platform === "xhs" && publishResult.status === "queued"));
    assert.ok(run.publishResults?.some((publishResult) => publishResult.platform === "wechat" && typeof publishResult.artifactPath === "string"));
    assert.ok(run.publishResults?.some((publishResult) => publishResult.platform === "xhs" && typeof publishResult.artifactPath === "string"));
    assert.equal(runs.runs?.[0]?.runId, "cli-rss-e2e");
    assert.ok(events.events?.some((event) => event.stage === "fetch_full_text" && event.adapter === "browseract" && typeof event.artifactPath === "string"));
    assert.ok(events.events?.some((event) => event.stage === "finished" && event.status === "success"));
  } finally {
    await rm(runsDir, { recursive: true, force: true });
  }
});

test("CLI can run AIHot fixture pipeline and read back run history events", async () => {
  const runsDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-cli-aihot-runs-"));

  try {
    const run = await runCli(["run", "--run-id", "cli-aihot-e2e", "--query-file", aiHotFixturePath], runsDir) as {
      runId?: string;
      sourceItems?: Array<{ collectorAdapter: string }>;
      drafts?: Array<{ platform: string }>;
      publishResults?: Array<{ platform: string; status: string; artifactPath?: string }>;
    };
    const events = await runCli(["events", "--run-id", "cli-aihot-e2e"], runsDir) as {
      events?: Array<Record<string, unknown>>;
    };

    assert.equal(run.runId, "cli-aihot-e2e");
    assert.equal(run.sourceItems?.[0]?.collectorAdapter, "aihot");
    assert.deepEqual(run.drafts?.map((draft) => draft.platform).sort(), ["review", "wechat", "xhs"]);
    assert.ok(run.publishResults?.some((publishResult) => publishResult.platform === "wechat" && publishResult.status === "queued"));
    assert.ok(run.publishResults?.some((publishResult) => publishResult.platform === "xhs" && publishResult.status === "queued"));
    assert.ok(run.publishResults?.some((publishResult) => publishResult.platform === "wechat" && typeof publishResult.artifactPath === "string"));
    assert.ok(run.publishResults?.some((publishResult) => publishResult.platform === "xhs" && typeof publishResult.artifactPath === "string"));
    assert.ok(events.events?.some((event) => event.stage === "collect" && event.adapter === "aihot"));
    assert.ok(events.events?.some((event) => event.stage === "fetch_full_text" && event.adapter === "browseract" && typeof event.artifactPath === "string"));
    assert.ok(events.events?.some((event) => event.stage === "finished" && event.status === "success"));
  } finally {
    await rm(runsDir, { recursive: true, force: true });
  }
});

test("CLI defaults to AIHot skill URL when no query is provided", async () => {
  const runsDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-cli-default-aihot-"));

  try {
    const run = await runCliWithEnv(["run", "--run-id", "cli-default-aihot", "--top-n", "1"], runsDir, {
      TRENDFORGE_AIHOT_FIXTURE: JSON.stringify({
        items: [{
          title: "默认 AIHot 信号",
          url: "about:blank",
          summary: "默认运行应该优先使用 AIHot skill。",
          tags: ["fixture"]
        }]
      })
    }) as {
      sourceItems?: Array<{ collectorAdapter: string; title: string }>;
      drafts?: Array<{ platform: string; body: string }>;
    };

    assert.equal(run.sourceItems?.[0]?.collectorAdapter, "aihot");
    assert.equal(run.sourceItems?.[0]?.title, "默认 AIHot 信号");
    assert.ok(run.drafts?.some((draft) => draft.platform === "wechat" && draft.body.includes("## 为什么值得关注")));
  } finally {
    await rm(runsDir, { recursive: true, force: true });
  }
});
