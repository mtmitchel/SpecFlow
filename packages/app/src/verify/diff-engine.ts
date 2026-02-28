import { readFile } from "node:fs/promises";
import path from "node:path";
import { createTwoFilesPatch } from "diff";
import { simpleGit } from "simple-git";
import type { DriftFlag, Ticket } from "../types/entities.js";

export interface DiffComputationInput {
  ticket: Ticket;
  runId: string;
  baselineAttemptId: string | null;
  scopePaths?: string[];
  widenedScopePaths: string[];
  diffSource?: DiffSourceSelection;
}

export type DiffSourceSelection =
  | { mode: "auto" }
  | { mode: "branch"; branch: string }
  | { mode: "commit-range"; from: string; to: string }
  | { mode: "snapshot" };

export interface DiffComputationResult {
  diffSource: "git" | "snapshot";
  primaryDiff: string;
  driftDiff: string | null;
  initialScopePaths: string[];
  widenedScopePaths: string[];
  changedFiles: string[];
  driftFlags: DriftFlag[];
}

export interface DiffEngineOptions {
  rootDir: string;
}

export class DiffEngine {
  private readonly rootDir: string;

  public constructor(options: DiffEngineOptions) {
    this.rootDir = options.rootDir;
  }

  public async computeDiff(input: DiffComputationInput): Promise<DiffComputationResult> {
    const initialScopePaths = this.normalizeScopePaths(input.scopePaths ?? input.ticket.fileTargets);
    const diffSource = input.diffSource ?? { mode: "auto" };
    const inGitRepo = await this.isGitRepository();
    if (inGitRepo && diffSource.mode !== "snapshot") {
      return this.computeGitDiff({
        ticket: input.ticket,
        initialScopePaths,
        widenedScopePaths: input.widenedScopePaths,
        diffSource
      });
    }

    return this.computeSnapshotDiff(
      input.ticket,
      input.runId,
      input.baselineAttemptId,
      initialScopePaths,
      input.widenedScopePaths
    );
  }

  private async isGitRepository(): Promise<boolean> {
    const git = simpleGit({ baseDir: this.rootDir });
    try {
      return await git.checkIsRepo();
    } catch {
      return false;
    }
  }

  private async computeGitDiff(input: {
    ticket: Ticket;
    initialScopePaths: string[];
    widenedScopePaths: string[];
    diffSource: Exclude<DiffSourceSelection, { mode: "snapshot" }>;
  }): Promise<DiffComputationResult> {
    const git = simpleGit({ baseDir: this.rootDir });
    const revisionArgs = this.buildRevisionArgs(input.diffSource);
    const scopeArgs = this.buildScopedArgs(input.initialScopePaths);
    const widenedOnly = input.widenedScopePaths
      .map((entry) => this.normalizeRelativePath(entry))
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
  }

  private async computeSnapshotDiff(
    _ticket: Ticket,
    runId: string,
    baselineAttemptId: string | null,
    initialScopePaths: string[],
    widenedScopePaths: string[]
  ): Promise<DiffComputationResult> {
    if (!baselineAttemptId) {
      throw new Error(`No baseline attempt found for run ${runId}`);
    }

    const primaryPatches: string[] = [];
    const driftPatches: string[] = [];
    const driftFlags: DriftFlag[] = [];
    const changedFiles = new Set<string>();

    for (const target of initialScopePaths) {
      const normalized = this.normalizeRelativePath(target);
      if (!normalized) {
        continue;
      }

      const before = await this.readSnapshotFile(runId, baselineAttemptId, normalized);
      const after = await this.readCurrentFile(normalized);

      if (before === null && after !== "") {
        driftFlags.push({
          type: "pre-capture-drift",
          file: normalized,
          description: "File existed at capture but was absent in export baseline"
        });
      }

      if (before !== after) {
        primaryPatches.push(this.makePatch(normalized, before ?? "", after));
        changedFiles.add(normalized);
      }
    }

    const widenedOnly: string[] = [];
    for (const widenedPath of widenedScopePaths) {
      const normalized = this.normalizeRelativePath(widenedPath);
      if (!normalized) {
        continue;
      }

      if (!initialScopePaths.includes(normalized)) {
        widenedOnly.push(normalized);
      }
    }

    for (const widened of widenedOnly) {
      const before = await this.readSnapshotFile(runId, baselineAttemptId, widened);
      const after = await this.readCurrentFile(widened);

      if (before !== after) {
        driftPatches.push(this.makePatch(widened, before ?? "", after));
        changedFiles.add(widened);
        driftFlags.push({
          type: "widened-scope-drift",
          file: widened,
          description: "Detected delta in widened scope path"
        });
      }
    }

    return {
      diffSource: "snapshot",
      primaryDiff: primaryPatches.join("\n"),
      driftDiff: driftPatches.length > 0 ? driftPatches.join("\n") : null,
      initialScopePaths: [...initialScopePaths],
      widenedScopePaths: widenedOnly,
      changedFiles: Array.from(changedFiles),
      driftFlags
    };
  }

  private makePatch(filePath: string, before: string, after: string): string {
    return createTwoFilesPatch(`a/${filePath}`, `b/${filePath}`, before, after, "baseline", "capture");
  }

  private async readSnapshotFile(
    runId: string,
    baselineAttemptId: string,
    relativePath: string
  ): Promise<string | null> {
    const snapshotPath = path.join(
      this.rootDir,
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
    } catch {
      return null;
    }
  }

  private async readCurrentFile(relativePath: string): Promise<string> {
    const target = path.join(this.rootDir, relativePath);
    try {
      return await readFile(target, "utf8");
    } catch {
      return "";
    }
  }

  private normalizeRelativePath(rawPath: string): string | null {
    const normalized = path.posix.normalize(rawPath.replaceAll("\\", "/"));
    if (normalized.startsWith("../") || path.isAbsolute(normalized)) {
      return null;
    }

    return normalized;
  }

  private normalizeScopePaths(scopePaths: string[]): string[] {
    const normalized = scopePaths
      .map((entry) => this.normalizeRelativePath(entry))
      .filter((entry): entry is string => Boolean(entry));

    return Array.from(new Set(normalized));
  }

  private buildRevisionArgs(diffSource: Exclude<DiffSourceSelection, { mode: "snapshot" }>): string[] {
    if (diffSource.mode === "branch") {
      return [`${diffSource.branch || "main"}...HEAD`];
    }

    if (diffSource.mode === "commit-range") {
      return [`${diffSource.from}..${diffSource.to}`];
    }

    return [];
  }

  private buildScopedArgs(scopePaths: string[]): string[] {
    if (scopePaths.length === 0) {
      return [];
    }

    return ["--", ...scopePaths];
  }
}
