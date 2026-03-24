import { describe, expect, it } from "vitest";
import { buildReviewFindings } from "../src/planner/internal/review-job.js";
import type { ReviewRunResult } from "../src/planner/types.js";

const makeResult = (overrides: Partial<ReviewRunResult>): ReviewRunResult => ({
  summary: "Validation needs review.",
  blockers: [],
  warnings: [],
  traceabilityGaps: [],
  assumptions: [],
  recommendedFixes: [],
  ...overrides,
});

describe("ticket coverage review finding resolution", () => {
  it("narrows core-flow blockers to the core-flows step", () => {
    const findings = buildReviewFindings(
      "ticket-coverage-review",
      makeResult({
        blockers: [
          "Resolve the inline capture launch behavior before ticket generation.",
        ],
      }),
    );

    expect(findings[0]?.relatedArtifacts).toEqual(["core-flows"]);
  });

  it("narrows engineering foundation fixes to the tech-spec step", () => {
    const findings = buildReviewFindings(
      "ticket-coverage-review",
      makeResult({
        recommendedFixes: [
          "Clarify the authoritative timestamp source and persistence worker ownership before ticket generation.",
        ],
      }),
    );

    expect(findings[0]?.relatedArtifacts).toEqual(["tech-spec"]);
  });
});
