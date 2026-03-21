import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createInitiativeWorkflow } from "../src/planner/workflow-state.js";
import {
  InitiativeWriteCrashError,
  recoverInterruptedInitiativeWrites,
  writeInitiativeWithStaging,
} from "../src/store/internal/store-writer.js";
import type { Initiative } from "../src/types/entities.js";

const now = "2026-03-22T00:00:00.000Z";

const makeInitiative = (overrides: Partial<Initiative> = {}): Initiative => ({
  id: "initiative-1",
  title: "Planning shell",
  description: "Keep project planning consistent.",
  status: "active",
  phases: [{ id: "phase-1", name: "Foundation", order: 1, status: "active" }],
  specIds: ["initiative-1:brief", "initiative-1:core-flows"],
  ticketIds: [],
  workflow: createInitiativeWorkflow(),
  createdAt: now,
  updatedAt: now,
  ...overrides
});

const createInitiativeDir = async (rootDir: string, initiativeId: string): Promise<string> => {
  const dir = path.join(rootDir, "specflow", "initiatives", initiativeId);
  await mkdir(path.join(dir, "reviews"), { recursive: true });
  return dir;
};

describe("store initiative writer", () => {
  it("preserves untouched initiative files while staging document updates", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-initiative-write-"));
    const dir = await createInitiativeDir(rootDir, "initiative-1");

    await writeFile(path.join(dir, "initiative.yaml"), "title: Old title\n");
    await writeFile(path.join(dir, "brief.md"), "# Old brief\n");
    await writeFile(path.join(dir, "core-flows.md"), "# Old core flows\n");
    await writeFile(path.join(dir, "reviews", "brief-review.yaml"), "status: passed\n");
    const originalCoreFlowsMtimeMs = (await stat(path.join(dir, "core-flows.md"))).mtimeMs;

    await writeInitiativeWithStaging({
      rootDir,
      initiative: makeInitiative({ title: "New title" }),
      docs: {
        brief: "# New brief\n"
      }
    });

    expect(await readFile(path.join(dir, "initiative.yaml"), "utf8")).toContain("title: New title");
    expect(await readFile(path.join(dir, "brief.md"), "utf8")).toBe("# New brief\n");
    expect(await readFile(path.join(dir, "core-flows.md"), "utf8")).toBe("# Old core flows\n");
    expect(await readFile(path.join(dir, "reviews", "brief-review.yaml"), "utf8")).toBe("status: passed\n");
    expect(Math.abs((await stat(path.join(dir, "core-flows.md"))).mtimeMs - originalCoreFlowsMtimeMs)).toBeLessThan(1);

    await rm(rootDir, { recursive: true, force: true });
  });

  it("restores the previous initiative directory after an interrupted swap", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-initiative-recover-"));
    const dir = await createInitiativeDir(rootDir, "initiative-1");

    await writeFile(path.join(dir, "initiative.yaml"), "title: Old title\n");
    await writeFile(path.join(dir, "brief.md"), "# Old brief\n");

    await expect(
      writeInitiativeWithStaging({
        rootDir,
        initiative: makeInitiative({ title: "New title" }),
        docs: {
          brief: "# New brief\n"
        },
        crashStep: "after-backup-rename"
      })
    ).rejects.toBeInstanceOf(InitiativeWriteCrashError);

    await recoverInterruptedInitiativeWrites(rootDir);

    expect(await readFile(path.join(dir, "initiative.yaml"), "utf8")).toContain("title: Old title");
    expect(await readFile(path.join(dir, "brief.md"), "utf8")).toBe("# Old brief\n");

    await rm(rootDir, { recursive: true, force: true });
  });
});
