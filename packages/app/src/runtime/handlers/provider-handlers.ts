import { resolveProviderApiKey } from "../../config/env.js";
import type { SpecFlowRuntime } from "../types.js";
import { DEFAULT_RUNTIME_CONFIG, redactConfig } from "../default-config.js";
import { badRequest, upstreamFailure } from "../errors.js";

interface SaveConfigInput {
  provider?: "anthropic" | "openai" | "openrouter";
  model?: string;
  apiKey?: string;
  port?: number;
  host?: string;
  repoInstructionFile?: string;
}

export const saveConfig = async (runtime: SpecFlowRuntime, input: SaveConfigInput) => {
  const nextConfig = {
    ...(runtime.store.config ?? DEFAULT_RUNTIME_CONFIG),
    ...input
  };

  await runtime.store.upsertConfig(nextConfig);

  return {
    config: redactConfig(nextConfig)
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
  const apiKey = resolveProviderApiKey(provider, runtime.store.config?.apiKey);
  if (!apiKey) {
    throw badRequest(`No API key configured for ${provider}. Set one in Settings or via environment variable.`);
  }

  const endpointUrl =
    provider === "openrouter"
      ? "https://openrouter.ai/api/v1/models"
      : provider === "openai"
        ? "https://api.openai.com/v1/models"
        : "https://api.anthropic.com/v1/models";

  const headers: Record<string, string> =
    provider === "anthropic"
      ? {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        }
      : {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        };

  let response: Response;
  try {
    response = await runtime.fetchImpl(endpointUrl, { method: "GET", headers });
  } catch {
    throw upstreamFailure(`Failed to reach ${provider} model registry`, {
      error: "Provider Error",
      message: `Failed to reach ${provider} model registry`,
      details: "Network error; check connectivity"
    });
  }

  if (!response.ok) {
    throw upstreamFailure(`${provider} model discovery failed (${response.status})`, {
      error: "Provider Error",
      message: `${provider} model discovery failed (${response.status})`,
      details: "Check your API key and provider status"
    });
  }

  const payload = (await response.json()) as {
    data?: Array<{
      id?: string;
      name?: string;
      display_name?: string;
      context_length?: number;
    }>;
  };

  const models = (payload.data ?? [])
    .filter(
      (model): model is { id: string; name?: string; display_name?: string; context_length?: number } =>
        typeof model.id === "string"
    )
    .map((model) => ({
      id: model.id,
      name: model.display_name ?? model.name ?? model.id,
      contextLength: typeof model.context_length === "number" ? model.context_length : null
    }))
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
