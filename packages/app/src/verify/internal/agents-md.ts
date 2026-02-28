import { readFile } from "node:fs/promises";
import path from "node:path";

export const readVerifierAgentsMd = async (rootDir: string, repoInstructionFile: string): Promise<string> => {
  const configuredPath = path.isAbsolute(repoInstructionFile)
    ? repoInstructionFile
    : path.join(rootDir, repoInstructionFile);

  try {
    return await readFile(configuredPath, "utf8");
  } catch {
    return "";
  }
};
