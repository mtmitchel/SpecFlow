import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ArtifactsSnapshot, Initiative, PlanningReviewArtifact, Ticket } from "../../types.js";
import { OverviewPanel } from "./overview-panel.js";

const initiative: Initiative = {
  id: "initiative-12345678",
  title: "Linux Notes",
  description: "Build a Linux-first notes app.",
  status: "active",
  phases: [],
  specIds: [],
  ticketIds: ["ticket-verify"],
  workflow: {
    activeStep: "brief",
    steps: {
      brief: { status: "stale", updatedAt: "2026-03-16T10:00:00.000Z" },
      "core-flows": { status: "ready", updatedAt: "2026-03-16T10:05:00.000Z" },
      prd: { status: "locked", updatedAt: null },
      "tech-spec": { status: "locked", updatedAt: null },
      validation: { status: "locked", updatedAt: null },
      tickets: { status: "locked", updatedAt: null },
    },
    refinements: {
      brief: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: "2026-03-16T10:00:00.000Z" },
      "core-flows": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      prd: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "tech-spec": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
    },
  },
  createdAt: "2026-03-16T10:00:00.000Z",
  updatedAt: "2026-03-16T10:15:00.000Z",
};

const planningReview: PlanningReviewArtifact = {
  id: `${initiative.id}:brief-review`,
  initiativeId: initiative.id,
  kind: "brief-review",
  status: "blocked",
  summary: "The brief needs sharper scope.",
  findings: [],
  sourceUpdatedAts: { brief: "2026-03-16T10:00:00.000Z" },
  overrideReason: null,
  reviewedAt: "2026-03-16T10:15:00.000Z",
  updatedAt: "2026-03-16T10:15:00.000Z",
};

const quickVerifyTicket: Ticket = {
  id: "ticket-verify",
  initiativeId: null,
  phaseId: null,
  title: "Quick verify",
  description: "A quick task waiting for verification.",
  status: "verify",
  acceptanceCriteria: [],
  implementationPlan: "",
  fileTargets: [],
  coverageItemIds: [],
  blockedBy: [],
  blocks: [],
  runId: null,
  createdAt: "2026-03-16T10:20:00.000Z",
  updatedAt: "2026-03-16T10:20:00.000Z",
};

const snapshot: ArtifactsSnapshot = {
  config: null,
  initiatives: [initiative],
  tickets: [quickVerifyTicket],
  runs: [],
  runAttempts: [],
  specs: [],
  planningReviews: [planningReview],
  ticketCoverageArtifacts: [],
};

describe("OverviewPanel", () => {
  it("shows one clear resume action, then secondary work and recent initiatives", () => {
    render(
      <MemoryRouter>
        <OverviewPanel snapshot={snapshot} onOpenCommandPalette={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByText("Up next")).toBeInTheDocument();
    expect(screen.getByText("More in progress")).toBeInTheDocument();
    expect(screen.getByText("Initiatives")).toBeInTheDocument();
    expect(screen.getByText("Resume work")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Review brief.*Linux Notes/i })).toHaveAttribute(
      "href",
      `/initiative/${initiative.id}?step=brief&surface=questions`
    );
    expect(screen.getByText("Verify quick task")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Linux Notes.*Build a Linux-first notes app/i })).not.toBeInTheDocument();
    expect(screen.getAllByText("Review brief")).toHaveLength(1);
  });

  it("uses the stored initiative ticket as the resume target when execution intent exists", () => {
    const executionInitiative: Initiative = {
      ...initiative,
      workflow: {
        ...initiative.workflow,
        activeStep: "tickets",
        resumeTicketId: "initiative-ticket",
        steps: {
          brief: { status: "complete", updatedAt: "2026-03-16T10:00:00.000Z" },
          "core-flows": { status: "complete", updatedAt: "2026-03-16T10:05:00.000Z" },
          prd: { status: "complete", updatedAt: "2026-03-16T10:10:00.000Z" },
          "tech-spec": { status: "complete", updatedAt: "2026-03-16T10:15:00.000Z" },
          validation: { status: "complete", updatedAt: "2026-03-16T10:18:00.000Z" },
          tickets: { status: "complete", updatedAt: "2026-03-16T10:20:00.000Z" },
        },
      },
      ticketIds: ["initiative-ticket"],
    };
    const initiativeTicket: Ticket = {
      id: "initiative-ticket",
      initiativeId: executionInitiative.id,
      phaseId: null,
      title: "Execution ticket",
      description: "Resume execution here.",
      status: "in-progress",
      acceptanceCriteria: [],
      implementationPlan: "",
      fileTargets: [],
      coverageItemIds: [],
      blockedBy: [],
      blocks: [],
      runId: null,
      createdAt: "2026-03-16T10:22:00.000Z",
      updatedAt: "2026-03-16T10:22:00.000Z",
    };
    const executionSnapshot: ArtifactsSnapshot = {
      ...snapshot,
      initiatives: [executionInitiative],
      tickets: [initiativeTicket],
      planningReviews: [
        {
          id: `${executionInitiative.id}:ticket-coverage-review`,
          initiativeId: executionInitiative.id,
          kind: "ticket-coverage-review",
          status: "passed",
          summary: "Coverage check passes.",
          findings: [],
          sourceUpdatedAts: { tickets: "2026-03-16T10:20:00.000Z" },
          overrideReason: null,
          reviewedAt: "2026-03-16T10:25:00.000Z",
          updatedAt: "2026-03-16T10:25:00.000Z",
        },
      ],
    };

    render(
      <MemoryRouter>
        <OverviewPanel snapshot={executionSnapshot} onOpenCommandPalette={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: /Resume ticket.*Linux Notes/i })).toHaveAttribute(
      "href",
      "/ticket/initiative-ticket",
    );
  });
});
