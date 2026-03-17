import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { attemptDir, operationAttemptDir, operationManifestPath, runsDir } from "../../io/paths.js";
import { readYamlFile, writeYamlFile } from "../../io/yaml.js";
import { NotFoundError, RetryableConflictError } from "../errors.js";
import type { PreparedOperationArtifacts } from "../types.js";
import { listDirectoryNames } from "./fs-utils.js";
import type { OperationManifest, OperationState, Run } from "../../types/entities.js";

export interface PrepareRunOperationInput {
  runId: string;
  operationId: string;
  attemptId: string;
  leaseMs: number;
  artifacts: PreparedOperationArtifacts;
  validation?: {
    passed: boolean;
    details?: string;
  };
}

export interface CommitRunOperationInput {
  runId: string;
  operationId: string;
}

export interface OperationStoreContext {
  rootDir: string;
  now: () => Date;
  runs: Map<string, Run>;
  writeLocks: Map<string, string>;
  ensureRunWritable: (runId: string, requestedOperationId: string) => Promise<void>;
  writePreparedArtifacts: (stagedAttemptDir: string, artifacts: PreparedOperationArtifacts) => Promise<void>;
  upsertRun: (run: Run) => Promise<void>;
  reloadFromDisk: () => Promise<void>;
  markOperationState: (runId: string, operationId: string, state: OperationState) => Promise<OperationManifest>;
  clearRunOperationPointer: (runId: string) => Promise<void>;
  isLeaseExpired: (leaseExpiresAt: string | null) => boolean;
  uniquePush: (items: string[], value: string) => string[];
  suppressWatcher: () => void;
  resumeWatcher: () => void;
}

export const prepareRunOperation = async (
  store: OperationStoreContext,
  input: PrepareRunOperationInput
): Promise<OperationManifest> => {
  await store.ensureRunWritable(input.runId, input.operationId);

  const run = store.runs.get(input.runId);
  if (!run) {
    throw new NotFoundError(`Run ${input.runId} not found`);
  }

  store.writeLocks.set(input.runId, input.operationId);

  try {
    const operationRoot = operationManifestPath(store.rootDir, input.runId, input.operationId);
    const stagedAttemptDir = operationAttemptDir(store.rootDir, input.runId, input.operationId, input.attemptId);

    await mkdir(stagedAttemptDir, { recursive: true });
    await store.writePreparedArtifacts(stagedAttemptDir, input.artifacts);

    const nowIso = store.now().toISOString();
    const manifest: OperationManifest = {
      operationId: input.operationId,
      runId: input.runId,
      targetAttemptId: input.attemptId,
      state: "prepared",
      leaseExpiresAt: new Date(store.now().getTime() + input.leaseMs).toISOString(),
      validation: {
        passed: input.validation?.passed ?? true,
        details: input.validation?.details
      },
      preparedAt: nowIso,
      updatedAt: nowIso
    };

    await mkdir(path.dirname(operationRoot), { recursive: true });
    await writeYamlFile(operationRoot, manifest);

    const updatedRun: Run = {
      ...run,
      activeOperationId: input.operationId,
      operationLeaseExpiresAt: manifest.leaseExpiresAt
    };

    await store.upsertRun(updatedRun);
    await store.reloadFromDisk();

    return manifest;
  } finally {
    store.writeLocks.delete(input.runId);
  }
};

export const commitRunOperation = async (
  store: OperationStoreContext,
  input: CommitRunOperationInput
): Promise<Run> => {
  await store.ensureRunWritable(input.runId, input.operationId);

  const run = store.runs.get(input.runId);
  if (!run) {
    throw new NotFoundError(`Run ${input.runId} not found`);
  }

  if (run.activeOperationId !== input.operationId) {
    throw new RetryableConflictError(
      `Run ${input.runId} is locked by operation ${run.activeOperationId ?? "none"}`
    );
  }

  store.writeLocks.set(input.runId, input.operationId);

  try {
    const manifestPath = operationManifestPath(store.rootDir, input.runId, input.operationId);
    const manifest = await readYamlFile<OperationManifest>(manifestPath);

    if (!manifest) {
      throw new NotFoundError(`Operation manifest missing for ${input.operationId}`);
    }

    if (manifest.state === "committed") {
      return run;
    }

    if (store.isLeaseExpired(manifest.leaseExpiresAt)) {
      await store.markOperationState(input.runId, input.operationId, "abandoned");
      await store.clearRunOperationPointer(input.runId);
      throw new RetryableConflictError(`Operation ${input.operationId} lease expired before commit`);
    }

    const stagedAttempt = operationAttemptDir(store.rootDir, input.runId, input.operationId, manifest.targetAttemptId);
    const committedAttempt = attemptDir(store.rootDir, input.runId, manifest.targetAttemptId);

    store.suppressWatcher();
    try {
      await rm(committedAttempt, { recursive: true, force: true });
      await mkdir(path.dirname(committedAttempt), { recursive: true });
      await cp(stagedAttempt, committedAttempt, { recursive: true });

      const nowIso = store.now().toISOString();
      const updatedManifest: OperationManifest = {
        ...manifest,
        state: "committed",
        updatedAt: nowIso,
        committedAt: nowIso
      };
      await writeYamlFile(manifestPath, updatedManifest);

      const updatedRun: Run = {
        ...run,
        attempts: store.uniquePush(run.attempts, manifest.targetAttemptId),
        committedAttemptId: manifest.targetAttemptId,
        activeOperationId: null,
        operationLeaseExpiresAt: null,
        lastCommittedAt: nowIso,
        status: "complete"
      };
      await store.upsertRun(updatedRun);
      await store.reloadFromDisk();
    } finally {
      store.resumeWatcher();
    }

    const committedRun = store.runs.get(input.runId);
    if (!committedRun) {
      throw new NotFoundError(`Run ${input.runId} disappeared after commit`);
    }

    return committedRun;
  } finally {
    store.writeLocks.delete(input.runId);
  }
};

export const markOperationState = async (
  rootDir: string,
  now: () => Date,
  runId: string,
  operationId: string,
  state: OperationState
): Promise<OperationManifest> => {
  const manifestPath = operationManifestPath(rootDir, runId, operationId);
  const existing = await readYamlFile<OperationManifest>(manifestPath);
  const nowIso = now().toISOString();

  const manifest: OperationManifest = existing ?? {
    operationId,
    runId,
    targetAttemptId: "unknown",
    state,
    leaseExpiresAt: nowIso,
    validation: { passed: false, details: "recovered without prior manifest" },
    preparedAt: nowIso,
    updatedAt: nowIso
  };

  manifest.state = state;
  manifest.updatedAt = nowIso;

  await writeYamlFile(manifestPath, manifest);
  return manifest;
};

export const getOperationStatus = async (
  rootDir: string,
  operationId: string
): Promise<
  | {
      operationId: string;
      runId: string;
      targetAttemptId: string;
      state: OperationState;
      leaseExpiresAt: string;
      updatedAt: string;
    }
  | null
> => {
  const runIds = await listDirectoryNames(runsDir(rootDir));

  for (const runId of runIds) {
    const manifest = await readYamlFile<OperationManifest>(operationManifestPath(rootDir, runId, operationId));

    if (!manifest) {
      continue;
    }

    return {
      operationId: manifest.operationId,
      runId: manifest.runId,
      targetAttemptId: manifest.targetAttemptId,
      state: manifest.state,
      leaseExpiresAt: manifest.leaseExpiresAt,
      updatedAt: manifest.updatedAt
    };
  }

  return null;
};
