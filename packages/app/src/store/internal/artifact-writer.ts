import path from "node:path";
import { writeFileAtomic } from "../../io/atomic-write.js";
import { writeYamlFile } from "../../io/yaml.js";
import type { PreparedOperationArtifacts } from "../types.js";

export const writePreparedArtifacts = async (
  stagedAttemptDir: string,
  artifacts: PreparedOperationArtifacts
): Promise<void> => {
  if (artifacts.bundleFlat !== undefined) {
    await writeFileAtomic(path.join(stagedAttemptDir, "bundle-flat.md"), artifacts.bundleFlat);
  }

  if (artifacts.bundleManifest !== undefined) {
    await writeYamlFile(path.join(stagedAttemptDir, "bundle-manifest.yaml"), artifacts.bundleManifest);
  }

  if (artifacts.primaryDiff !== undefined) {
    await writeFileAtomic(path.join(stagedAttemptDir, "diff-primary.patch"), artifacts.primaryDiff);
  }

  if (artifacts.driftDiff !== undefined) {
    await writeFileAtomic(path.join(stagedAttemptDir, "diff-drift.patch"), artifacts.driftDiff);
  }

  if (artifacts.verification !== undefined) {
    await writeFileAtomic(
      path.join(stagedAttemptDir, "verification.json"),
      JSON.stringify(artifacts.verification, null, 2)
    );
  }

  for (const file of artifacts.additionalFiles ?? []) {
    const destination = path.resolve(stagedAttemptDir, file.relativePath);
    const normalizedStagedRoot = `${path.resolve(stagedAttemptDir)}${path.sep}`;
    if (!destination.startsWith(normalizedStagedRoot)) {
      throw new Error(`Invalid staged artifact path '${file.relativePath}'`);
    }

    await writeFileAtomic(destination, file.content);
  }
};
