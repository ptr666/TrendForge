import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PipelineRunResult, RunStore } from "../../core/src/types.js";

export interface RunStoreOptions {
  rootDir?: string;
}

export function createRunStore(options: RunStoreOptions = {}): RunStore {
  const rootDir = options.rootDir ?? process.env.TRENDFORGE_RUNS_DIR ?? path.resolve("workspace", "runs");

  return {
    async saveRun(result: PipelineRunResult): Promise<void> {
      await mkdir(rootDir, { recursive: true });
      await writeFile(path.join(rootDir, `${result.runId}.json`), JSON.stringify(result, null, 2), "utf8");
    },
    async appendEvent(runId: string, event: Record<string, unknown>): Promise<void> {
      await mkdir(rootDir, { recursive: true });
      const line = JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n";
      await writeFile(path.join(rootDir, `${runId}.events.jsonl`), line, { encoding: "utf8", flag: "a" });
    },
    async readRun(runId: string): Promise<PipelineRunResult | undefined> {
      try {
        const content = await readFile(path.join(rootDir, `${runId}.json`), "utf8");
        return JSON.parse(content) as PipelineRunResult;
      } catch {
        return undefined;
      }
    },
    async readEvents(runId: string): Promise<Array<Record<string, unknown>>> {
      try {
        const content = await readFile(path.join(rootDir, `${runId}.events.jsonl`), "utf8");
        return content
          .split("\n")
          .filter((line) => line.trim().length > 0)
          .map((line) => JSON.parse(line) as Record<string, unknown>);
      } catch {
        return [];
      }
    },
    async listRuns(): Promise<Array<{ runId: string; path: string; updatedAt: string }>> {
      await mkdir(rootDir, { recursive: true });
      const files = await readdir(rootDir);
      const jsonFiles = files.filter((file) => file.endsWith(".json") && !file.endsWith(".events.json"));
      const entries = [];
      for (const file of jsonFiles) {
        const fullPath = path.join(rootDir, file);
        const info = await stat(fullPath);
        entries.push({
          runId: file.replace(/\.json$/, ""),
          path: fullPath,
          updatedAt: info.mtime.toISOString()
        });
      }
      return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
  };
}
