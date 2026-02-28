import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AtomicWriteCrashError, writeFileAtomic } from "../src/io/atomic-write.js";

describe("writeFileAtomic", () => {
  it("preserves original file on simulated crash and leaves .tmp file", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-atomic-"));
    const filePath = path.join(rootDir, "example.yaml");

    await writeFile(filePath, "version: 1\n", "utf8");

    await expect(
      writeFileAtomic(filePath, "version: 2\n", { simulateCrashAfterTempWrite: true })
    ).rejects.toBeInstanceOf(AtomicWriteCrashError);

    const persisted = await readFile(filePath, "utf8");
    expect(persisted).toBe("version: 1\n");

    const temp = await readFile(`${filePath}.tmp`, "utf8");
    expect(temp).toBe("version: 2\n");
  });
});
