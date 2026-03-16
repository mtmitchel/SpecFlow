import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type {
  Initiative,
  PlanningReviewArtifact,
  Run,
  RunAttempt,
  Ticket,
  TicketCoverageArtifact
} from "../../types.js";
import { TicketView } from "./ticket-view.js";

vi.mock("../../api.js", () => ({
  fetchOperationStatus: vi.fn().mockResolvedValue(null)
}));

vi.mock("../context/toast.js", () => ({
  useToast: () => ({ showError: vi.fn() })
}));

vi.mock("../utils/phase-warning.js", () => ({
  findPhaseWarning: () => ({ hasWarning: false, message: "" })
}));

vi.mock("../hooks/use-verification-stream.js", () => ({
  useVerificationStream: () => ({
    verifyState: "idle",
    verificationResult: null
  })
}));

vi.mock("../hooks/use-capture-preview.js", () => ({
  useCapturePreview: () => ({})
}));

vi.mock("../hooks/use-export-workflow.js", () => ({
  useExportWorkflow: () => ({
    exportResult: null
  })
}));

vi.mock("../components/audit-panel.js", () => ({
  AuditPanel: () => <div>AuditPanel</div>
}));

vi.mock("../components/workflow-section.js", () => ({
  WorkflowSection: ({ title, children }: { title: string; children: ReactNode }) => (
    <section>
      <h3>{title}</h3>
      {children}
    </section>
  )
}));

vi.mock("../components/workflow-stepper.js", () => ({
  WorkflowStepper: ({ currentPhase }: { currentPhase: string }) => <div>Workflow phase: {currentPhase}</div>
}));

vi.mock("./ticket/export-section.js", () => ({
  ExportSection: () => <div>ExportSection</div>
}));

vi.mock("./ticket/capture-verify-section.js", () => ({
  CaptureVerifySection: () => <div>CaptureVerifySection</div>
}));

vi.mock("./ticket/verification-results-section.js", () => ({
  VerificationResultsSection: () => <div>VerificationResultsSection</div>
}));

const initiative: Initiative = {
  id: "initiative-12345678",
  title: "Coverage gate",
  description: "Block execution until coverage checks pass.",
  status: "active",
  phases: [{ id: "phase-1", name: "Foundation", order: 1, status: "active" }],
  specIds: [],
  ticketIds: ["ticket-12345678"],
  workflow: {
    activeStep: "tickets",
    steps: {
      brief: { status: "complete", updatedAt: "2026-03-16T10:00:00.000Z" },
      "core-flows": { status: "complete", updatedAt: "2026-03-16T10:05:00.000Z" },
      prd: { status: "complete", updatedAt: "2026-03-16T10:10:00.000Z" },
      "tech-spec": { status: "complete", updatedAt: "2026-03-16T10:15:00.000Z" },
      tickets: { status: "ready", updatedAt: "2026-03-16T10:20:00.000Z" }
    },
    refinements: {
      brief: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "core-flows": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      prd: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "tech-spec": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null }
    }
  },
  createdAt: "2026-03-16T10:00:00.000Z",
  updatedAt: "2026-03-16T10:20:00.000Z"
};

const ticket: Ticket = {
  id: "ticket-12345678",
  initiativeId: initiative.id,
  phaseId: "phase-1",
  title: "Guard ticket execution",
  description: "Prevent runs until the coverage review is resolved.",
  status: "backlog",
  acceptanceCriteria: [{ id: "criterion-1", text: "Execution blocks until review passes." }],
  implementationPlan: "Add a shared execution-gate helper.",
  fileTargets: ["packages/app/src/server/routes/ticket-routes.ts"],
  coverageItemIds: ["coverage-brief-goals-1", "coverage-prd-requirements-1"],
  blockedBy: [],
  blocks: [],
  runId: null,
  createdAt: "2026-03-16T10:25:00.000Z",
  updatedAt: "2026-03-16T10:25:00.000Z"
};

const coverageArtifact: TicketCoverageArtifact = {
  id: `${initiative.id}:ticket-coverage`,
  initiativeId: initiative.id,
  items: [
    {
      id: "coverage-brief-goals-1",
      sourceStep: "brief",
      sectionKey: "goals",
      sectionLabel: "Goals",
      kind: "goal",
      text: "Execution cannot start until coverage is reviewed."
    },
    {
      id: "coverage-prd-requirements-1",
      sourceStep: "prd",
      sectionKey: "requirements",
      sectionLabel: "Requirements",
      kind: "requirement",
      text: "The ticket banner must link back to the initiative tickets step."
    }
  ],
  uncoveredItemIds: [],
  sourceUpdatedAts: {
    brief: "2026-03-16T10:00:00.000Z",
    prd: "2026-03-16T10:10:00.000Z",
    tickets: "2026-03-16T10:20:00.000Z"
  },
  generatedAt: "2026-03-16T10:22:00.000Z",
  updatedAt: "2026-03-16T10:22:00.000Z"
};

const renderView = ({
  planningReviews,
  runs = [],
  runAttempts = []
}: {
  planningReviews: PlanningReviewArtifact[];
  runs?: Run[];
  runAttempts?: RunAttempt[];
}) => {
  render(
    <MemoryRouter initialEntries={[`/ticket/${ticket.id}`]}>
      <Routes>
        <Route
          path="/ticket/:id"
          element={
            <TicketView
              tickets={[ticket]}
              runs={runs}
              runAttempts={runAttempts}
              initiatives={[initiative]}
              planningReviews={planningReviews}
              ticketCoverageArtifacts={[coverageArtifact]}
              onRefresh={vi.fn(async () => undefined)}
              onMoveTicket={vi.fn(async () => undefined)}
            />
          }
        />
      </Routes>
    </MemoryRouter>
  );
};

describe("TicketView", () => {
  it("shows the coverage gate banner and covered spec items when execution is blocked", () => {
    renderView({
      planningReviews: [
        {
          id: `${initiative.id}:ticket-coverage-review`,
          initiativeId: initiative.id,
          kind: "ticket-coverage-review",
          status: "blocked",
          summary: "Coverage gaps remain.",
          findings: [],
          sourceUpdatedAts: { tickets: "2026-03-16T10:20:00.000Z" },
          overrideReason: null,
          reviewedAt: "2026-03-16T10:30:00.000Z",
          updatedAt: "2026-03-16T10:30:00.000Z"
        }
      ]
    });

    expect(screen.getByText("Resolve the coverage check before starting execution for this ticket.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the tickets step" })).toHaveAttribute(
      "href",
      `/initiative/${initiative.id}?step=tickets`
    );
    expect(screen.getByText("Covered spec items")).toBeInTheDocument();
    expect(screen.getByText("brief")).toBeInTheDocument();
    expect(screen.getByText("prd")).toBeInTheDocument();
    expect(screen.getByText("Execution cannot start until coverage is reviewed.")).toBeInTheDocument();
    expect(
      screen.getByText("The ticket banner must link back to the initiative tickets step.")
    ).toBeInTheDocument();
  });

  it("hides the coverage gate banner once the review is overridden", () => {
    renderView({
      planningReviews: [
        {
          id: `${initiative.id}:ticket-coverage-review`,
          initiativeId: initiative.id,
          kind: "ticket-coverage-review",
          status: "overridden",
          summary: "Coverage gaps are accepted for this pass.",
          findings: [],
          sourceUpdatedAts: { tickets: "2026-03-16T10:20:00.000Z" },
          overrideReason: "The remaining gap is tracked in a follow-up initiative.",
          reviewedAt: "2026-03-16T10:35:00.000Z",
          updatedAt: "2026-03-16T10:35:00.000Z"
        }
      ]
    });

    expect(
      screen.queryByText("Resolve the coverage check before starting execution for this ticket.")
    ).not.toBeInTheDocument();
  });
});
