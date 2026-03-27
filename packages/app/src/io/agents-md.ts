import { readFile } from "node:fs/promises";
import path from "node:path";
import { isContainedPath } from "../validation.js";
import { normalizeRelativePath } from "../verify/diff/path-utils.js";
import { specflowDir } from "./paths.js";

export const loadAgentsMd = async (rootDir: string, repoInstructionFile?: string): Promise<string> => {
  const configuredPath = repoInstructionFile || "specflow/AGENTS.md";

  if (!path.isAbsolute(configuredPath)) {
    const normalized = normalizeRelativePath(configuredPath);
    if (normalized) {
      const absolutePath = path.join(rootDir, normalized);
      if (isContainedPath(rootDir, absolutePath)) {
        try {
          return await readFile(absolutePath, "utf8");
        } catch {
          // fall through to fallback
        }
      }
    }
  }

  // Fallback: specflow/AGENTS.md -> AGENTS.md -> empty
  try {
    return await readFile(path.join(specflowDir(rootDir), "AGENTS.md"), "utf8");
  } catch {
    try {
      return await readFile(path.join(rootDir, "AGENTS.md"), "utf8");
    } catch (err) {
      console.warn("[agents-md] could not read instruction file:", (err as Error).message);
      return "";
    }
  }
};
