import type { ArtifactsSnapshot, Config, ProviderKeyStatus } from "./types.js";

type PartialProviderKeyStatus = Partial<ProviderKeyStatus> | undefined;

type RawConfig = Omit<Config, "hasApiKey" | "providerKeyStatus"> & Partial<Pick<Config, "hasApiKey" | "providerKeyStatus">>;

const EMPTY_PROVIDER_KEY_STATUS: ProviderKeyStatus = {
  anthropic: false,
  openai: false,
  openrouter: false
};

const mergeProviderKeyStatus = (
  provider: Config["provider"],
  hasApiKey: boolean | undefined,
  providerKeyStatus: PartialProviderKeyStatus
): ProviderKeyStatus => {
  const merged: ProviderKeyStatus = {
    ...EMPTY_PROVIDER_KEY_STATUS,
    ...(providerKeyStatus ?? {})
  };

  if (hasApiKey) {
    merged[provider] = true;
  }

  return merged;
};

export const normalizeConfig = (config: RawConfig | null): Config | null => {
  if (!config) {
    return null;
  }

  const providerKeyStatus = mergeProviderKeyStatus(config.provider, config.hasApiKey, config.providerKeyStatus);

  return {
    ...config,
    hasApiKey: providerKeyStatus[config.provider],
    providerKeyStatus
  };
};

export const normalizeArtifactsSnapshot = (snapshot: ArtifactsSnapshot): ArtifactsSnapshot => ({
  ...snapshot,
  meta: snapshot.meta ?? {
    revision: 0,
    generatedAt: new Date(0).toISOString(),
    generationTimeMs: 0,
    payloadBytes: 0,
    reloadIssues: []
  },
  config: normalizeConfig(snapshot.config)
});
