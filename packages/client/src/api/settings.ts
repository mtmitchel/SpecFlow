import type { Config, ConfigSavePayload, ProviderModel } from "../types";
import { parse } from "./http";
import { transportRequest } from "./transport";

export const saveConfig = async (config: ConfigSavePayload): Promise<Config> => {
  const payload = await transportRequest<{ config: Config }>(
    "config.save",
    config,
    async () => {
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(config)
      });

      return parse<{ config: Config }>(response);
    }
  );
  return payload.config;
};

export const fetchProviderModels = async (
  provider: "anthropic" | "openai" | "openrouter",
  query?: string
): Promise<ProviderModel[]> => {
  const params = new URLSearchParams();
  if (query?.trim()) {
    params.set("q", query.trim());
  }

  const payload = await transportRequest<{
    models: ProviderModel[];
  }>(
    "providers.models",
    { provider, q: query },
    async () => {
      const response = await fetch(
        params.toString()
          ? `/api/providers/${provider}/models?${params.toString()}`
          : `/api/providers/${provider}/models`
      );
      return parse<{
        models: ProviderModel[];
      }>(response);
    }
  );

  return payload.models;
};
