import { mediaCrawlerDefaults } from "../../../packages/config/src/index.js";
import {
  readImageModelConfig,
  readModelConfig,
  readWechatConfig,
  readXhsConfig
} from "../../../packages/config/src/local-config.js";
import { createPlannedPublishers } from "../../../packages/publishers/src/index.js";
import { createWechatOfficialPublisher } from "../../../packages/publishers/src/wechat.js";
import { createXhsBrowserPublisher } from "../../../packages/publishers/src/xhs.js";
import { createRuntimeProviders } from "../../../packages/providers/src/runtime.js";

function maskSecret(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.length <= 4 ? "****" : `${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

export async function createRuntimePublishers() {
  const planned = createPlannedPublishers();
  const wechatConfig = await readWechatConfig();
  const xhsConfig = await readXhsConfig();
  return planned.map((publisher) => publisher.platform === "wechat"
    ? createWechatOfficialPublisher(wechatConfig)
    : publisher.platform === "xhs" ? createXhsBrowserPublisher(xhsConfig)
    : publisher);
}

export async function createPipelineDeps() {
  return createRuntimeProviders(process.env, await readModelConfig(), await readImageModelConfig());
}

export function providerState() {
  const envKeyConfigured = Boolean(process.env.TRENDFORGE_MODEL_API_KEY);
  return {
    browserAct: {
      enabled: process.env.TRENDFORGE_ENABLE_BROWSERACT === "1",
      command: process.env.TRENDFORGE_BROWSERACT_COMMAND || "browser-act"
    },
    text: {
      provider: process.env.TRENDFORGE_TEXT_PROVIDER ?? "deterministic",
      baseUrl: process.env.TRENDFORGE_MODEL_BASE_URL ?? "https://api.openai.com/v1",
      model: process.env.TRENDFORGE_MODEL_NAME ?? "gpt-4.1-mini",
      keyConfigured: envKeyConfigured,
      keyPreview: maskSecret(process.env.TRENDFORGE_MODEL_API_KEY)
    },
    mediaCrawler: mediaCrawlerDefaults
  };
}
