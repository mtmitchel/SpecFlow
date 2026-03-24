import { operationManifestPath } from "../../io/paths.js";
import { readYamlFile } from "../../io/yaml.js";
import { writePreparedArtifacts } from "./artifact-writer.js";
import {
  commitRunOperation as commitRunOperationInternal,
  getOperationStatus as getOperationStatusInternal,
  markOperationState as markOperationStateInternal,
  prepareRunOperation as prepareRunOperationInternal
} from "./operations.js";
import {
  clearRunOperationPointer as clearRunOperationPointerInternal,
  recoverOrphanOperations as recoverOrphanOperationsInternal
} from "./recovery.js";
import {
  adoptCommittedOperation as adoptCommittedOperationInternal,
  ensureRunWritable as ensureRunWritableInternal,
  isLeaseExpired,
  uniquePush
} from "./run-operation-state.js";
import type { PreparedOperationArtifacts } from "../types.js";
import type { OperationManifest, OperationState, Run } from "../../types/entities.js";

interface StoreRunOperationFacadeContext {
  rootDir: string;
  now: () => Date;
  runs: Map<string, Run>;
  writeLocks: Map<string, string>;
  operationIndex: Map<string, string>;
  upsertRun: (run: Run) => Promise<void>;
  reloadFromDisk: () => Promise<void>;
  markOperationState: (runId: string, operationId: string, state: OperationState) => Promise<OperationManifest>;
  clearRunOperationPointer: (runId: string) => Promise<void>;
  ensureRunWritable: (runId: string, requestedOperationId: string) => Promise<void>;
  suppressWatcher: () => void;
  resumeWatcher: () => void;
  bumpRevision: () => number;
  refreshSnapshotPayloadBytes: () => void;
}

export interface PrepareOperationInput {
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

export interface CommitOperationInput {
  runId: string;
  operationId: string;
}

export async function prepareRunOperationInStore(
  context: StoreRunOperationFacadeContext,
  input: PrepareOperationInput
): Promise<OperationManifest> {
  const manifest = await prepareRunOperationInternal(
    {
      rootDir: context.rootDir,
      now: context.now,
      runs: context.runs,
      writeLocks: context.writeLocks,
      ensureRunWritable: context.ensureRunWritable,
      writePreparedArtifacts,
      upsertRun: context.upsertRun,
      reloadFromDisk: context.reloadFromDisk,
      markOperationState: context.markOperationState,
      clearRunOperationPointer: context.clearRunOperationPointer,
      isLeaseExpired: (leaseExpiresAt) => isLeaseExpired(leaseExpiresAt, context.now),
      uniquePush,
      suppressWatcher: context.suppressWatcher,
      resumeWatcher: context.resumeWatcher
    },
    input
  );
  context.operationIndex.set(input.operationId, input.runId);
  return manifest;
}

export async function commitRunOperationInStore(
  context: StoreRunOperationFacadeContext,
  input: CommitOperationInput
): Promise<Run> {
  const run = await commitRunOperationInternal(
    {
      rootDir: context.rootDir,
      now: context.now,
      runs: context.runs,
      writeLocks: context.writeLocks,
      ensureRunWritable: context.ensureRunWritable,
      writePreparedArtifacts,
      upsertRun: context.upsertRun,
      reloadFromDisk: context.reloadFromDisk,
      markOperationState: context.markOperationState,
      clearRunOperationPointer: context.clearRunOperationPointer,
      isLeaseExpired: (leaseExpiresAt) => isLeaseExpired(leaseExpiresAt, context.now),
      uniquePush,
      suppressWatcher: context.suppressWatcher,
      resumeWatcher: context.resumeWatcher
    },
    input
  );
  context.operationIndex.delete(input.operationId);
  return run;
}

export function markOperationStateInStore(
  context: StoreRunOperationFacadeContext,
  runId: string,
  operationId: string,
  state: OperationState
): Promise<OperationManifest> {
  return markOperationStateInternal(context.rootDir, context.now, runId, operationId, state);
}

export async function recoverOrphanOperationsInStore(
  context: StoreRunOperationFacadeContext
): Promise<void> {
  await recoverOrphanOperationsInternal({
    rootDir: context.rootDir,
    runs: context.runs,
    markOperationState: (runId, operationId, state) =>
      markOperationStateInStore(context, runId, operationId, state),
    clearRunOperationPointer: (runId) => clearRunOperationPointerInStore(context, runId),
    adoptCommittedOperation: (runId, manifest) => adoptCommittedOperationInStore(context, runId, manifest)
  });
}

export async function adoptCommittedOperationInStore(
  context: StoreRunOperationFacadeContext,
  runId: string,
  manifest: OperationManifest
): Promise<void> {
  await adoptCommittedOperationInternal({
    rootDir: context.rootDir,
    runs: context.runs,
    runId,
    manifest
  });
  context.refreshSnapshotPayloadBytes();
}

export async function getOperationStatusInStore(
  context: StoreRunOperationFacadeContext,
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
> {
  const indexedRunId = context.operationIndex.get(operationId);
  if (indexedRunId) {
    const manifest = await readYamlFile<OperationManifest>(
      operationManifestPath(context.rootDir, indexedRunId, operationId)
    );
    if (manifest) {
      return {
        operationId: manifest.operationId,
        runId: manifest.runId,
        targetAttemptId: manifest.targetAttemptId,
        state: manifest.state,
        leaseExpiresAt: manifest.leaseExpiresAt,
        updatedAt: manifest.updatedAt
      };
    }
  }

  return getOperationStatusInternal(context.rootDir, operationId);
}

export async function clearRunOperationPointerInStore(
  context: StoreRunOperationFacadeContext,
  runId: string
): Promise<void> {
  await clearRunOperationPointerInternal(context.rootDir, context.runs, runId);
  context.bumpRevision();
  context.refreshSnapshotPayloadBytes();
}

export function ensureRunWritableInStore(
  context: StoreRunOperationFacadeContext,
  runId: string,
  requestedOperationId: string
): Promise<void> {
  return ensureRunWritableInternal({
    runId,
    requestedOperationId,
    writeLocks: context.writeLocks,
    runs: context.runs,
    now: context.now,
    markOperationState: (lockedRunId, operationId, state) =>
      markOperationStateInStore(context, lockedRunId, operationId, state),
    clearRunOperationPointer: (lockedRunId) => clearRunOperationPointerInStore(context, lockedRunId),
    reloadFromDisk: context.reloadFromDisk
  });
}
