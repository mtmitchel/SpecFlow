import type { SpecDocument } from "../../types/entities.js";

export const specTypeToFileName = (type: SpecDocument["type"]): string => {
  switch (type) {
    case "brief":
      return "brief.md";
    case "prd":
      return "prd.md";
    case "tech-spec":
      return "tech-spec.md";
    case "decision":
      return "decision.md";
    default: {
      const exhaustive: never = type;
      throw new Error(`Unhandled spec type: ${String(exhaustive)}`);
    }
  }
};
