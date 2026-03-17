import process from "node:process";
import { BundleGenerator } from "../bundle/bundle-generator.js";
import { loadEnvironment } from "../config/env.js";
import { migrateLegacyConfigApiKey } from "../config/legacy-config.js";
import { PlannerService } from "../planner/planner-service.js";
import { ArtifactStore } from "../store/artifact-store.js";
import { DiffEngine } from "../verify/diff-engine.js";
import { VerifierService } from "../verify/verifier-service.js";
import type { CreateSpecFlowRuntimeOptions, SpecFlowRuntime } from "./types.js";

export const createSpecFlowRuntime = async (
  options: CreateSpecFlowRuntimeOptions
): Promise<SpecFlowRuntime> => {
  loadEnvironment(options.rootDir);
  const fetchImpl = options.fetchImpl ?? fetch;

  const store = options.store ?? new ArtifactStore({ rootDir: options.rootDir });
  const migration = await migrateLegacyConfigApiKey({
    rootDir: options.rootDir,
    store
  });
  if (migration.scrubbed && migration.provider) {
    const message = migration.migrated
      ? `[SpecFlow] Migrated a legacy ${migration.provider} API key from specflow/config.yaml to .env. Rotate that key.\n`
      : `[SpecFlow] Removed a legacy ${migration.provider} API key from specflow/config.yaml because an environment key already exists. Rotate the legacy key if it was active.\n`;
    process.stderr.write(message);
  }
  await store.initialize();

  const plannerService = options.plannerService ??
    new PlannerService({
      rootDir: options.rootDir,
      store,
      fetchImpl
    });
  const bundleGenerator = options.bundleGenerator ??
    new BundleGenerator({
      rootDir: options.rootDir,
      store
    });
  const verifierService = options.verifierService ??
    new VerifierService({
      rootDir: options.rootDir,
      store,
      fetchImpl
    });

  return {
    rootDir: options.rootDir,
    store,
    plannerService,
    bundleGenerator,
    verifierService,
    diffEngine: new DiffEngine({ rootDir: options.rootDir }),
    fetchImpl,
    close: async () => {
      await store.close();
    }
  };
};
