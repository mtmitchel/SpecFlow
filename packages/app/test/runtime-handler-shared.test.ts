import { describe, expect, it } from "vitest";
import { REVIEW_KINDS } from "../src/planner/workflow-contract.js";
import { requirePlanningReviewKind } from "../src/runtime/handlers/shared.js";

describe("requirePlanningReviewKind", () => {
  it("accepts every centralized review kind", () => {
    for (const reviewKind of REVIEW_KINDS) {
      expect(requirePlanningReviewKind(reviewKind)).toBe(reviewKind);
    }
  });

  it("rejects unsupported review kinds", () => {
    expect(() => requirePlanningReviewKind("not-a-review-kind")).toThrow("Unsupported review kind");
  });
});
