import {
  getProviderKeyStatus,
  resolveProviderApiKey,
  setProviderApiKey
} from "../../config/env.js";
import {
  clearProviderModelCache,
  fetchProviderModelCatalog,
  ProviderModelValidationError,
  ProviderRegistryError,
  validateProviderModel
} from "../../config/provider-models.js";
import type { ConfigSavePayload, SaveProviderKeyPayload } from "../../types/entities.js";
import { DEFAULT_RUNTIME_CONFIG, redactConfig } from "../default-config.js";
import { badRequest, upstreamFailure } from "../errors.js";
import type { SpecFlowRuntime } from "../types.js";

type SaveConfigInput = Partial<ConfigSavePayload>;

export const saveConfig = async (runtime: SpecFlowRuntime, input: SaveConfigInput) => {
  const nextConfig = {
    ...(runtime.store.config ?? DEFAULT_RUNTIME_CONFIG),
    ...input
  };

  try {
    await validateProviderModel({
      fetchImpl: runtime.fetchImpl,
      provider: nextConfig.provider,
      model: nextConfig.model,
      apiKey: resolveProviderApiKey(nextConfig.provider),
      allowRegistryFailure: true
    });
  } catch (error) {
    if (error instanceof ProviderModelValidationError) {
      throw badRequest(
        `Model '${nextConfig.model}' is not available for provider '${nextConfig.provider}'. Choose a supported model first.`
      );
    }

    if (error instanceof ProviderRegistryError) {
      if (error.code === "invalid_api_key") {
        throw badRequest(`Invalid API key configured for ${nextConfig.provider}. Save a valid key first.`);
      }
      throw upstreamFailure(error.message, {
        error: "Provider Error",
        message: error.message,
        details: "Check connectivity or provider status"
      });
    }

    throw error;
  }

  await runtime.store.upsertConfig(nextConfig);
  clearProviderModelCache(nextConfig.provider);

  return {
    config: redactConfig(nextConfig)
  };
};

export const saveProviderKey = async (runtime: SpecFlowRuntime, input: Partial<SaveProviderKeyPayload>) => {
  const provider = input.provider;
  if (provider !== "openrouter" && provider !== "openai" && provider !== "anthropic") {
    throw badRequest("Provider is required when saving an API key");
  }

  const apiKey = input.apiKey?.trim() ?? "";
  if (!apiKey) {
    throw badRequest("API key is required");
  }

  await setProviderApiKey(runtime.rootDir, provider, apiKey);
  clearProviderModelCache(provider);

  return {
    provider,
    providerKeyStatus: getProviderKeyStatus()
  };
};

export const getProviderModels = async (
  runtime: SpecFlowRuntime,
  provider: string,
  query?: string
) => {
  if (provider !== "openrouter" && provider !== "openai" && provider !== "anthropic") {
    throw badRequest(`Provider '${provider}' is not supported for model discovery`);
  }

  const searchTerm = (query ?? "").trim().toLowerCase();
  const apiKey = resolveProviderApiKey(provider);
  if (!apiKey) {
    throw badRequest(`No API key configured for ${provider}. Set one in Settings or via environment variable.`);
  }

  let models;
  try {
    models = await fetchProviderModelCatalog({
      fetchImpl: runtime.fetchImpl,
      provider,
      apiKey
    });
  } catch (error) {
    if (error instanceof ProviderRegistryError && error.code === "invalid_api_key") {
      throw badRequest(`Invalid API key configured for ${provider}. Save a valid key first.`);
    }

    throw upstreamFailure(`Failed to reach ${provider} model registry`, {
      error: "Provider Error",
      message: `Failed to reach ${provider} model registry`,
      details: "Network error; check connectivity"
    });
  }

  models = models
    .filter((model) => {
      if (!searchTerm) {
        return true;
      }

      return model.id.toLowerCase().includes(searchTerm) || model.name.toLowerCase().includes(searchTerm);
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    provider,
    count: models.length,
    models
  };
};
