import { readFile } from "node:fs/promises";
import { createDefaultPipeline } from "../../../packages/core/src/pipeline.js";
import { createRuntimeProviders } from "../../../packages/providers/src/runtime.js";
import { createRunStore } from "../../../packages/storage/src/run-store.js";
import type { Platform } from "../../../packages/core/src/types.js";

const command = process.argv[2] ?? "help";

function printHelp(): void {
  console.log(`TrendForge CLI

Commands:
  trendforge runs
  trendforge events --run-id <id>
  trendforge sources
  trendforge publishers
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

async function readQuery(): Promise<string> {
  const queryFile = readOption("--query-file");
  if (queryFile) return readFile(queryFile, "utf8");
  return readOption("--query") ?? (process.argv.slice(3).filter((arg) => !arg.startsWith("--")).join(" ") || "manual-run");
}

function readRunId(): string {
  return readOption("--run-id") ?? `run-${Date.now()}`;
}

async function main(): Promise<void> {
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  const store = createRunStore();
  const pipeline = createDefaultPipeline({ store, ...createRuntimeProviders() });

  if (command === "runs") {
    console.log(JSON.stringify({ runs: await store.listRuns() }, null, 2));
    return;
  }

  if (command === "events") {
    const runId = readOption("--run-id");
    if (!runId) throw new Error("Missing --run-id for events.");
    console.log(JSON.stringify({ runId, events: await store.readEvents(runId) }, null, 2));
    return;
  }

  if (command === "sources") {
    const { aiHotDefaults, defaultCollectorOrder, defaultFullTextAcquisitionOrder, mediaCrawlerDefaults } = await import("../../../packages/config/src/index.js");
    const { readSubscriptions } = await import("../../../packages/config/src/subscriptions.js");
    console.log(JSON.stringify({ defaultCollectorOrder, defaultFullTextAcquisitionOrder, aiHotDefaults, mediaCrawlerDefaults, subscriptions: await readSubscriptions() }, null, 2));
    return;
  }

  if (command === "run-subscription") {
    const subscriptionId = readOption("--subscription-id");
    if (!subscriptionId) throw new Error("Missing --subscription-id for run-subscription.");
    const { readSubscriptions } = await import("../../../packages/config/src/subscriptions.js");
    const subscription = (await readSubscriptions()).find((candidate) => candidate.id === subscriptionId);
    if (!subscription) throw new Error(`Subscription not found: ${subscriptionId}`);
    if (!subscription.enabled) throw new Error(`Subscription is disabled: ${subscriptionId}`);
    const result = await pipeline.run({
      runId: readRunId(),
      query: subscription.source,
      requestedPlatforms: readPlatforms(),
      allowBrowserFallback: !hasFlag("--no-browser-fallback"),
      allowMediaCrawlerFallback: hasFlag("--allow-mediacrawler"),
      allowRealDraft: hasFlag("--real-draft"),
      dryRunPublish: !hasFlag("--real-publish")
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "publishers") {
    const { createPlannedPublishers } = await import("../../../packages/publishers/src/index.js");
    const health = [];
    for (const publisher of createPlannedPublishers()) {
      health.push({ platform: publisher.platform, ...(await publisher.healthcheck()) });
    }
    console.log(JSON.stringify({ publishers: health }, null, 2));
    return;
  }

  if (["collect", "verify", "generate", "preview", "publish", "run"].includes(command)) {
    const result = await pipeline.run({
      runId: readRunId(),
      query: await readQuery(),
      requestedPlatforms: readPlatforms(),
      allowBrowserFallback: !hasFlag("--no-browser-fallback"),
      allowMediaCrawlerFallback: hasFlag("--allow-mediacrawler"),
      allowRealDraft: hasFlag("--real-draft"),
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
