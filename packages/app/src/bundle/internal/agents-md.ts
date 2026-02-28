import { readFile } from "node:fs/promises";
import path from "node:path";

export const readAgentsMd = async (rootDir: string, repoInstructionFile?: string): Promise<string> => {
  const configuredPath = repoInstructionFile || "specflow/AGENTS.md";
  const absolutePath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(rootDir, configuredPath);

  try {
    return await readFile(absolutePath, "utf8");
  } catch {
    return "";
  }
};
