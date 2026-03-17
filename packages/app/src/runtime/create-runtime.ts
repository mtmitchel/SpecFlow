import { BundleGenerator } from "../bundle/bundle-generator.js";
import { loadEnvironment } from "../config/env.js";
import { PlannerService } from "../planner/planner-service.js";
import { ArtifactStore } from "../store/artifact-store.js";
import { DiffEngine } from "../verify/diff-engine.js";
import { VerifierService } from "../verify/verifier-service.js";
import type { CreateSpecFlowRuntimeOptions, SpecFlowRuntime } from "./types.js";

export const createSpecFlowRuntime = async (
  options: CreateSpecFlowRuntimeOptions
): Promise<SpecFlowRuntime> => {
  loadEnvironment(options.rootDir);

  const store = options.store ?? new ArtifactStore({ rootDir: options.rootDir });
  await store.initialize();

  const plannerService = options.plannerService ??
    new PlannerService({
      rootDir: options.rootDir,
      store
    });
  const bundleGenerator = options.bundleGenerator ??
    new BundleGenerator({
      rootDir: options.rootDir,
      store
    });
  const verifierService = options.verifierService ??
    new VerifierService({
      rootDir: options.rootDir,
      store
    });

  return {
    rootDir: options.rootDir,
    store,
    plannerService,
    bundleGenerator,
    verifierService,
    diffEngine: new DiffEngine({ rootDir: options.rootDir }),
    fetchImpl: options.fetchImpl ?? fetch,
    close: async () => {
      await store.close();
    }
  };
};
