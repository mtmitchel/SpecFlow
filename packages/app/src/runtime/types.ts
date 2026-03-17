import type { BundleGenerator } from "../bundle/bundle-generator.js";
import type { PlannerService } from "../planner/planner-service.js";
import type { ArtifactStore } from "../store/artifact-store.js";
import type { DiffEngine } from "../verify/diff-engine.js";
import type { VerifierService } from "../verify/verifier-service.js";

export interface SpecFlowRuntime {
  rootDir: string;
  store: ArtifactStore;
  plannerService: PlannerService;
  bundleGenerator: BundleGenerator;
  verifierService: VerifierService;
  diffEngine: DiffEngine;
  fetchImpl: typeof fetch;
  close: () => Promise<void>;
}

export interface CreateSpecFlowRuntimeOptions {
  rootDir: string;
  fetchImpl?: typeof fetch;
  store?: ArtifactStore;
  plannerService?: PlannerService;
  bundleGenerator?: BundleGenerator;
  verifierService?: VerifierService;
}

export interface NotificationSink {
  (event: string, payload: unknown): void | Promise<void>;
}

export interface ProgressSink {
  (chunk: string): Promise<void>;
}
