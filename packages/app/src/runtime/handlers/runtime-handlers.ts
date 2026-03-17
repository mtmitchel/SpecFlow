import type { SpecFlowRuntime } from "../types.js";
import { redactConfig } from "../default-config.js";
import { PROTOCOL_VERSION, SERVER_VERSION, runtimeCapabilities } from "../../server/runtime-status.js";
import { notFound } from "../errors.js";

export const getRuntimeStatus = () => ({
  serverVersion: SERVER_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  capabilities: runtimeCapabilities
});

export const getArtifactsSnapshot = (runtime: SpecFlowRuntime) => ({
  config: redactConfig(runtime.store.config),
  initiatives: Array.from(runtime.store.initiatives.values()),
  tickets: Array.from(runtime.store.tickets.values()),
  runs: Array.from(runtime.store.runs.values()),
  runAttempts: Array.from(runtime.store.runAttempts.entries()).map(([id, value]) => ({ id, ...value })),
  specs: Array.from(runtime.store.specs.values()),
  planningReviews: Array.from(runtime.store.planningReviews.values()),
  ticketCoverageArtifacts: Array.from(runtime.store.ticketCoverageArtifacts.values())
});

export const getSpecDetail = async (runtime: SpecFlowRuntime, specId: string) => {
  const spec = await runtime.store.readSpec(specId);
  if (!spec) {
    throw notFound(`Spec ${specId} not found`);
  }

  return { spec };
};
