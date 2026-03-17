import type { ProviderId } from "../types/entities.js";

export interface ProviderModelRecord {
  id: string;
  name: string;
  contextLength: number | null;
}

export class ProviderRegistryError extends Error {
  public readonly code: "invalid_api_key" | "unavailable";
  public readonly provider: ProviderId;
  public readonly statusCode?: number;

  public constructor(
    provider: ProviderId,
    code: "invalid_api_key" | "unavailable",
    message: string,
    statusCode?: number
  ) {
    super(message);
    this.name = "ProviderRegistryError";
    this.provider = provider;
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ProviderModelValidationError extends Error {
  public readonly provider: ProviderId;
  public readonly model: string;

  public constructor(provider: ProviderId, model: string) {
    super(`Model '${model}' is not available for provider '${provider}'.`);
    this.name = "ProviderModelValidationError";
    this.provider = provider;
    this.model = model;
  }
}

const CACHE_TTL_MS = 5 * 60_000;

const modelCache = new Map<string, { expiresAt: number; models: ProviderModelRecord[] }>();

const providerRegistryUrl = (provider: ProviderId): string => {
  switch (provider) {
    case "openrouter":
      return "https://openrouter.ai/api/v1/models";
    case "openai":
      return "https://api.openai.com/v1/models";
    case "anthropic":
      return "https://api.anthropic.com/v1/models";
    default: {
      const exhaustive: never = provider;
      return String(exhaustive);
    }
  }
};

const providerRegistryHeaders = (provider: ProviderId, apiKey: string): Record<string, string> => {
  if (provider === "anthropic") {
    return {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    };
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
};

const cacheKeyFor = (provider: ProviderId, apiKey: string): string => `${provider}:${apiKey}`;

export const clearProviderModelCache = (provider?: ProviderId): void => {
  if (!provider) {
    modelCache.clear();
    return;
  }

  for (const key of modelCache.keys()) {
    if (key.startsWith(`${provider}:`)) {
      modelCache.delete(key);
    }
  }
};

export const fetchProviderModelCatalog = async (input: {
  fetchImpl: typeof fetch;
  provider: ProviderId;
  apiKey: string;
  now?: () => number;
}): Promise<ProviderModelRecord[]> => {
  const trimmedApiKey = input.apiKey.trim();
  const now = input.now ?? (() => Date.now());
  const cacheKey = cacheKeyFor(input.provider, trimmedApiKey);
  const cached = modelCache.get(cacheKey);
  if (cached && cached.expiresAt > now()) {
    return cached.models;
  }

  let response: Response;
  try {
    response = await input.fetchImpl(providerRegistryUrl(input.provider), {
      method: "GET",
      headers: providerRegistryHeaders(input.provider, trimmedApiKey)
    });
  } catch {
    throw new ProviderRegistryError(
      input.provider,
      "unavailable",
      `Failed to reach ${input.provider} model registry`
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new ProviderRegistryError(
      input.provider,
      "invalid_api_key",
      `Invalid API key configured for ${input.provider}`,
      response.status
    );
  }

  if (!response.ok) {
    throw new ProviderRegistryError(
      input.provider,
      "unavailable",
      `${input.provider} model registry request failed (${response.status})`,
      response.status
    );
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
    .sort((left, right) => left.id.localeCompare(right.id));

  modelCache.set(cacheKey, {
    expiresAt: now() + CACHE_TTL_MS,
    models
  });

  return models;
};

export const validateProviderModel = async (input: {
  fetchImpl: typeof fetch;
  provider: ProviderId;
  model: string;
  apiKey: string;
  allowRegistryFailure?: boolean;
  now?: () => number;
}): Promise<"validated" | "skipped" | "unreachable"> => {
  const trimmedApiKey = input.apiKey.trim();
  if (!trimmedApiKey) {
    return "skipped";
  }

  let models: ProviderModelRecord[];
  try {
    models = await fetchProviderModelCatalog({
      fetchImpl: input.fetchImpl,
      provider: input.provider,
      apiKey: trimmedApiKey,
      now: input.now
    });
  } catch (error) {
    if (error instanceof ProviderRegistryError && error.code === "unavailable" && input.allowRegistryFailure) {
      return "unreachable";
    }

    throw error;
  }

  if (!models.some((model) => model.id === input.model)) {
    throw new ProviderModelValidationError(input.provider, input.model);
  }

  return "validated";
};
