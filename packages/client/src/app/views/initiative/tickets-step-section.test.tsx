import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type {
  Initiative,
  PlanningReviewArtifact,
  Run,
  Ticket,
  TicketCoverageArtifact
} from "../../../types.js";
import { TicketsStepSection } from "./tickets-step-section.js";

const baseInitiative: Initiative = {
  id: "initiative-12345678",
  title: "Ship planning coverage",
  description: "Improve coverage review UX",
  status: "active",
  phases: [{ id: "phase-1", name: "Foundation", order: 1, status: "active" }],
  specIds: [],
  ticketIds: ["ticket-12345678"],
  workflow: {
    activeStep: "tickets",
    steps: {
      brief: { status: "complete", updatedAt: "2026-03-16T10:00:00.000Z" },
      "core-flows": { status: "complete", updatedAt: "2026-03-16T10:10:00.000Z" },
      prd: { status: "complete", updatedAt: "2026-03-16T10:20:00.000Z" },
      "tech-spec": { status: "complete", updatedAt: "2026-03-16T10:30:00.000Z" },
      tickets: { status: "ready", updatedAt: "2026-03-16T10:40:00.000Z" }
    },
    refinements: {
      brief: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "core-flows": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      prd: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "tech-spec": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null }
    }
  },
  createdAt: "2026-03-16T10:00:00.000Z",
  updatedAt: "2026-03-16T10:40:00.000Z"
};

const baseTicket: Ticket = {
  id: "ticket-12345678",
  initiativeId: baseInitiative.id,
  phaseId: "phase-1",
  title: "Implement execution gate",
  description: "Block execution until coverage review is resolved.",
  status: "backlog",
  acceptanceCriteria: [{ id: "criterion-1", text: "Coverage review blocks execution." }],
  implementationPlan: "Add one shared gate helper.",
  fileTargets: ["packages/app/src/server/routes/ticket-routes.ts"],
  coverageItemIds: ["coverage-brief-goals-1"],
  blockedBy: [],
  blocks: [],
  runId: null,
  createdAt: "2026-03-16T10:50:00.000Z",
  updatedAt: "2026-03-16T10:50:00.000Z"
};

const baseCoverageArtifact: TicketCoverageArtifact = {
  id: `${baseInitiative.id}:ticket-coverage`,
  initiativeId: baseInitiative.id,
  items: [
    {
      id: "coverage-brief-goals-1",
      sourceStep: "brief",
      sectionKey: "goals",
      sectionLabel: "Goals",
      kind: "goal",
      text: "Require explicit execution gating before work starts."
    },
    {
      id: "coverage-prd-requirements-1",
      sourceStep: "prd",
      sectionKey: "requirements",
      sectionLabel: "Requirements",
      kind: "requirement",
      text: "Explain the override path in the UI."
    }
  ],
  uncoveredItemIds: ["coverage-prd-requirements-1"],
  sourceUpdatedAts: {
    brief: "2026-03-16T10:00:00.000Z",
    prd: "2026-03-16T10:20:00.000Z",
    tickets: "2026-03-16T10:40:00.000Z"
  },
  generatedAt: "2026-03-16T10:45:00.000Z",
  updatedAt: "2026-03-16T10:45:00.000Z"
};

const renderSection = (review: PlanningReviewArtifact | undefined) => {
  const linkedRuns: Run[] = [];

  render(
    <MemoryRouter>
      <TicketsStepSection
        initiative={baseInitiative}
        initiativeTickets={[baseTicket]}
        linkedRuns={linkedRuns}
        ticketCoverageArtifact={baseCoverageArtifact}
        ticketCoverageReview={review}
        uncoveredCoverageItems={baseCoverageArtifact.items.filter((item) =>
          baseCoverageArtifact.uncoveredItemIds.includes(item.id)
        )}
        coveredCoverageCount={1}
        busyAction={null}
        reviewOverrideKind={null}
        reviewOverrideReason=""
        onGenerateTickets={vi.fn()}
        onOpenFirstTicket={vi.fn()}
        onRunReview={vi.fn()}
        onSetReviewOverride={vi.fn()}
        onClearReviewOverride={vi.fn()}
        onChangeReviewOverrideReason={vi.fn()}
        onConfirmOverride={vi.fn()}
        onCommitPhaseName={vi.fn()}
      />
    </MemoryRouter>
  );
};

describe("TicketsStepSection", () => {
  it("renders blocked coverage details and unresolved execution warning", () => {
    renderSection({
      id: `${baseInitiative.id}:ticket-coverage-review`,
      initiativeId: baseInitiative.id,
      kind: "ticket-coverage-review",
      status: "blocked",
      summary: "One requirement is still uncovered.",
      findings: [
        {
          id: "finding-1",
          type: "blocker",
          message: "A required verification path is not assigned to any ticket.",
          relatedArtifacts: ["tickets"]
        },
        {
          id: "finding-2",
          type: "traceability-gap",
          message: "The PRD override guidance is not covered.",
          relatedArtifacts: ["prd", "tickets"]
        },
        {
          id: "finding-3",
          type: "warning",
          message: "The ticket title does not mention overrides.",
          relatedArtifacts: ["tickets"]
        }
      ],
      sourceUpdatedAts: {
        brief: "2026-03-16T10:00:00.000Z",
        prd: "2026-03-16T10:20:00.000Z",
        tickets: "2026-03-16T10:40:00.000Z"
      },
      overrideReason: null,
      reviewedAt: "2026-03-16T10:55:00.000Z",
      updatedAt: "2026-03-16T10:55:00.000Z"
    });

    expect(screen.getByRole("button", { name: "Run coverage check" })).toBeInTheDocument();
    expect(screen.getByText("1 covered · 1 uncovered · 2 blockers · 1 warning")).toBeInTheDocument();
    expect(screen.getByText("One requirement is still uncovered.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "See issues" }));

    expect(screen.getByText("Accept risk")).toBeInTheDocument();
    expect(screen.getByText(/Explain the override path in the UI\./)).toBeInTheDocument();
    expect(screen.getByText("A required verification path is not assigned to any ticket.")).toBeInTheDocument();
    expect(screen.getByText("The PRD override guidance is not covered.")).toBeInTheDocument();
    expect(screen.getByText("Fix these gaps before you run the tickets.")).toBeInTheDocument();
  });

  it("shows override context without the unresolved execution banner", () => {
    renderSection({
      id: `${baseInitiative.id}:ticket-coverage-review`,
      initiativeId: baseInitiative.id,
      kind: "ticket-coverage-review",
      status: "overridden",
      summary: "Coverage gaps are accepted for this iteration.",
      findings: [],
      sourceUpdatedAts: { tickets: "2026-03-16T10:40:00.000Z" },
      overrideReason: "The remaining copy issue is intentionally deferred to a follow-up polish pass.",
      reviewedAt: "2026-03-16T11:05:00.000Z",
      updatedAt: "2026-03-16T11:05:00.000Z"
    });

    expect(screen.getByText("Accepted risk")).toBeInTheDocument();
    expect(
      screen.getByText("Moving ahead with risk: The remaining copy issue is intentionally deferred to a follow-up polish pass.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Fix these gaps before you run the tickets.")
    ).not.toBeInTheDocument();
  });
});
