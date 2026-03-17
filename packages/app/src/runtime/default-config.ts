import type { Config } from "../types/entities.js";

export const DEFAULT_RUNTIME_CONFIG: Config = {
  provider: "openrouter",
  model: "openrouter/auto",
  apiKey: "",
  port: 3141,
  host: "127.0.0.1",
  repoInstructionFile: "specflow/AGENTS.md"
};

export const getRuntimeConfig = (config: Config | null): Config => config ?? DEFAULT_RUNTIME_CONFIG;

export const redactConfig = (
  config: Config | null
): Omit<Config, "apiKey"> & { hasApiKey: boolean } => {
  const { apiKey, ...rest } = getRuntimeConfig(config);
  return {
    ...rest,
    hasApiKey: Boolean(apiKey)
  };
};
