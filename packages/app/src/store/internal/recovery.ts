import { attemptDir, operationDir, runYamlPath } from "../../io/paths.js";
import { writeYamlFile } from "../../io/yaml.js";
import { pathExists } from "./fs-utils.js";
import type { OperationManifest, OperationState, Run } from "../../types/entities.js";

export interface RecoveryStoreContext {
  rootDir: string;
  runs: Map<string, Run>;
  markOperationState: (runId: string, operationId: string, state: OperationState) => Promise<OperationManifest>;
  clearRunOperationPointer: (runId: string) => Promise<void>;
}

export const recoverOrphanOperations = async (store: RecoveryStoreContext): Promise<void> => {
  for (const run of store.runs.values()) {
    if (!run.activeOperationId) {
      continue;
    }

    const opId = run.activeOperationId;
    const opDir = operationDir(store.rootDir, run.id, opId);
    const hasTmp = await pathExists(opDir);

    if (!hasTmp) {
      await store.markOperationState(run.id, opId, "failed");
      await store.clearRunOperationPointer(run.id);
      continue;
    }

    const committedAttemptExists =
      run.committedAttemptId !== null &&
      (await pathExists(attemptDir(store.rootDir, run.id, run.committedAttemptId)));

    if (committedAttemptExists) {
      await store.markOperationState(run.id, opId, "superseded");
      await store.clearRunOperationPointer(run.id);
      continue;
    }

    await store.markOperationState(run.id, opId, "abandoned");
    await store.clearRunOperationPointer(run.id);
  }
};

export const clearRunOperationPointer = async (
  rootDir: string,
  runs: Map<string, Run>,
  runId: string
): Promise<void> => {
  const run = runs.get(runId);
  if (!run) {
    return;
  }

  const updatedRun: Run = {
    ...run,
    activeOperationId: null,
    operationLeaseExpiresAt: null
  };

  await writeYamlFile(runYamlPath(rootDir, runId), updatedRun);
  runs.set(runId, updatedRun);
};
