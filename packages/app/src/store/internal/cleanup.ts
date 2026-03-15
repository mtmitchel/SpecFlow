import { rm, stat } from "node:fs/promises";
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
        try {
          const dirStat = await stat(opPath);
          if (store.now().getTime() - dirStat.ctimeMs > store.cleanupTtlMs) {
            await rm(opPath, { recursive: true, force: true });
          }
        } catch { /* dir already gone */ }
        continue;
      }

      const isPreparedAndExpired =
        manifest.state === "prepared" &&
        manifest.leaseExpiresAt &&
        Date.parse(manifest.leaseExpiresAt) <= store.now().getTime();

      if (
        manifest.state !== "abandoned" &&
        manifest.state !== "superseded" &&
        !isPreparedAndExpired
      ) {
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
