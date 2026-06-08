import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PipelineRunResult, RunStore } from "../../core/src/types.js";

export interface RunStoreOptions {
  rootDir?: string;
}

function sanitizeJsonValue<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, " ") as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item)) as T;
  }
  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      sanitized[key] = sanitizeJsonValue(nested);
    }
    return sanitized as T;
  }
  return value;
}

export function createRunStore(options: RunStoreOptions = {}): RunStore {
  const rootDir = options.rootDir ?? process.env.TRENDFORGE_RUNS_DIR ?? path.resolve("workspace", "runs");
  const resolvedRoot = path.resolve(rootDir);

  function resolveRunPath(...segments: string[]): string {
    const resolved = path.resolve(resolvedRoot, ...segments);
    if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
      throw new Error("Run path is outside the runs directory.");
    }
    return resolved;
  }

  return {
    rootDir: resolvedRoot,
    async saveRun(result: PipelineRunResult): Promise<void> {
      await mkdir(rootDir, { recursive: true });
      await writeFile(path.join(rootDir, `${result.runId}.json`), JSON.stringify(sanitizeJsonValue(result), null, 2), "utf8");
    },
    async appendEvent(runId: string, event: Record<string, unknown>): Promise<void> {
      await mkdir(rootDir, { recursive: true });
      const line = JSON.stringify(sanitizeJsonValue({ at: new Date().toISOString(), ...event })) + "\n";
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
    },
    async deleteRun(runId: string): Promise<boolean> {
      const run = await this.readRun(runId);
      await rm(resolveRunPath(`${runId}.json`), { force: true });
      await rm(resolveRunPath(`${runId}.events.jsonl`), { force: true });
      await rm(resolveRunPath(runId), { recursive: true, force: true });
      return Boolean(run);
    },
    async clearRuns(): Promise<number> {
      const runs = await this.listRuns();
      for (const run of runs) {
        await this.deleteRun(run.runId);
      }
      return runs.length;
    }
  };
}
