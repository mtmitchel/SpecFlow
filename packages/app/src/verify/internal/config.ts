import {
  resolveAndValidateLlmConfig,
  type ResolvedLlmConfig
} from "../../config/llm-config.js";
import type { ArtifactStore } from "../../store/artifact-store.js";

export type ResolvedVerifierConfig = ResolvedLlmConfig;

export const getResolvedVerifierConfig = async (
  store: ArtifactStore,
  fetchImpl: typeof fetch
): Promise<ResolvedVerifierConfig> => resolveAndValidateLlmConfig({ store, fetchImpl });
