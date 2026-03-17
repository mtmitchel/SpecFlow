import type { Config, ConfigSavePayload, ProviderModel, SaveProviderKeyPayload } from "../types";
import { normalizeConfig } from "../config-normalization";
import { parse } from "./http";
import { transportRequest } from "./transport";

const isUnsupportedSidecarMethodError = (error: unknown, method: string): boolean =>
  error instanceof Error && error.message.includes(`Unsupported sidecar method: ${method}`);

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
  const normalizedConfig = normalizeConfig(payload.config);
  if (!normalizedConfig) {
    throw new Error("Settings save response did not include config");
  }

  return normalizedConfig;
};

export const saveProviderKey = async (input: SaveProviderKeyPayload): Promise<void> => {
  try {
    await transportRequest<{ provider: SaveProviderKeyPayload["provider"] }>(
      "config.saveProviderKey",
      input,
      async () => {
        const response = await fetch("/api/config/provider-key", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(input)
        });

        return parse<{ provider: SaveProviderKeyPayload["provider"] }>(response);
      }
    );
  } catch (error) {
    if (isUnsupportedSidecarMethodError(error, "config.saveProviderKey")) {
      throw new Error(
        "This desktop app build is older than the current SpecFlow UI and cannot save API keys safely. Restart from source with `npm run tauri dev` or rebuild the desktop app, then try again."
      );
    }

    throw error;
  }
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
