import type { FullTextProvider, MediaComposer, Selector, TextProvider } from "../../core/src/types.js";
import type { ImageModelConfig, ModelConfig } from "../../config/src/local-config.js";
import { createDefaultMediaComposer } from "../../media/src/index.js";
import {
  createBrowserActFullTextProvider,
  createDefaultTextProvider,
  createHttpFullTextProvider,
  createOpenAICompatibleImageProvider,
  createPromptOnlyImageProvider,
  createOpenAICompatibleSelector,
  createOpenAICompatibleTextProvider
} from "./index.js";

export interface RuntimeProviders {
  fullTextProvider?: FullTextProvider;
  textProvider: TextProvider;
  selector?: Selector;
  mediaComposer?: MediaComposer;
}

export function createRuntimeProviders(
  env: NodeJS.ProcessEnv = process.env,
  localModelConfig?: ModelConfig,
  localImageModelConfig?: ImageModelConfig
): RuntimeProviders {
  const browserActProvider = env.TRENDFORGE_ENABLE_BROWSERACT === "1"
    ? createBrowserActFullTextProvider({
      command: env.TRENDFORGE_BROWSERACT_COMMAND || "browser-act"
    })
    : undefined;
  const fullTextProvider = createHttpFullTextProvider({
    fallback: browserActProvider
  });

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

  const useImageProvider = env.TRENDFORGE_IMAGE_PROVIDER === "openai-compatible"
    || localImageModelConfig?.enabled === true && localImageModelConfig.provider === "openai-compatible" && Boolean(localImageModelConfig.apiKey);
  const imageProvider = useImageProvider
    ? createOpenAICompatibleImageProvider({
      baseUrl: env.TRENDFORGE_IMAGE_BASE_URL ?? localImageModelConfig?.baseUrl ?? "https://api.openai.com/v1",
      apiKey: env.TRENDFORGE_IMAGE_API_KEY ?? localImageModelConfig?.apiKey,
      model: env.TRENDFORGE_IMAGE_MODEL ?? localImageModelConfig?.model ?? "gpt-image-1"
    })
    : env.TRENDFORGE_IMAGE_PROVIDER === "prompt-only" ? createPromptOnlyImageProvider() : undefined;
  const mediaComposer = createDefaultMediaComposer(imageProvider);

  return { fullTextProvider, textProvider, selector, mediaComposer };
}
