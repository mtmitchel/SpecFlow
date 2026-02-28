import { readFile } from "node:fs/promises";
import path from "node:path";
import { specflowDir } from "../../io/paths.js";

export const loadPlannerAgentsMd = async (rootDir: string, repoInstructionFile: string): Promise<string> => {
  const configuredPath = repoInstructionFile || "specflow/AGENTS.md";
  const absolutePath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(rootDir, configuredPath);

  try {
    return await readFile(absolutePath, "utf8");
  } catch {
    const fallbackPath = path.join(specflowDir(rootDir), "AGENTS.md");
    try {
      return await readFile(fallbackPath, "utf8");
    } catch {
      return "";
    }
  }
};
