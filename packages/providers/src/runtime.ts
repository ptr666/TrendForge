import type { FullTextProvider, Selector, TextProvider } from "../../core/src/types.js";
import type { ModelConfig } from "../../config/src/local-config.js";
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

export function createRuntimeProviders(env: NodeJS.ProcessEnv = process.env, localModelConfig?: ModelConfig): RuntimeProviders {
  const fullTextProvider = env.TRENDFORGE_ENABLE_BROWSERACT === "1"
    ? createBrowserActFullTextProvider({
      command: env.TRENDFORGE_BROWSERACT_COMMAND || "browser-act"
    })
    : undefined;

  const modelOptions = {
    baseUrl: env.TRENDFORGE_MODEL_BASE_URL ?? localModelConfig?.baseUrl ?? "https://api.openai.com/v1",
    apiKey: env.TRENDFORGE_MODEL_API_KEY ?? localModelConfig?.apiKey,
    model: env.TRENDFORGE_MODEL_NAME ?? localModelConfig?.model ?? "gpt-4.1-mini"
  };

  const useOpenAICompatible = env.TRENDFORGE_TEXT_PROVIDER === "openai-compatible"
    || localModelConfig?.enabled === true && localModelConfig.provider === "openai-compatible";

  const textProvider = useOpenAICompatible
    ? createOpenAICompatibleTextProvider(modelOptions)
    : createDefaultTextProvider();

  const selector = env.TRENDFORGE_SELECTOR_PROVIDER === "openai-compatible" || useOpenAICompatible
    ? createOpenAICompatibleSelector(modelOptions)
    : undefined;

  return { fullTextProvider, textProvider, selector };
}
