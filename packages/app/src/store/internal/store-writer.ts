import { cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { writeFileAtomic } from "../../io/atomic-write.js";
import { specflowDir } from "../../io/paths.js";
import { writeYamlFile } from "../../io/yaml.js";
import type { Initiative } from "../../types/entities.js";
import { initiativeDir } from "../../io/paths.js";
import { pathExists } from "./fs-utils.js";

export interface InitiativeDocumentWriteInput {
  brief?: string;
  coreFlows?: string;
  prd?: string;
  techSpec?: string;
}

export type InitiativeWriteCrashStep = "after-backup-rename";

export class InitiativeWriteCrashError extends Error {
  public readonly step: InitiativeWriteCrashStep;

  public constructor(step: InitiativeWriteCrashStep) {
    super(`Simulated initiative write crash at ${step}`);
    this.name = "InitiativeWriteCrashError";
    this.step = step;
  }
}

const initiativeWriteRoot = (rootDir: string): string =>
  path.join(specflowDir(rootDir), ".store-tmp", "initiative-writes");

const initiativeStageDir = (rootDir: string, initiativeId: string): string =>
  path.join(initiativeWriteRoot(rootDir), `${initiativeId}.stage`);

const initiativeBackupDir = (rootDir: string, initiativeId: string): string =>
  path.join(initiativeWriteRoot(rootDir), `${initiativeId}.backup`);

const writeOptionalDoc = async (filePath: string, content: string | undefined): Promise<void> => {
  if (content === undefined) {
    return;
  }

  await writeFileAtomic(filePath, content);
};

const removeIfExists = async (targetPath: string): Promise<void> => {
  await rm(targetPath, { recursive: true, force: true });
};

const restoreBackupIfNeeded = async (rootDir: string, initiativeId: string): Promise<void> => {
  const finalDir = initiativeDir(rootDir, initiativeId);
  const backupDir = initiativeBackupDir(rootDir, initiativeId);
  if (await pathExists(finalDir)) {
    return;
  }

  if (await pathExists(backupDir)) {
    await rename(backupDir, finalDir);
  }
};

export const recoverInterruptedInitiativeWrites = async (
  rootDir: string,
  initiativeId?: string
): Promise<void> => {
  const tempRoot = initiativeWriteRoot(rootDir);
  await mkdir(tempRoot, { recursive: true });

  const candidateIds = initiativeId
    ? [initiativeId]
    : Array.from(
        new Set(
          (await readdir(tempRoot, { withFileTypes: true }))
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .filter((name) => name.endsWith(".stage") || name.endsWith(".backup"))
            .map((name) => name.replace(/\.(stage|backup)$/, ""))
        )
      );

  for (const id of candidateIds) {
    const finalDir = initiativeDir(rootDir, id);
    const stageDir = initiativeStageDir(rootDir, id);
    const backupDir = initiativeBackupDir(rootDir, id);

    if (!(await pathExists(finalDir)) && await pathExists(backupDir)) {
      await rename(backupDir, finalDir);
    }

    if (await pathExists(backupDir)) {
      await removeIfExists(backupDir);
    }

    if (await pathExists(stageDir)) {
      await removeIfExists(stageDir);
    }
  }
};

export const writeInitiativeWithStaging = async (input: {
  rootDir: string;
  initiative: Initiative;
  docs: InitiativeDocumentWriteInput;
  suppressWatcher?: () => void;
  resumeWatcher?: () => void;
  crashStep?: InitiativeWriteCrashStep;
}): Promise<void> => {
  await recoverInterruptedInitiativeWrites(input.rootDir, input.initiative.id);

  const finalDir = initiativeDir(input.rootDir, input.initiative.id);
  const tempRoot = initiativeWriteRoot(input.rootDir);
  const stageDir = initiativeStageDir(input.rootDir, input.initiative.id);
  const backupDir = initiativeBackupDir(input.rootDir, input.initiative.id);

  await mkdir(tempRoot, { recursive: true });
  await removeIfExists(stageDir);
  await removeIfExists(backupDir);

  if (await pathExists(finalDir)) {
    await cp(finalDir, stageDir, { recursive: true, preserveTimestamps: true });
  } else {
    await mkdir(stageDir, { recursive: true });
  }

  await writeYamlFile(path.join(stageDir, "initiative.yaml"), input.initiative);
  await writeOptionalDoc(path.join(stageDir, "brief.md"), input.docs.brief);
  await writeOptionalDoc(path.join(stageDir, "core-flows.md"), input.docs.coreFlows);
  await writeOptionalDoc(path.join(stageDir, "prd.md"), input.docs.prd);
  await writeOptionalDoc(path.join(stageDir, "tech-spec.md"), input.docs.techSpec);

  let watcherSuppressed = false;
  try {
    input.suppressWatcher?.();
    watcherSuppressed = true;

    if (await pathExists(finalDir)) {
      await rename(finalDir, backupDir);
      if (input.crashStep === "after-backup-rename") {
        throw new InitiativeWriteCrashError("after-backup-rename");
      }
    }

    await rename(stageDir, finalDir);
    await removeIfExists(backupDir);
  } catch (error) {
    if (!(error instanceof InitiativeWriteCrashError)) {
      await restoreBackupIfNeeded(input.rootDir, input.initiative.id);
      await removeIfExists(stageDir);
      await removeIfExists(backupDir);
    }
    throw error;
  } finally {
    if (watcherSuppressed) {
      input.resumeWatcher?.();
    }
  }
};
