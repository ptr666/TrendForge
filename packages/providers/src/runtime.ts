import type { FullTextProvider, Selector, TextProvider } from "../../core/src/types.js";
import {
  createBrowserActFullTextProvider,
  createDefaultTextProvider,
  createOpenAICompatibleSelector,
  createOpenAICompatibleTextProvider
} from "./index.js";

export interface RuntimeProviders {
  fullTextProvider?: FullTextProvider;
  textProvider: TextProvider;
  selector?: Selector;
}

export function createRuntimeProviders(env: NodeJS.ProcessEnv = process.env): RuntimeProviders {
  const fullTextProvider = env.TRENDFORGE_ENABLE_BROWSERACT === "1"
    ? createBrowserActFullTextProvider({
      command: env.TRENDFORGE_BROWSERACT_COMMAND || "browser-act"
    })
    : undefined;

  const modelOptions = {
    baseUrl: env.TRENDFORGE_MODEL_BASE_URL ?? "https://api.openai.com/v1",
    apiKey: env.TRENDFORGE_MODEL_API_KEY,
    model: env.TRENDFORGE_MODEL_NAME ?? "gpt-4.1-mini"
  };

  const textProvider = env.TRENDFORGE_TEXT_PROVIDER === "openai-compatible"
    ? createOpenAICompatibleTextProvider(modelOptions)
    : createDefaultTextProvider();

  const selector = env.TRENDFORGE_SELECTOR_PROVIDER === "openai-compatible" || env.TRENDFORGE_TEXT_PROVIDER === "openai-compatible"
    ? createOpenAICompatibleSelector(modelOptions)
    : undefined;

  return { fullTextProvider, textProvider, selector };
}
