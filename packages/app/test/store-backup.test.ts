import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createStoreBackupFilename, saveStoreBackup } from "../src/io/store-backup.js";

describe("store backup", () => {
  const createdDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(createdDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("creates a stable backup filename", () => {
    expect(createStoreBackupFilename(new Date("2026-03-21T20:30:45.000Z"))).toBe("specflow-backup-20260321-203045.zip");
  });

  it("writes a ZIP archive for the specflow store", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-store-backup-"));
    createdDirs.push(rootDir);

    const specflowRoot = path.join(rootDir, "specflow");
    await mkdir(path.join(specflowRoot, "tickets"), { recursive: true });
    await writeFile(path.join(specflowRoot, "config.yaml"), "provider: anthropic\n");
    await writeFile(path.join(specflowRoot, "tickets", "ticket-1.yaml"), "id: ticket-1\n");

    const destination = path.join(rootDir, "backups", "specflow.zip");
    const savedPath = await saveStoreBackup(rootDir, destination);
    const zipBytes = await readFile(savedPath);

    expect(savedPath).toBe(destination);
    expect(zipBytes.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(zipBytes.length).toBeGreaterThan(0);
  });
});
