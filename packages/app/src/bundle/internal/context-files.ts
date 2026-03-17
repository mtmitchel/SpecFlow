import path from "node:path";
import type { SpecDocument, SpecDocumentSummary } from "../../types/entities.js";
import type { BundleContextFile } from "../types.js";

export const collectContextFiles = async (input: {
  initiativeId: string | null;
  specs: Iterable<SpecDocumentSummary>;
  readSpec: (specId: string) => Promise<SpecDocument | null>;
}): Promise<BundleContextFile[]> => {
  const files: BundleContextFile[] = [];

  if (!input.initiativeId) {
    return files;
  }

  const specs = Array.from(input.specs).filter(
    (spec) => spec.initiativeId === input.initiativeId && spec.type !== "decision"
  );

  for (const specSummary of specs) {
    const spec = await input.readSpec(specSummary.id);
    if (!spec) {
      continue;
    }

    const fileName = path.basename(spec.sourcePath);
    files.push({
      relativePath: `specs/${fileName}`,
      content: spec.content
    });
  }

  return files;
};
