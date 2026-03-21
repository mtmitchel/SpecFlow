import process from "node:process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BundleGenerator } from "../../bundle/bundle-generator.js";
import { ArtifactStore } from "../../store/artifact-store.js";
import { printOutput } from "../output.js";
import type { AgentTarget, OutputFormat } from "../types.js";

export const runExportBundleCommand = async (options: {
  ticket: string;
  agent: AgentTarget;
  format: OutputFormat;
  operationId?: string;
}): Promise<void> => {
  const rootDir = process.cwd();
  const operationId = options.operationId ?? `op-${randomUUID()}`;

  const store = new ArtifactStore({ rootDir });
  await store.initialize();

  try {
    const generator = new BundleGenerator({ rootDir, store });
    const local = await generator.exportBundle({
      ticketId: options.ticket,
      agentTarget: options.agent,
      exportMode: "standard",
      operationId
    });
    const promptPath = path.join(local.bundlePath, "PROMPT.md");
    const bundleText = await readFile(promptPath, "utf8");

    printOutput(options.format, local, () => {
      return [`Export complete`, `bundlePath: ${local.bundlePath}`, "", bundleText].join("\n");
    });
  } finally {
    await store.close();
  }
};
