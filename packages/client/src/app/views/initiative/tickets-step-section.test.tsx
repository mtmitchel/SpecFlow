import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Initiative, Ticket } from "../../../types.js";
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
      validation: { status: "complete", updatedAt: "2026-03-16T10:35:00.000Z" },
      tickets: { status: "ready", updatedAt: "2026-03-16T10:40:00.000Z" },
    },
    refinements: {
      brief: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "core-flows": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      prd: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "tech-spec": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
    },
  },
  createdAt: "2026-03-16T10:00:00.000Z",
  updatedAt: "2026-03-16T10:40:00.000Z",
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
  updatedAt: "2026-03-16T10:50:00.000Z",
};

const renderSection = ({
  initiative = baseInitiative,
  initiativeTickets = [baseTicket],
  onOpenTicket = vi.fn(),
  onCommitPhaseName = vi.fn(),
}: {
  initiative?: Initiative;
  initiativeTickets?: Ticket[];
  onOpenTicket?: (ticketId: string) => void;
  onCommitPhaseName?: (phaseId: string, nextName: string) => void;
} = {}) =>
  render(
    <TicketsStepSection
      initiative={initiative}
      initiativeTickets={initiativeTickets}
      onOpenTicket={onOpenTicket}
      onCommitPhaseName={onCommitPhaseName}
    />,
  );

describe("TicketsStepSection", () => {
  it("shows a compact fallback when tickets are not ready yet", () => {
    renderSection({
      initiative: {
        ...baseInitiative,
        phases: [],
        ticketIds: [],
      },
      initiativeTickets: [],
    });

    expect(screen.getByText("Tickets aren't ready yet")).toBeInTheDocument();
    expect(screen.getByText("Finish validation before tickets are created.")).toBeInTheDocument();
    expect(screen.queryByText("Execution phases")).not.toBeInTheDocument();
  });

  it("renders the execution phase board as left-to-right columns", () => {
    const secondPhase = {
      id: "phase-2",
      name: "Polish",
      order: 2,
      status: "active" as const,
    };
    const secondTicket: Ticket = {
      ...baseTicket,
      id: "ticket-87654321",
      phaseId: secondPhase.id,
      title: "Tighten verification copy",
      coverageItemIds: ["coverage-prd-requirements-1"],
    };

    const { container } = renderSection({
      initiative: {
        ...baseInitiative,
        phases: [...baseInitiative.phases, secondPhase],
        ticketIds: [baseTicket.id, secondTicket.id],
      },
      initiativeTickets: [baseTicket, secondTicket],
    });

    const board = container.querySelector(".planning-phase-board");

    expect(screen.getByRole("heading", { name: "Execution phases" })).toBeInTheDocument();
    expect(screen.getByText("2 phases")).toBeInTheDocument();
    expect(board?.querySelectorAll(".planning-phase-column")).toHaveLength(2);
    expect(screen.getByText("Phase 1")).toBeInTheDocument();
    expect(screen.getByText("Phase 2")).toBeInTheDocument();
  });

  it("opens a ticket from the board", () => {
    const onOpenTicket = vi.fn();

    renderSection({ onOpenTicket });

    fireEvent.click(screen.getByRole("button", { name: baseTicket.title }));

    expect(onOpenTicket).toHaveBeenCalledWith(baseTicket.id);
  });

  it("commits a renamed phase on blur", () => {
    const onCommitPhaseName = vi.fn();

    renderSection({ onCommitPhaseName });

    const input = screen.getByLabelText("Phase 1 name");
    fireEvent.change(input, { target: { value: "Core backend" } });
    fireEvent.blur(input);

    expect(onCommitPhaseName).toHaveBeenCalledWith("phase-1", "Core backend");
  });
});
