import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ModelConfig {
  enabled: boolean;
  provider: "deterministic" | "openai-compatible";
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface WechatConfig {
  enabled: boolean;
  appId: string;
  appSecret?: string;
  coverMediaId?: string;
}

export interface XhsConfig {
  enabled: boolean;
  projectDir: string;
  bridgeUrl: string;
}

export interface RssHubConfig {
  baseUrl: string;
}

export interface PublicModelConfig {
  enabled: boolean;
  provider: ModelConfig["provider"];
  baseUrl: string;
  model: string;
  keyConfigured: boolean;
  keyPreview?: string;
}

export interface PublicWechatConfig {
  enabled: boolean;
  appId: string;
  secretConfigured: boolean;
  secretPreview?: string;
  coverMediaId?: string;
}

export interface PublicXhsConfig {
  enabled: boolean;
  projectDir: string;
  bridgeUrl: string;
}

export interface PublicRssHubConfig {
  baseUrl: string;
  configured: boolean;
}

export const defaultModelConfig: ModelConfig = {
  enabled: false,
  provider: "deterministic",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash"
};

export const defaultWechatConfig: WechatConfig = {
  enabled: false,
  appId: ""
};

export const defaultXhsConfig: XhsConfig = {
  enabled: false,
  projectDir: "vendor/xiaohongshu-skills",
  bridgeUrl: "ws://localhost:9343"
};

export const defaultRssHubConfig: RssHubConfig = {
  baseUrl: "https://rsshub.app"
};

function defaultConfigDir(): string {
  return process.env.TRENDFORGE_CONFIG_DIR
    ? path.resolve(process.env.TRENDFORGE_CONFIG_DIR)
    : path.resolve("workspace", "config");
}

function maskSecret(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.length <= 4 ? "****" : `${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

function modelConfigPath(configDir = defaultConfigDir()): string {
  return path.join(configDir, "model.json");
}

function wechatConfigPath(configDir = defaultConfigDir()): string {
  return path.join(configDir, "wechat.json");
}

function xhsConfigPath(configDir = defaultConfigDir()): string {
  return path.join(configDir, "xhs.json");
}

function rssHubConfigPath(configDir = defaultConfigDir()): string {
  return path.join(configDir, "rsshub.json");
}

function normalizeModelConfig(value: unknown): ModelConfig {
  const candidate = value && typeof value === "object" ? value as Partial<ModelConfig> : {};
  const provider = candidate.provider === "openai-compatible" ? "openai-compatible" : "deterministic";
  return {
    enabled: candidate.enabled === true,
    provider,
    baseUrl: typeof candidate.baseUrl === "string" && candidate.baseUrl.trim() ? candidate.baseUrl.trim() : defaultModelConfig.baseUrl,
    model: typeof candidate.model === "string" && candidate.model.trim() ? candidate.model.trim() : defaultModelConfig.model,
    apiKey: typeof candidate.apiKey === "string" && candidate.apiKey.trim() ? candidate.apiKey.trim() : undefined
  };
}

function normalizeWechatConfig(value: unknown): WechatConfig {
  const candidate = value && typeof value === "object" ? value as Partial<WechatConfig> : {};
  return {
    enabled: candidate.enabled === true,
    appId: typeof candidate.appId === "string" ? candidate.appId.trim() : "",
    appSecret: typeof candidate.appSecret === "string" && candidate.appSecret.trim() ? candidate.appSecret.trim() : undefined,
    coverMediaId: typeof candidate.coverMediaId === "string" && candidate.coverMediaId.trim() ? candidate.coverMediaId.trim() : undefined
  };
}

function normalizeXhsConfig(value: unknown): XhsConfig {
  const candidate = value && typeof value === "object" ? value as Partial<XhsConfig> : {};
  return {
    enabled: candidate.enabled === true,
    projectDir: typeof candidate.projectDir === "string" && candidate.projectDir.trim() ? candidate.projectDir.trim() : defaultXhsConfig.projectDir,
    bridgeUrl: typeof candidate.bridgeUrl === "string" && candidate.bridgeUrl.trim() ? candidate.bridgeUrl.trim() : defaultXhsConfig.bridgeUrl
  };
}

function normalizeRssHubConfig(value: unknown): RssHubConfig {
  const candidate = value && typeof value === "object" ? value as Partial<RssHubConfig> : {};
  return {
    baseUrl: typeof candidate.baseUrl === "string" && candidate.baseUrl.trim()
      ? candidate.baseUrl.trim().replace(/\/$/, "")
      : process.env.TRENDFORGE_RSSHUB_BASE_URL?.replace(/\/$/, "") ?? defaultRssHubConfig.baseUrl
  };
}

export function toPublicModelConfig(config: ModelConfig): PublicModelConfig {
  return {
    enabled: config.enabled,
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    keyConfigured: Boolean(config.apiKey),
    keyPreview: maskSecret(config.apiKey)
  };
}

export function toPublicWechatConfig(config: WechatConfig): PublicWechatConfig {
  return {
    enabled: config.enabled,
    appId: config.appId,
    secretConfigured: Boolean(config.appSecret),
    secretPreview: maskSecret(config.appSecret),
    coverMediaId: config.coverMediaId
  };
}

export function toPublicXhsConfig(config: XhsConfig): PublicXhsConfig {
  return {
    enabled: config.enabled,
    projectDir: config.projectDir,
    bridgeUrl: config.bridgeUrl
  };
}

export function toPublicRssHubConfig(config: RssHubConfig): PublicRssHubConfig {
  return {
    baseUrl: config.baseUrl,
    configured: config.baseUrl !== defaultRssHubConfig.baseUrl || Boolean(process.env.TRENDFORGE_RSSHUB_BASE_URL)
  };
}

export async function readModelConfig(configDir?: string): Promise<ModelConfig> {
  try {
    return normalizeModelConfig(JSON.parse(await readFile(modelConfigPath(configDir), "utf8")) as unknown);
  } catch {
    return defaultModelConfig;
  }
}

export async function writeModelConfig(config: ModelConfig, configDir?: string): Promise<ModelConfig> {
  const normalized = normalizeModelConfig(config);
  // Local provider credentials are intentionally stored outside tracked source files.
  await mkdir(path.dirname(modelConfigPath(configDir)), { recursive: true });
  await writeFile(modelConfigPath(configDir), JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

export async function readWechatConfig(configDir?: string): Promise<WechatConfig> {
  try {
    return normalizeWechatConfig(JSON.parse(await readFile(wechatConfigPath(configDir), "utf8")) as unknown);
  } catch {
    return defaultWechatConfig;
  }
}

export async function writeWechatConfig(config: WechatConfig, configDir?: string): Promise<WechatConfig> {
  const normalized = normalizeWechatConfig(config);
  // Keep appSecret local; API responses only expose masked previews.
  await mkdir(path.dirname(wechatConfigPath(configDir)), { recursive: true });
  await writeFile(wechatConfigPath(configDir), JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

export async function readXhsConfig(configDir?: string): Promise<XhsConfig> {
  try {
    return normalizeXhsConfig(JSON.parse(await readFile(xhsConfigPath(configDir), "utf8")) as unknown);
  } catch {
    return defaultXhsConfig;
  }
}

export async function writeXhsConfig(config: XhsConfig, configDir?: string): Promise<XhsConfig> {
  const normalized = normalizeXhsConfig(config);
  await mkdir(path.dirname(xhsConfigPath(configDir)), { recursive: true });
  await writeFile(xhsConfigPath(configDir), JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

export async function readRssHubConfig(configDir?: string): Promise<RssHubConfig> {
  try {
    return normalizeRssHubConfig(JSON.parse(await readFile(rssHubConfigPath(configDir), "utf8")) as unknown);
  } catch {
    return normalizeRssHubConfig({});
  }
}

export async function writeRssHubConfig(config: RssHubConfig, configDir?: string): Promise<RssHubConfig> {
  const normalized = normalizeRssHubConfig(config);
  await mkdir(path.dirname(rssHubConfigPath(configDir)), { recursive: true });
  await writeFile(rssHubConfigPath(configDir), JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}
