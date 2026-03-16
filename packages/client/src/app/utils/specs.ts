import type { SpecDocument } from "../../types";

export const getSpecMarkdown = (
  specs: SpecDocument[],
  initiativeId: string,
  type: "brief" | "core-flows" | "prd" | "tech-spec"
): string => specs.find((spec) => spec.initiativeId === initiativeId && spec.type === type)?.content ?? "";
