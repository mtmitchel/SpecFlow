import { describe, expect, it } from "vitest";
import type { PlanningReviewArtifact } from "../../../types.js";
import {
  buildPlanValidationFeedbackByStep,
  buildValidationReviewFeedbackByStep,
  getValidationFeedbackForStep,
  getValidationFeedbackSteps,
} from "./validation-feedback.js";

describe("validation feedback helpers", () => {
  it("groups blocked review findings by artifact step", () => {
    const review: PlanningReviewArtifact = {
      id: "initiative-1:ticket-coverage-review",
      initiativeId: "initiative-1",
      kind: "ticket-coverage-review",
      status: "blocked",
      summary: "Validation needs review.",
      findings: [
        {
          id: "finding-1",
          type: "blocker",
          message: "Pick the authoritative timestamp source before ticket generation.",
          relatedArtifacts: ["tech-spec"],
        },
        {
          id: "finding-2",
          type: "traceability-gap",
          message: "Missing PRD requirement: Friendly empty states and lightweight save/load indicators.",
          relatedArtifacts: ["brief", "core-flows", "prd", "tech-spec", "validation"],
        },
      ],
      sourceUpdatedAts: {
        validation: "2026-03-19T10:00:00.000Z",
      },
      overrideReason: null,
      reviewedAt: "2026-03-19T10:00:00.000Z",
      updatedAt: "2026-03-19T10:00:00.000Z",
    };

    expect(buildValidationReviewFeedbackByStep(review)).toEqual({
      prd: "Missing PRD requirement: Friendly empty states and lightweight save/load indicators.",
      "tech-spec": "Pick the authoritative timestamp source before ticket generation.",
    });
  });

  it("groups plan validation issues by source artifact step", () => {
    expect(
      buildPlanValidationFeedbackByStep({
        issues: [
          {
            kind: "missing-coverage-item",
            message:
              "Missing PRD requirement: Friendly empty states and lightweight save/load indicators.",
            coverageItem: {
              sourceStep: "prd",
            },
          },
          {
            kind: "missing-coverage-item",
            message:
              "Missing PRD requirement: Local persistence failures show inline error and preserve draft for retry.",
            coverageItem: {
              sourceStep: "prd",
            },
          },
        ],
      })
    ).toEqual({
      prd: [
        "Missing PRD requirement: Friendly empty states and lightweight save/load indicators.",
        "Missing PRD requirement: Local persistence failures show inline error and preserve draft for retry.",
      ].join("\n"),
    });
  });

  it("falls back to the combined review summary only when no step-scoped feedback exists", () => {
    const feedbackByStep = {
      prd: "Missing PRD requirement: Friendly empty states.",
    };

    expect(getValidationFeedbackSteps(feedbackByStep)).toEqual(["prd"]);
    expect(getValidationFeedbackForStep("prd", feedbackByStep, "Combined fallback")).toBe(
      "Missing PRD requirement: Friendly empty states."
    );
    expect(getValidationFeedbackForStep("tech-spec", feedbackByStep, "Combined fallback")).toBeUndefined();
    expect(getValidationFeedbackForStep("brief", {}, "Combined fallback")).toBe("Combined fallback");
  });
});
