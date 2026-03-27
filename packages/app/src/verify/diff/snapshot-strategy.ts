import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DriftFlag } from "../../types/entities.js";
import { normalizeRelativePath } from "./path-utils.js";
import { makePatch } from "./patch-utils.js";
import type { DiffComputationResult } from "./types.js";

const readSnapshotFile = async (
  rootDir: string,
  runId: string,
  baselineAttemptId: string,
  relativePath: string
): Promise<string | null> => {
  const snapshotPath = path.join(
    rootDir,
    "specflow",
    "runs",
    runId,
    "attempts",
    baselineAttemptId,
    "snapshot-before",
    relativePath
  );

  try {
    return await readFile(snapshotPath, "utf8");
  } catch { // catch-ok: snapshot file may not exist, caller handles null
    return null;
  }
};

const readCurrentFile = async (rootDir: string, relativePath: string): Promise<string> => {
  const target = path.join(rootDir, relativePath);
  try {
    return await readFile(target, "utf8");
  } catch { // catch-ok: current file may not exist (deleted), empty string is valid diff input
    return "";
  }
};

export const computeSnapshotDiff = async (input: {
  rootDir: string;
  runId: string;
  baselineAttemptId: string | null;
  initialScopePaths: string[];
  widenedScopePaths: string[];
}): Promise<DiffComputationResult> => {
  if (!input.baselineAttemptId) {
    throw new Error(`No baseline attempt found for run ${input.runId}`);
  }

  const primaryPatches: string[] = [];
  const driftPatches: string[] = [];
  const driftFlags: DriftFlag[] = [];
  const changedFiles = new Set<string>();

  for (const target of input.initialScopePaths) {
    const normalized = normalizeRelativePath(target);
    if (!normalized) {
      continue;
    }

    const before = await readSnapshotFile(input.rootDir, input.runId, input.baselineAttemptId, normalized);
    const after = await readCurrentFile(input.rootDir, normalized);

    if (before === null && after !== "") {
      driftFlags.push({
        type: "pre-capture-drift",
        file: normalized,
        description: "File existed at capture but was absent in export baseline"
      });
    }

    if (before !== after) {
      primaryPatches.push(makePatch(normalized, before ?? "", after));
      changedFiles.add(normalized);
    }
  }

  const widenedOnly: string[] = [];
  for (const widenedPath of input.widenedScopePaths) {
    const normalized = normalizeRelativePath(widenedPath);
    if (!normalized) {
      continue;
    }

    if (!input.initialScopePaths.includes(normalized)) {
      widenedOnly.push(normalized);
    }
  }

  for (const widened of widenedOnly) {
    const before = await readSnapshotFile(input.rootDir, input.runId, input.baselineAttemptId, widened);
    const after = await readCurrentFile(input.rootDir, widened);

    if (before !== after) {
      driftPatches.push(makePatch(widened, before ?? "", after));
      changedFiles.add(widened);
      driftFlags.push({
        type: "widened-scope-drift",
        file: widened,
        description: "Detected delta in widened scope path"
      });
    }
  }

  driftFlags.push({
    type: "snapshot-partial-scope",
    file: "(scope-wide)",
    description: "Snapshot verification only covers explicitly scoped files; changes outside scope are not detectable",
    severity: "major"
  });

  return {
    diffSource: "snapshot",
    primaryDiff: primaryPatches.join("\n"),
    driftDiff: driftPatches.length > 0 ? driftPatches.join("\n") : null,
    unexpectedDiff: undefined,
    initialScopePaths: [...input.initialScopePaths],
    widenedScopePaths: widenedOnly,
    changedFiles: Array.from(changedFiles),
    driftFlags
  };
};
