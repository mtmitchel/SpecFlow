import { readYamlFile } from "../io/yaml.js";
import { configPath } from "../io/paths.js";
import type { ArtifactStore } from "../store/artifact-store.js";
import type { Config, ProviderId } from "../types/entities.js";
import { resolveProviderApiKey, setProviderApiKey } from "./env.js";

interface LegacyConfig extends Config {
  apiKey?: string;
}

export const migrateLegacyConfigApiKey = async (input: {
  rootDir: string;
  store: ArtifactStore;
}): Promise<{ migrated: boolean; scrubbed: boolean; provider: ProviderId | null }> => {
  const existing = await readYamlFile<LegacyConfig>(configPath(input.rootDir));
  if (!existing) {
    return { migrated: false, scrubbed: false, provider: null };
  }

  const hasLegacyApiKeyField = Object.prototype.hasOwnProperty.call(existing, "apiKey");
  const legacyApiKey = existing.apiKey?.trim() ?? "";
  if (!hasLegacyApiKeyField) {
    return { migrated: false, scrubbed: false, provider: null };
  }

  const currentProviderKey = resolveProviderApiKey(existing.provider);
  if (!currentProviderKey && legacyApiKey) {
    await setProviderApiKey(input.rootDir, existing.provider, legacyApiKey);
  }

  const { apiKey: _apiKey, ...scrubbedConfig } = existing;
  await input.store.upsertConfig(scrubbedConfig);

  return {
    migrated: !currentProviderKey && Boolean(legacyApiKey),
    scrubbed: true,
    provider: existing.provider
  };
};
