import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type {
  Initiative,
  PlanningReviewArtifact,
  Run,
  RunAttemptDetail,
  RunDetail,
  Ticket,
  TicketCoverageArtifact
} from "../../types.js";
import { RunView } from "./run-view.js";

const fetchRunDetailMock = vi.fn();
const fetchRunAttemptDetailMock = vi.fn();
const fetchRunProgressMock = vi.fn();
const updateInitiativeMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../../api.js", () => ({
  fetchRunDetail: (...args: unknown[]) => fetchRunDetailMock(...args),
  fetchRunAttemptDetail: (...args: unknown[]) => fetchRunAttemptDetailMock(...args),
  fetchRunProgress: (...args: unknown[]) => fetchRunProgressMock(...args),
  fetchRunDiff: vi.fn(),
  updateInitiative: (...args: unknown[]) => updateInitiativeMock(...args),
}));

vi.mock("../components/diff-viewer.js", () => ({
  DiffViewer: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("../components/audit-panel.js", () => ({
  AuditPanel: () => <div>AuditPanel</div>,
}));

vi.mock("../context/toast.js", () => ({
  useToast: () => ({ showError: vi.fn() }),
}));

const initiative: Initiative = {
  id: "initiative-12345678",
  title: "Linux Notes",
  description: "Build a Linux-first notes app.",
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
      validation: { status: "complete", updatedAt: "2026-03-16T10:18:00.000Z" },
      tickets: { status: "complete", updatedAt: "2026-03-16T10:20:00.000Z" },
    },
    refinements: {
      brief: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "core-flows": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      prd: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "tech-spec": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
    },
  },
  createdAt: "2026-03-16T10:00:00.000Z",
  updatedAt: "2026-03-16T10:20:00.000Z",
};

const ticket: Ticket = {
  id: "ticket-12345678",
  initiativeId: initiative.id,
  phaseId: "phase-1",
  title: "Implement execution gate",
  description: "Block execution until coverage review is resolved.",
  status: "verify",
  acceptanceCriteria: [{ id: "criterion-1", text: "Coverage review blocks execution." }],
  implementationPlan: "Add one shared gate helper.",
  fileTargets: ["packages/app/src/server/routes/ticket-routes.ts"],
  coverageItemIds: ["coverage-brief-goals-1"],
  blockedBy: [],
  blocks: [],
  runId: "run-12345678",
  createdAt: "2026-03-16T10:25:00.000Z",
  updatedAt: "2026-03-16T10:25:00.000Z",
};

const run: Run = {
  id: "run-12345678",
  ticketId: ticket.id,
  type: "execution",
  agentType: "codex-cli",
  status: "complete",
  attempts: ["attempt-1"],
  committedAttemptId: "attempt-1",
  activeOperationId: null,
  operationLeaseExpiresAt: null,
  lastCommittedAt: "2026-03-16T10:35:00.000Z",
  createdAt: "2026-03-16T10:30:00.000Z",
};

const detail: RunDetail = {
  run,
  ticket,
  operationState: "committed",
  attempts: [
    {
      id: "attempt-record-1",
      attemptId: "attempt-1",
      overrideReason: null,
      overrideAccepted: false,
      overallPass: true,
      createdAt: "2026-03-16T10:35:00.000Z",
    },
  ],
  committed: {
    attemptId: "attempt-1",
    attempt: {
      id: "attempt-record-1",
      attemptId: "attempt-1",
      overrideReason: null,
      overrideAccepted: false,
      overallPass: true,
      createdAt: "2026-03-16T10:35:00.000Z",
    },
    bundleManifest: {
      requiredFiles: ["packages/app/src/server/routes/ticket-routes.ts"],
      contextFiles: ["packages/app/test/server/ticket-routes.test.ts"],
    },
  },
};

const committedAttempt: RunAttemptDetail = {
  id: "attempt-record-1",
  attemptId: "attempt-1",
  agentSummary: "Implemented the execution gate and updated tests.",
  diffSource: "git",
  initialScopePaths: ["packages/app/src/server/routes/ticket-routes.ts"],
  widenedScopePaths: [],
  primaryDiffPath: "primary.diff",
  driftDiffPath: null,
  overrideReason: null,
  overrideAccepted: false,
  criteriaResults: [
    {
      criterionId: "criterion-1",
      pass: true,
      evidence: "The route now blocks execution while coverage is unresolved.",
    },
  ],
  driftFlags: [],
  overallPass: true,
  createdAt: "2026-03-16T10:35:00.000Z",
};

describe("RunView", () => {
  it("renders the execution report shell with report facts and included files", async () => {
    fetchRunDetailMock.mockResolvedValueOnce(detail);
    fetchRunAttemptDetailMock.mockResolvedValueOnce(committedAttempt);

    render(
      <MemoryRouter initialEntries={[`/run/${run.id}`]}>
        <Routes>
          <Route
            path="/run/:id"
            element={
              <RunView
                initiatives={[initiative]}
                tickets={[ticket]}
                planningReviews={[] as PlanningReviewArtifact[]}
                runs={[run]}
                ticketCoverageArtifacts={[] as TicketCoverageArtifact[]}
                onRefresh={vi.fn(async () => undefined)}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: run.id })).toBeInTheDocument();
    });

    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("Included files")).toBeInTheDocument();
    expect(screen.getByText("Implemented the execution gate and updated tests.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to ticket" })).toHaveAttribute("href", `/ticket/${ticket.id}`);
    expect(screen.queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(updateInitiativeMock).toHaveBeenCalledWith(initiative.id, { resumeTicketId: ticket.id });
    });
  });
});
