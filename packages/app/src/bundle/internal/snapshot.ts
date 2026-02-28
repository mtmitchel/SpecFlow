import { readFile } from "node:fs/promises";
import path from "node:path";

export const captureSnapshotFiles = async (
  rootDir: string,
  fileTargets: string[]
): Promise<Array<{ relativePath: string; content: string }>> => {
  const files: Array<{ relativePath: string; content: string }> = [];

  for (const target of fileTargets) {
    const normalized = path.posix.normalize(target.replaceAll("\\", "/"));
    if (normalized.startsWith("../") || path.isAbsolute(normalized)) {
      continue;
    }

    const absolutePath = path.join(rootDir, normalized);

    try {
      const content = await readFile(absolutePath, "utf8");
      files.push({
        relativePath: `snapshot-before/${normalized}`,
        content
      });
    } catch {
      files.push({
        relativePath: `snapshot-before/${normalized}.missing`,
        content: "File did not exist at export time."
      });
    }
  }

  if (files.length === 0) {
    files.push({
      relativePath: "snapshot-before/.snapshot",
      content: "No file targets were available for baseline capture."
    });
  }

  return files;
};
