import { rm } from "node:fs/promises";
import { operationDir, operationManifestPath, runTmpDir, runsDir } from "../../io/paths.js";
import { readYamlFile } from "../../io/yaml.js";
import { listDirectoryNames } from "./fs-utils.js";
import type { OperationManifest } from "../../types/entities.js";

export interface CleanupStoreContext {
  rootDir: string;
  now: () => Date;
  cleanupTtlMs: number;
}

export const pruneExpiredTempOperations = async (store: CleanupStoreContext): Promise<void> => {
  const allRunDirs = await listDirectoryNames(runsDir(store.rootDir));

  for (const runId of allRunDirs) {
    const tmpRoot = runTmpDir(store.rootDir, runId);
    const operationIds = await listDirectoryNames(tmpRoot);

    for (const operationId of operationIds) {
      const opPath = operationDir(store.rootDir, runId, operationId);
      const manifest = await readYamlFile<OperationManifest>(operationManifestPath(store.rootDir, runId, operationId));

      if (!manifest) {
        continue;
      }

      if (manifest.state !== "abandoned" && manifest.state !== "superseded") {
        continue;
      }

      const updatedAt = Date.parse(manifest.updatedAt);
      if (Number.isNaN(updatedAt)) {
        continue;
      }

      if (store.now().getTime() - updatedAt > store.cleanupTtlMs) {
        await rm(opPath, { recursive: true, force: true });
      }
    }
  }
};
