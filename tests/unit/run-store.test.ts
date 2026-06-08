import { mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { createRunStore } from "../../packages/storage/src/run-store.js";
import type { PipelineRunResult } from "../../packages/core/src/types.js";

const execFileAsync = promisify(execFile);

test("run store saves, reads, and lists runs", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-runs-"));
  const store = createRunStore({ rootDir });
  const result: PipelineRunResult = {
    runId: "run-test",
    status: "success",
    startedAt: "2026-06-06T00:00:00.000Z",
    finishedAt: "2026-06-06T00:00:01.000Z",
    sourceItems: [],
    verifiedArticles: [],
    selections: [],
    summaries: [],
    drafts: [],
    assets: [],
    publishResults: [],
    reviewQueue: [],
    errors: []
  };

  await store.saveRun(result);
  await store.appendEvent("run-test", { stage: "finished" });

  assert.deepEqual(await store.readRun("run-test"), result);
  assert.deepEqual((await store.readEvents("run-test")).map((event) => event.stage), ["finished"]);
  assert.equal((await store.listRuns()).length, 1);

  await rm(rootDir, { recursive: true, force: true });
});

test("run store writes Windows-friendly JSON for Chinese text with control characters", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-runs-"));
  const store = createRunStore({ rootDir });
  const result: PipelineRunResult = {
    runId: "run-windows-json",
    status: "success",
    startedAt: "2026-06-06T00:00:00.000Z",
    finishedAt: "2026-06-06T00:00:01.000Z",
    sourceItems: [{
      id: "aihot-test",
      sourceType: "aihot",
      collectorAdapter: "aihot",
      complianceStatus: "not_required",
      title: "中文标题\u0081测试",
      url: "https://example.com",
      summary: "摘要\u0001内容"
    }],
    verifiedArticles: [],
    selections: [],
    summaries: [],
    drafts: [],
    assets: [],
    publishResults: [],
    reviewQueue: [],
    errors: []
  };

  await store.saveRun(result);
  await store.appendEvent(result.runId, { stage: "finished", message: "完成\u0081" });

  assert.equal((await store.readRun(result.runId))?.sourceItems[0]?.title, "中文标题 测试");
  assert.equal((await store.readEvents(result.runId))[0]?.message, "完成 ");

  if (process.platform === "win32") {
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Get-Content -Raw '${path.join(rootDir, "run-windows-json.json")}' | ConvertFrom-Json | Out-Null`
    ]);
  }

  await rm(rootDir, { recursive: true, force: true });
});

test("run store keeps event appends stable while polling events", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "trendforge-runs-events-"));
  const store = createRunStore({ rootDir });

  const writers = Array.from({ length: 20 }, (_, index) => store.appendEvent("run-events", {
    stage: "polling-test",
    index
  }));
  const readers = Array.from({ length: 10 }, () => store.readEvents("run-events"));

  await Promise.all([...writers, ...readers]);
  const events = await store.readEvents("run-events");

  assert.equal(events.filter((event) => event.stage === "polling-test").length, 20);

  await rm(rootDir, { recursive: true, force: true });
});
