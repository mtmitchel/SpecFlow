import type { Config, ConfigSavePayload, ProviderModel } from "../types";
import { parse } from "./http";

export const saveConfig = async (config: ConfigSavePayload): Promise<Config> => {
  const response = await fetch("/api/config", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(config)
  });

  const payload = await parse<{ config: Config }>(response);
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

  const response = await fetch(
    params.toString()
      ? `/api/providers/${provider}/models?${params.toString()}`
      : `/api/providers/${provider}/models`
  );
  const payload = await parse<{
    models: ProviderModel[];
  }>(response);

  return payload.models;
};
