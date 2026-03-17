import { getProviderKeyStatus } from "../config/env.js";
import type { Config, RedactedConfig } from "../types/entities.js";

export const DEFAULT_RUNTIME_CONFIG: Config = {
  provider: "openrouter",
  model: "openrouter/auto",
  port: 3141,
  host: "127.0.0.1",
  repoInstructionFile: "specflow/AGENTS.md"
};

export const getRuntimeConfig = (config: Config | null): Config => config ?? DEFAULT_RUNTIME_CONFIG;

export const redactConfig = (config: Config | null): RedactedConfig => {
  const rest = getRuntimeConfig(config);
  const providerKeyStatus = getProviderKeyStatus();

  return {
    ...rest,
    hasApiKey: providerKeyStatus[rest.provider],
    providerKeyStatus
  };
};
