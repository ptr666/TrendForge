import { createDefaultPipeline } from "../../../packages/core/src/pipeline.js";
import { createRunStore } from "../../../packages/storage/src/run-store.js";
import type { Platform } from "../../../packages/core/src/types.js";

const command = process.argv[2] ?? "help";

function printHelp(): void {
  console.log(`TrendForge CLI

Commands:
  trendforge collect
  trendforge verify
  trendforge generate
  trendforge preview
  trendforge publish
  trendforge run
`);
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function readOption(name: string): string | undefined {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readPlatforms(): Platform[] {
  const value = readOption("--platforms");
  if (!value) return ["review", "wechat", "xhs"];
  const platforms = value.split(",").filter((platform): platform is Platform => {
    return ["review", "wechat", "xhs"].includes(platform);
  });
  return platforms.length > 0 ? platforms : ["review"];
}

function readQuery(): string {
  return readOption("--query") ?? (process.argv.slice(3).filter((arg) => !arg.startsWith("--")).join(" ") || "manual-run");
}

async function main(): Promise<void> {
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  const store = createRunStore();
  const pipeline = createDefaultPipeline({ store });

  if (["collect", "verify", "generate", "preview", "publish", "run"].includes(command)) {
    const result = await pipeline.run({
      runId: `run-${Date.now()}`,
      query: readQuery(),
      requestedPlatforms: readPlatforms(),
      allowBrowserFallback: !hasFlag("--no-browser-fallback"),
      allowMediaCrawlerFallback: hasFlag("--allow-mediacrawler"),
      dryRunPublish: !hasFlag("--real-publish")
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Command "${command}" is planned but not implemented yet.`);
  console.log("Use `trendforge run` to exercise the local skeleton pipeline.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
