import { describe, expect, it } from "vitest";
import type { Initiative, PlanningReviewArtifact } from "../../../types.js";
import {
  buildValidationRefinement,
  buildValidationReviewFeedback
} from "./validation-refinement.js";

const initiative: Initiative = {
  id: "initiative-1",
  title: "Linux notes",
  description: "Desktop notes for Fedora Linux.",
  status: "active",
  phases: [],
  specIds: [],
  ticketIds: [],
  workflow: {
    activeStep: "validation",
    steps: {
      brief: { status: "complete", updatedAt: null },
      "core-flows": { status: "complete", updatedAt: null },
      prd: { status: "complete", updatedAt: null },
      "tech-spec": { status: "stale", updatedAt: null },
      validation: { status: "ready", updatedAt: null },
      tickets: { status: "locked", updatedAt: null },
    },
    refinements: {
      brief: {
        questions: [],
        history: [
          {
            id: "brief-problem",
            label: "What needs to get better first?",
            type: "select",
            whyThisBlocks: "The brief needs one primary problem.",
            affectedArtifact: "brief",
            decisionType: "problem",
            assumptionIfUnanswered: "Focus on quick capture.",
            options: ["Fast capture", "Better organization"],
          },
        ],
        answers: {
          "brief-problem": "Fast capture",
        },
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        checkedAt: "2026-03-19T09:00:00.000Z",
      },
      "core-flows": {
        questions: [],
        history: [],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        checkedAt: "2026-03-19T09:05:00.000Z",
      },
      prd: {
        questions: [],
        history: [],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        checkedAt: "2026-03-19T09:10:00.000Z",
      },
      "tech-spec": {
        questions: [
          {
            id: "tech-stack-v1",
            label: "Which application architecture should v1 use for Fedora Linux?",
            type: "select",
            whyThisBlocks: "The tech spec needs one architecture direction.",
            affectedArtifact: "tech-spec",
            decisionType: "architecture",
            assumptionIfUnanswered: "Use the current desktop stack.",
            options: ["Tauri", "Native GTK"],
            reopensQuestionIds: ["brief-problem"],
          },
        ],
        history: [
          {
            id: "tech-stack-v1",
            label: "Which application architecture should v1 use for Fedora Linux?",
            type: "select",
            whyThisBlocks: "The tech spec needs one architecture direction.",
            affectedArtifact: "tech-spec",
            decisionType: "architecture",
            assumptionIfUnanswered: "Use the current desktop stack.",
            options: ["Tauri", "Native GTK"],
            reopensQuestionIds: ["brief-problem"],
          },
        ],
        answers: {
          "tech-stack-v1": "Tauri",
        },
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        checkedAt: "2026-03-19T09:20:00.000Z",
      },
    },
  },
  createdAt: "2026-03-19T08:00:00.000Z",
  updatedAt: "2026-03-19T09:20:00.000Z",
};

describe("buildValidationRefinement", () => {
  it("keeps active validation questions in the deck and preserves prior question history for later revision", () => {
    const refinement = buildValidationRefinement(initiative);

    expect(refinement.questions.map((question) => question.id)).toEqual(["tech-stack-v1"]);
    expect(refinement.history?.map((question) => question.id)).toEqual([
      "brief-problem",
      "tech-stack-v1",
    ]);
    expect(refinement.answers["brief-problem"]).toBe("Fast capture");
    expect(refinement.answers["tech-stack-v1"]).toBe("Tauri");
  });

  it("builds bounded validation feedback from blocked review findings", () => {
    const review: PlanningReviewArtifact = {
      id: "review-1",
      initiativeId: initiative.id,
      kind: "ticket-coverage-review",
      status: "blocked",
      summary: "Ticket coverage is blocked until a few gaps are resolved.",
      findings: [
        {
          id: "finding-warning",
          type: "warning",
          message: "This warning should not be included.",
          relatedArtifacts: ["validation"]
        },
        {
          id: "finding-blocker",
          type: "blocker",
          message: "Resolve the empty-note retention policy.",
          relatedArtifacts: ["tech-spec"]
        },
        {
          id: "finding-gap",
          type: "traceability-gap",
          message: "Add explicit sync authority ownership.",
          relatedArtifacts: ["tech-spec"]
        },
        {
          id: "finding-fix",
          type: "recommended-fix",
          message: "Clarify the timestamp source before ticket generation.",
          relatedArtifacts: ["tech-spec"]
        }
      ],
      sourceUpdatedAts: {
        "tech-spec": "2026-03-19T09:25:00.000Z"
      },
      overrideReason: null,
      reviewedAt: "2026-03-19T09:30:00.000Z",
      updatedAt: "2026-03-19T09:30:00.000Z"
    };

    expect(buildValidationReviewFeedback(review)).toBe(
      [
        "Ticket coverage is blocked until a few gaps are resolved.",
        "Resolve the empty-note retention policy.",
        "Add explicit sync authority ownership.",
        "Clarify the timestamp source before ticket generation."
      ].join("\n")
    );
  });
});
