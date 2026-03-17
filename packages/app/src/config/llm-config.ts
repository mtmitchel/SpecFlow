import type { ArtifactStore } from "../store/artifact-store.js";
import type { ProviderId } from "../types/entities.js";
import { LlmProviderError } from "../llm/errors.js";
import { resolveProviderApiKey } from "./env.js";
import {
  ProviderModelValidationError,
  ProviderRegistryError,
  validateProviderModel
} from "./provider-models.js";

export interface ResolvedLlmConfig {
  provider: ProviderId;
  model: string;
  apiKey: string;
  repoInstructionFile: string;
}

const DEFAULT_PROVIDER = "anthropic" as const;
const DEFAULT_MODEL = "claude-opus-4-5";
const DEFAULT_REPO_INSTRUCTION_FILE = "specflow/AGENTS.md";

const toResolvedConfig = (store: ArtifactStore): ResolvedLlmConfig => {
  const existing = store.config;
  if (!existing) {
    return {
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      apiKey: resolveProviderApiKey(DEFAULT_PROVIDER),
      repoInstructionFile: DEFAULT_REPO_INSTRUCTION_FILE
    };
  }

  return {
    provider: existing.provider,
    model: existing.model,
    apiKey: resolveProviderApiKey(existing.provider),
    repoInstructionFile: existing.repoInstructionFile || DEFAULT_REPO_INSTRUCTION_FILE
  };
};

export const resolveAndValidateLlmConfig = async (input: {
  store: ArtifactStore;
  fetchImpl: typeof fetch;
}): Promise<ResolvedLlmConfig> => {
  const config = toResolvedConfig(input.store);

  try {
    await validateProviderModel({
      fetchImpl: input.fetchImpl,
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey,
      allowRegistryFailure: true
    });
  } catch (error) {
    if (error instanceof ProviderModelValidationError) {
      throw new LlmProviderError(
        `Configured model '${config.model}' is not available for provider '${config.provider}'. Save settings with a supported model.`,
        "provider_error",
        400
      );
    }

    if (error instanceof ProviderRegistryError) {
      if (error.code === "invalid_api_key") {
        throw new LlmProviderError("Invalid provider API key", "invalid_api_key", error.statusCode);
      }

      throw new LlmProviderError(error.message, "provider_error", error.statusCode ?? 502);
    }

    throw error;
  }

  return config;
};
