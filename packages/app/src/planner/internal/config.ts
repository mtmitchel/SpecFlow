import { resolveProviderApiKey } from "../../config/env.js";
import type { ArtifactStore } from "../../store/artifact-store.js";

export interface ResolvedPlannerConfig {
  provider: "anthropic" | "openai" | "openrouter";
  model: string;
  apiKey: string;
  repoInstructionFile: string;
}

export const getResolvedPlannerConfig = (store: ArtifactStore): ResolvedPlannerConfig => {
  const existing = store.config;
  if (!existing) {
    const provider = "anthropic" as const;
    return {
      provider,
      model: "claude-opus-4-5",
      apiKey: resolveProviderApiKey(provider),
      repoInstructionFile: "specflow/AGENTS.md"
    };
  }

  return {
    provider: existing.provider,
    model: existing.model,
    apiKey: resolveProviderApiKey(existing.provider, existing.apiKey),
    repoInstructionFile: existing.repoInstructionFile || "specflow/AGENTS.md"
  };
};
