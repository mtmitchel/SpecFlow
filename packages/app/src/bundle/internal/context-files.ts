import path from "node:path";
import type { SpecDocument } from "../../types/entities.js";
import type { BundleContextFile } from "../types.js";

export const collectContextFiles = (input: {
  initiativeId: string | null;
  specs: Iterable<SpecDocument>;
}): BundleContextFile[] => {
  const files: BundleContextFile[] = [];

  if (!input.initiativeId) {
    return files;
  }

  const specs = Array.from(input.specs).filter(
    (spec) => spec.initiativeId === input.initiativeId && spec.type !== "decision"
  );

  for (const spec of specs) {
    const fileName = path.basename(spec.sourcePath);
    files.push({
      relativePath: `specs/${fileName}`,
      content: spec.content
    });
  }

  return files;
};
