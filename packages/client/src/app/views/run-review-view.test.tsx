import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Run, Ticket } from "../../types.js";
import { RunReviewView } from "./run-review-view.js";

vi.mock("../components/audit-panel.js", () => ({
  AuditPanel: ({ runId }: { runId: string }) => <div>AuditPanel {runId}</div>,
}));

const ticket: Ticket = {
  id: "ticket-12345678",
  initiativeId: "initiative-12345678",
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

describe("RunReviewView", () => {
  it("renders the dedicated review route around the audit panel", () => {
    render(
      <MemoryRouter initialEntries={[`/run/${run.id}/review`]}>
        <Routes>
          <Route
            path="/run/:id/review"
            element={<RunReviewView runs={[run]} tickets={[ticket]} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Review changes" })).toBeInTheDocument();
    expect(screen.getByText(`AuditPanel ${run.id}`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to run" })).toHaveAttribute("href", `/run/${run.id}`);
    expect(screen.getByRole("link", { name: "Open ticket" })).toHaveAttribute("href", `/ticket/${ticket.id}`);
  });
});
