import { describe, expect, it } from "vitest";
import { getDecisionTypeLabel, normalizeDecisionType } from "./planning-decision-types.js";

describe("planning decision types", () => {
  it("normalizes the legacy verification alias to quality-strategy", () => {
    expect(normalizeDecisionType("verification")).toBe("quality-strategy");
    expect(normalizeDecisionType("quality-strategy")).toBe("quality-strategy");
  });

  it("renders the same user-facing label for legacy and canonical quality strategy types", () => {
    expect(getDecisionTypeLabel("verification")).toBe("Quality strategy");
    expect(getDecisionTypeLabel("quality-strategy")).toBe("Quality strategy");
  });

  it("uses the updated flow labels for the planning survey", () => {
    expect(getDecisionTypeLabel("journey")).toBe("Primary flow");
    expect(getDecisionTypeLabel("branch")).toBe("Alternate path");
    expect(getDecisionTypeLabel("state")).toBe("Flow condition");
    expect(getDecisionTypeLabel("failure-mode")).toBe("Failure or degraded path");
  });
});
