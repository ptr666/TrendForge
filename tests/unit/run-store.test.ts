import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { createRunStore } from "../../packages/storage/src/run-store.js";
import type { PipelineRunResult } from "../../packages/core/src/types.js";

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
    errors: []
  };

  await store.saveRun(result);
  await store.appendEvent("run-test", { stage: "finished" });

  assert.deepEqual(await store.readRun("run-test"), result);
  assert.deepEqual((await store.readEvents("run-test")).map((event) => event.stage), ["finished"]);
  assert.equal((await store.listRuns()).length, 1);

  await rm(rootDir, { recursive: true, force: true });
});
