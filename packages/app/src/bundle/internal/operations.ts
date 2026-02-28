import { readFile } from "node:fs/promises";
import path from "node:path";
import { readYamlFile } from "../../io/yaml.js";
import { ArtifactStore } from "../../store/artifact-store.js";
import type { Run, Ticket } from "../../types/entities.js";
import type { BundleManifest, ExportBundleResult } from "../types.js";

export const resolveExistingOperation = async (input: {
  rootDir: string;
  store: ArtifactStore;
  operationId: string;
}): Promise<ExportBundleResult | null> => {
  const existing = await input.store.getOperationStatus(input.operationId);
  if (!existing) {
    return null;
  }

  if (existing.state !== "committed") {
    throw new Error(`Operation ${input.operationId} is currently ${existing.state}`);
  }

  const attemptDir = path.join(
    input.rootDir,
    "specflow",
    "runs",
    existing.runId,
    "attempts",
    existing.targetAttemptId
  );

  const flatPath = path.join(attemptDir, "bundle-flat.md");
  const manifestPath = path.join(attemptDir, "bundle-manifest.yaml");
  const flatString = await readFile(flatPath, "utf8");
  const manifest = await readYamlFile<BundleManifest>(manifestPath);

  if (!manifest) {
    throw new Error(`Committed operation ${input.operationId} is missing bundle-manifest.yaml`);
  }

  return {
    runId: existing.runId,
    attemptId: existing.targetAttemptId,
    operationId: input.operationId,
    bundlePath: path.join(attemptDir, "bundle"),
    flatString,
    manifest
  };
};

export const ensureRunForTicket = async (input: {
  store: ArtifactStore;
  ticket: Ticket;
  agentTarget: Run["agentType"];
  idGenerator: () => string;
  now: () => Date;
}): Promise<Run> => {
  if (input.ticket.runId && input.store.runs.has(input.ticket.runId)) {
    const existing = input.store.runs.get(input.ticket.runId);
    if (existing) {
      return existing;
    }
  }

  const runId = `run-${input.idGenerator()}`;
  const run: Run = {
    id: runId,
    ticketId: input.ticket.id,
    type: "execution",
    agentType: input.agentTarget,
    status: "pending",
    attempts: [],
    committedAttemptId: null,
    activeOperationId: null,
    operationLeaseExpiresAt: null,
    lastCommittedAt: null,
    createdAt: input.now().toISOString()
  };

  await input.store.upsertRun(run);
  return run;
};
