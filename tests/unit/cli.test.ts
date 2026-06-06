import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);
const cliPath = path.resolve("dist", "apps", "cli", "src", "index.js");
const rss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>AI workflow from CLI</title>
      <link>https://example.com/cli-ai-workflow</link>
      <description>Brief signal from a CLI RSS run.</description>
      <guid>cli-ai-workflow</guid>
    </item>
  </channel>
</rss>`;

async function runCli(args: string[], runsDir: string): Promise<unknown> {
  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
    env: { ...process.env, TRENDFORGE_RUNS_DIR: runsDir },
    maxBuffer: 1024 * 1024
  });
  return JSON.parse(stdout) as unknown;
}

test("CLI can run RSS pipeline and read back run history events", async () => {
  const runsDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-cli-runs-"));

  try {
    const run = await runCli(["run", "--run-id", "cli-rss-e2e", "--query", rss], runsDir) as {
      runId?: string;
      drafts?: Array<{ platform: string }>;
      publishResults?: Array<{ platform: string; status: string }>;
    };
    const runs = await runCli(["runs"], runsDir) as { runs?: Array<{ runId: string }> };
    const events = await runCli(["events", "--run-id", "cli-rss-e2e"], runsDir) as {
      events?: Array<Record<string, unknown>>;
    };

    assert.equal(run.runId, "cli-rss-e2e");
    assert.deepEqual(run.drafts?.map((draft) => draft.platform).sort(), ["review", "wechat", "xhs"]);
    assert.ok(run.publishResults?.some((publishResult) => publishResult.platform === "wechat" && publishResult.status === "queued"));
    assert.ok(run.publishResults?.some((publishResult) => publishResult.platform === "xhs" && publishResult.status === "queued"));
    assert.equal(runs.runs?.[0]?.runId, "cli-rss-e2e");
    assert.ok(events.events?.some((event) => event.stage === "fetch_full_text" && event.adapter === "browseract"));
    assert.ok(events.events?.some((event) => event.stage === "finished" && event.status === "success"));
  } finally {
    await rm(runsDir, { recursive: true, force: true });
  }
});
