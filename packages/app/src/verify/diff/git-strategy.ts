import { simpleGit } from "simple-git";
import type { DriftFlag } from "../../types/entities.js";
import { buildRevisionArgs, buildScopedArgs, normalizeRelativePath } from "./path-utils.js";
import type { DiffComputationResult, DiffSourceSelection } from "./types.js";

const GIT_REPOSITORY_ENV_KEYS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_PREFIX",
  "GIT_SUPER_PREFIX",
] as const;

const createGit = (baseDir: string) => {
  const env = { ...process.env };
  for (const key of GIT_REPOSITORY_ENV_KEYS) {
    delete env[key];
  }

  return simpleGit({ baseDir }).env(env);
};

export const isGitRepository = async (rootDir: string): Promise<boolean> => {
  const git = createGit(rootDir);
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
  const git = createGit(input.rootDir);
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
        description: "File changed outside primary ticket scope",
        severity: "critical"
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

  const unexpectedFiles = driftFlags
    .filter((f) => f.type === "unexpected-file")
    .map((f) => f.file)
    .slice(0, 5);
  let unexpectedDiff: string | undefined;
  if (unexpectedFiles.length > 0) {
    const rawDiff = await git.diff([...revisionArgs, "--", ...unexpectedFiles]);
    const lines = rawDiff.split("\n");
    unexpectedDiff = lines.length > 200
      ? lines.slice(0, 200).join("\n") + "\n...(truncated)"
      : rawDiff || undefined;
  }

  return {
    diffSource: "git",
    primaryDiff,
    driftDiff,
    unexpectedDiff,
    initialScopePaths: [...input.initialScopePaths],
    widenedScopePaths: widenedOnly,
    changedFiles,
    driftFlags
  };
};
