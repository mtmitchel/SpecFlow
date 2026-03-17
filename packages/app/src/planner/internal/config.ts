import {
  resolveAndValidateLlmConfig,
  type ResolvedLlmConfig
} from "../../config/llm-config.js";
import type { ArtifactStore } from "../../store/artifact-store.js";

export type ResolvedPlannerConfig = ResolvedLlmConfig;

export const getResolvedPlannerConfig = async (
  store: ArtifactStore,
  fetchImpl: typeof fetch
): Promise<ResolvedPlannerConfig> => resolveAndValidateLlmConfig({ store, fetchImpl });
