import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DiffEngine } from "../src/verify/diff-engine.js";

const now = "2026-02-27T20:00:00.000Z";

const createSpecflowLayout = async (rootDir: string): Promise<void> => {
  await mkdir(path.join(rootDir, "specflow", "initiatives"), { recursive: true });
  await mkdir(path.join(rootDir, "specflow", "tickets"), { recursive: true });
  await mkdir(path.join(rootDir, "specflow", "runs"), { recursive: true });
  await mkdir(path.join(rootDir, "specflow", "decisions"), { recursive: true });
  await writeFile(path.join(rootDir, "specflow", "AGENTS.md"), "Always verify carefully.\n", "utf8");
};

const withInheritedGitRepoEnv = async (run: () => Promise<void>): Promise<void> => {
  const previous = {
    GIT_DIR: process.env.GIT_DIR,
    GIT_WORK_TREE: process.env.GIT_WORK_TREE,
  };

  process.env.GIT_DIR = execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-dir"],
    { cwd: process.cwd(), encoding: "utf8" },
  ).trim();
  process.env.GIT_WORK_TREE = execFileSync(
    "git",
    ["rev-parse", "--show-toplevel"],
    { cwd: process.cwd(), encoding: "utf8" },
  ).trim();

  try {
    await run();
  } finally {
    if (previous.GIT_DIR === undefined) {
      delete process.env.GIT_DIR;
    } else {
      process.env.GIT_DIR = previous.GIT_DIR;
    }

    if (previous.GIT_WORK_TREE === undefined) {
      delete process.env.GIT_WORK_TREE;
    } else {
      process.env.GIT_WORK_TREE = previous.GIT_WORK_TREE;
    }
  }
};

describe("DiffEngine git strategy", () => {
  it("ignores inherited git hook repository env for non-repo snapshot diffs", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-diff-hook-env-"));
    await createSpecflowLayout(rootDir);
    await mkdir(path.join(rootDir, "src"), { recursive: true });

    const runId = "run-1";
    const baselineAttemptId = "attempt-base";

    await mkdir(
      path.join(rootDir, "specflow", "runs", runId, "attempts", baselineAttemptId, "snapshot-before", "src"),
      { recursive: true },
    );

    await writeFile(
      path.join(rootDir, "specflow", "runs", runId, "attempts", baselineAttemptId, "snapshot-before", "src", "a.ts"),
      "export const a = 1;\n",
      "utf8",
    );
    await writeFile(path.join(rootDir, "src", "a.ts"), "export const a = 2;\n", "utf8");

    try {
      await withInheritedGitRepoEnv(async () => {
        const engine = new DiffEngine({ rootDir });
        const result = await engine.computeDiff({
          ticket: {
            id: "ticket-1",
            initiativeId: null,
            phaseId: null,
            title: "Verify snapshot fallback",
            description: "Ensure snapshot diff stays isolated from hook git env.",
            status: "ready",
            acceptanceCriteria: [],
            implementationPlan: "",
            fileTargets: ["src/a.ts"],
            runId: null,
            createdAt: now,
            updatedAt: now,
          },
          runId,
          baselineAttemptId,
          widenedScopePaths: [],
        });

        expect(result.diffSource).toBe("snapshot");
        expect(result.primaryDiff).toContain("a/src/a.ts");
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
