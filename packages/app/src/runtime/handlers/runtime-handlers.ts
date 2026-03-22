import type { SpecFlowRuntime } from "../types.js";
import { redactConfig } from "../default-config.js";
import { notFound } from "../errors.js";

export const getArtifactsSnapshot = (runtime: SpecFlowRuntime) => {
  const snapshot = {
    config: redactConfig(runtime.store.config),
    meta: runtime.store.getSnapshotMeta(),
    workspaceRoot: runtime.rootDir,
    initiatives: Array.from(runtime.store.initiatives.values()),
    tickets: Array.from(runtime.store.tickets.values()),
    runs: Array.from(runtime.store.runs.values()),
    runAttempts: Array.from(runtime.store.runAttempts.entries()).map(([id, value]) => ({ id, ...value })),
    specs: Array.from(runtime.store.specs.values()),
    planningReviews: Array.from(runtime.store.planningReviews.values()),
    ticketCoverageArtifacts: Array.from(runtime.store.ticketCoverageArtifacts.values())
  };

  snapshot.meta.payloadBytes = Buffer.byteLength(JSON.stringify(snapshot), "utf8");
  return snapshot;
};

export const getSpecDetail = async (runtime: SpecFlowRuntime, specId: string) => {
  const spec = await runtime.store.readSpec(specId);
  if (!spec) {
    throw notFound(`Spec ${specId} not found`);
  }

  return { spec };
};
