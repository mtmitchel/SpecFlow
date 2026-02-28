import { simpleGit } from "simple-git";
import type { DriftFlag } from "../../types/entities.js";
import { buildRevisionArgs, buildScopedArgs, normalizeRelativePath } from "./path-utils.js";
import type { DiffComputationResult, DiffSourceSelection } from "./types.js";

export const isGitRepository = async (rootDir: string): Promise<boolean> => {
  const git = simpleGit({ baseDir: rootDir });
  try {
    return await git.checkIsRepo();
  } catch {
    return false;
  }
};

export const computeGitDiff = async (input: {
  rootDir: string;
  initialScopePaths: string[];
  widenedScopePaths: string[];
  diffSource: Exclude<DiffSourceSelection, { mode: "snapshot" }>;
}): Promise<DiffComputationResult> => {
  const git = simpleGit({ baseDir: input.rootDir });
  const revisionArgs = buildRevisionArgs(input.diffSource);
  const scopeArgs = buildScopedArgs(input.initialScopePaths);
  const widenedOnly = input.widenedScopePaths
    .map((entry) => normalizeRelativePath(entry))
    .filter((entry): entry is string => Boolean(entry))
    .filter((entry) => !input.initialScopePaths.includes(entry));

  const primaryDiff = await git.diff([...revisionArgs, ...scopeArgs]);
  const changedFilesRaw = await git.diff([...revisionArgs, "--name-only"]);
  const changedFiles = changedFilesRaw
    .split("\n")
    .map((line: string) => line.trim())
    .filter(Boolean);

  const targetSet = new Set(input.initialScopePaths);
  const driftFlags: DriftFlag[] = [];

  for (const changedFile of changedFiles) {
    if (!targetSet.has(changedFile)) {
      driftFlags.push({
        type: "unexpected-file",
        file: changedFile,
        description: "File changed outside primary ticket scope"
      });
    }
  }

  for (const widened of widenedOnly) {
    driftFlags.push({
      type: "widened-scope-drift",
      file: widened,
      description: "Path was included as widened scope context"
    });
  }

  const driftDiff = widenedOnly.length > 0
    ? await git.diff([...revisionArgs, "--", ...widenedOnly])
    : null;

  return {
    diffSource: "git",
    primaryDiff,
    driftDiff,
    initialScopePaths: [...input.initialScopePaths],
    widenedScopePaths: widenedOnly,
    changedFiles,
    driftFlags
  };
};
