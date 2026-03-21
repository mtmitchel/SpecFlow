import { runYamlPath } from "../../io/paths.js";
import { writeYamlFile } from "../../io/yaml.js";
import { NotFoundError, RetryableConflictError } from "../errors.js";
import type { OperationManifest, Run } from "../../types/entities.js";

export const isLeaseExpired = (
  leaseExpiresAt: string | null,
  now: () => Date,
): boolean => {
  if (!leaseExpiresAt) {
    return false;
  }

  return Date.parse(leaseExpiresAt) <= now().getTime();
};

export const runAttemptKey = (runId: string, attemptId: string): string => `${runId}:${attemptId}`;

export const uniquePush = (items: string[], value: string): string[] =>
  items.includes(value) ? items : [...items, value];

export const rebuildOperationIndex = (
  operationIndex: Map<string, string>,
  runs: Map<string, Run>,
): void => {
  operationIndex.clear();
  for (const [runId, run] of runs) {
    if (run.activeOperationId) {
      operationIndex.set(run.activeOperationId, runId);
    }
  }
};

export const adoptCommittedOperation = async (options: {
  rootDir: string;
  runs: Map<string, Run>;
  runId: string;
  manifest: OperationManifest;
}): Promise<Run | null> => {
  const run = options.runs.get(options.runId);
  if (!run) {
    return null;
  }

  const updatedRun: Run = {
    ...run,
    attempts: uniquePush(run.attempts, options.manifest.targetAttemptId),
    committedAttemptId: options.manifest.targetAttemptId,
    activeOperationId: null,
    operationLeaseExpiresAt: null,
    lastCommittedAt: options.manifest.committedAt ?? options.manifest.updatedAt,
    status: "complete",
  };

  await writeYamlFile(runYamlPath(options.rootDir, options.runId), updatedRun);
  options.runs.set(options.runId, updatedRun);
  return updatedRun;
};

export const ensureRunWritable = async (options: {
  runId: string;
  requestedOperationId: string;
  writeLocks: Map<string, string>;
  runs: Map<string, Run>;
  now: () => Date;
  markOperationState: (runId: string, operationId: string, state: "abandoned") => Promise<unknown>;
  clearRunOperationPointer: (runId: string) => Promise<void>;
  reloadFromDisk: () => Promise<void>;
}): Promise<void> => {
  const lockOwner = options.writeLocks.get(options.runId);
  if (lockOwner && lockOwner !== options.requestedOperationId) {
    throw new RetryableConflictError(`Run ${options.runId} is currently locked by ${lockOwner}`);
  }

  const run = options.runs.get(options.runId);
  if (!run) {
    throw new NotFoundError(`Run ${options.runId} not found`);
  }

  if (!run.activeOperationId) {
    return;
  }

  if (
    run.activeOperationId !== options.requestedOperationId &&
    !isLeaseExpired(run.operationLeaseExpiresAt, options.now)
  ) {
    throw new RetryableConflictError(
      `Run ${options.runId} has an active operation ${run.activeOperationId}; retry later`,
    );
  }

  if (isLeaseExpired(run.operationLeaseExpiresAt, options.now)) {
    await options.markOperationState(options.runId, run.activeOperationId, "abandoned");
    await options.clearRunOperationPointer(options.runId);
    await options.reloadFromDisk();

    if (run.activeOperationId === options.requestedOperationId) {
      throw new RetryableConflictError(
        `Operation ${options.requestedOperationId} lease expired and was abandoned`,
      );
    }
  }
};
