import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSpecFlowRuntime } from "../src/runtime/create-runtime.js";

const createSpecflowLayout = async (rootDir: string): Promise<void> => {
  await mkdir(path.join(rootDir, "specflow", "initiatives"), { recursive: true });
  await mkdir(path.join(rootDir, "specflow", "tickets"), { recursive: true });
  await mkdir(path.join(rootDir, "specflow", "runs"), { recursive: true });
  await mkdir(path.join(rootDir, "specflow", "decisions"), { recursive: true });
};

describe("runtime config migration", () => {
  it("migrates a legacy config apiKey into .env and scrubs config.yaml", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-runtime-config-"));
    await createSpecflowLayout(rootDir);

    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    await writeFile(
      path.join(rootDir, "specflow", "config.yaml"),
      [
        "provider: openai",
        "model: gpt-5-mini",
        "port: 3141",
        "host: 127.0.0.1",
        "repoInstructionFile: specflow/AGENTS.md",
        "apiKey: legacy-openai-key"
      ].join("\n"),
      "utf8"
    );

    try {
      const runtime = await createSpecFlowRuntime({ rootDir });
      const envContents = await readFile(path.join(rootDir, ".env"), "utf8");
      const configContents = await readFile(path.join(rootDir, "specflow", "config.yaml"), "utf8");

      expect(envContents).toContain("OPENAI_API_KEY=");
      expect(envContents).toContain("legacy-openai-key");
      expect(configContents).not.toContain("apiKey:");
      expect(runtime.store.config).toMatchObject({
        provider: "openai",
        model: "gpt-5-mini",
        port: 3141,
        host: "127.0.0.1"
      });

      await runtime.close();
      await rm(rootDir, { recursive: true, force: true });
    } finally {
      if (previousOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousOpenAiKey;
      }
    }
  });

  it("keeps an existing env key as the source of truth while still scrubbing legacy config.yaml secrets", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "specflow-runtime-config-env-"));
    await createSpecflowLayout(rootDir);

    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "env-openai-key";

    await writeFile(
      path.join(rootDir, "specflow", "config.yaml"),
      [
        "provider: openai",
        "model: gpt-5-mini",
        "port: 3141",
        "host: 127.0.0.1",
        "repoInstructionFile: specflow/AGENTS.md",
        "apiKey: legacy-openai-key"
      ].join("\n"),
      "utf8"
    );

    try {
      const runtime = await createSpecFlowRuntime({ rootDir });
      const configContents = await readFile(path.join(rootDir, "specflow", "config.yaml"), "utf8");

      expect(configContents).not.toContain("apiKey:");
      await expect(access(path.join(rootDir, ".env"))).rejects.toMatchObject({ code: "ENOENT" });
      expect(process.env.OPENAI_API_KEY).toBe("env-openai-key");

      await runtime.close();
      await rm(rootDir, { recursive: true, force: true });
    } finally {
      if (previousOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousOpenAiKey;
      }
    }
  });
});
