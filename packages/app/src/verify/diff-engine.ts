import { computeGitDiff, isGitRepository } from "./diff/git-strategy.js";
import { normalizeScopePaths } from "./diff/path-utils.js";
import { computeSnapshotDiff } from "./diff/snapshot-strategy.js";
import type { DiffComputationInput, DiffComputationResult } from "./diff/types.js";

export type {
  DiffComputationInput,
  DiffComputationResult,
  DiffSourceSelection
} from "./diff/types.js";

export interface DiffEngineOptions {
  rootDir: string;
}

export class DiffEngine {
  private readonly rootDir: string;

  public constructor(options: DiffEngineOptions) {
    this.rootDir = options.rootDir;
  }

  public async computeDiff(input: DiffComputationInput): Promise<DiffComputationResult> {
    const initialScopePaths = normalizeScopePaths(input.scopePaths ?? input.ticket.fileTargets);
    const diffSource = input.diffSource ?? { mode: "auto" };
    const rootDir = input.rootDir ?? this.rootDir;
    const inGitRepo = await isGitRepository(rootDir);

    if (inGitRepo && diffSource.mode !== "snapshot") {
      return computeGitDiff({
        rootDir,
        initialScopePaths,
        widenedScopePaths: input.widenedScopePaths,
        diffSource
      });
    }

    return computeSnapshotDiff({
      rootDir,
      runId: input.runId,
      baselineAttemptId: input.baselineAttemptId,
      initialScopePaths,
      widenedScopePaths: input.widenedScopePaths
    });
  }
}
