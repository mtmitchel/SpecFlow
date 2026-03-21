import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Initiative, PlanningReviewArtifact, Ticket } from "../../../types.js";
import { statusColumns } from "../../constants/status-columns.js";
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
  fileTargets: ["packages/app/src/runtime/handlers/ticket-handlers.ts"],
  coverageItemIds: ["coverage-brief-goals-1"],
  blockedBy: [],
  blocks: [],
  runId: null,
  createdAt: "2026-03-16T10:50:00.000Z",
  updatedAt: "2026-03-16T10:50:00.000Z",
};

const passedCoverageReview: PlanningReviewArtifact = {
  id: `${baseInitiative.id}:ticket-coverage-review`,
  initiativeId: baseInitiative.id,
  kind: "ticket-coverage-review",
  status: "passed",
  summary: "Coverage is clear.",
  findings: [],
  sourceUpdatedAts: { tickets: "2026-03-16T10:20:00.000Z" },
  overrideReason: null,
  reviewedAt: "2026-03-16T10:30:00.000Z",
  updatedAt: "2026-03-16T10:30:00.000Z",
};

const createDataTransfer = () => {
  const store = new Map<string, string>();
  return {
    dropEffect: "move",
    effectAllowed: "move",
    getData: (type: string) => store.get(type) ?? "",
    setData: (type: string, value: string) => {
      store.set(type, value);
    },
  };
};

const renderSection = ({
    initiative = baseInitiative,
    initiativeTickets = [baseTicket],
    initiativeReviews = [],
    onOpenTicket = vi.fn(),
    onCommitPhaseName = vi.fn(),
    onMoveTicket = vi.fn(async () => undefined),
  }: {
    initiative?: Initiative;
    initiativeTickets?: Ticket[];
    initiativeReviews?: PlanningReviewArtifact[];
    onOpenTicket?: (ticketId: string) => void;
    onCommitPhaseName?: (phaseId: string, nextName: string) => void;
    onMoveTicket?: (ticketId: string, status: Ticket["status"]) => Promise<void>;
} = {}) =>
  render(
      <TicketsStepSection
        initiative={initiative}
        initiativeTickets={initiativeTickets}
        initiativeReviews={initiativeReviews}
        onOpenTicket={onOpenTicket}
        onCommitPhaseName={onCommitPhaseName}
        onMoveTicket={onMoveTicket}
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
    expect(screen.queryByText("Execution board")).not.toBeInTheDocument();
  });

  it("renders the selected phase board with status columns", () => {
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

    const board = container.querySelector(".planning-ticket-board");

    expect(screen.queryByText("Execution board")).not.toBeInTheDocument();
    expect(screen.getByText("Phase")).toBeInTheDocument();
    expect(board?.querySelectorAll(".planning-ticket-status-column")).toHaveLength(
      statusColumns.length,
    );
    expect(screen.getByRole("button", { name: "Select phase. Current phase Foundation" })).toBeInTheDocument();
  });

  it("defaults to the first phase with unfinished work", () => {
    const secondPhase = {
      id: "phase-2",
      name: "Polish",
      order: 2,
      status: "active" as const,
    };
    const doneTicket: Ticket = {
      ...baseTicket,
      status: "done",
    };
    const secondTicket: Ticket = {
      ...baseTicket,
      id: "ticket-87654321",
      phaseId: secondPhase.id,
      title: "Tighten verification copy",
      coverageItemIds: ["coverage-prd-requirements-1"],
    };

    renderSection({
      initiative: {
        ...baseInitiative,
        phases: [...baseInitiative.phases, secondPhase],
        ticketIds: [doneTicket.id, secondTicket.id],
      },
      initiativeTickets: [doneTicket, secondTicket],
    });

    const trigger = screen.getByRole("button", {
      name: "Select phase. Current phase Polish",
    });
    expect(trigger).toHaveTextContent("Polish");
  });

  it("opens a ticket from the board", () => {
    const onOpenTicket = vi.fn();

    renderSection({ onOpenTicket });

    fireEvent.click(screen.getByRole("button", { name: baseTicket.title }));

    expect(onOpenTicket).toHaveBeenCalledWith(baseTicket.id);
  });

  it("switches phase via dropdown", () => {
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

    renderSection({
      initiative: {
        ...baseInitiative,
        phases: [...baseInitiative.phases, secondPhase],
        ticketIds: [baseTicket.id, secondTicket.id],
      },
      initiativeTickets: [baseTicket, secondTicket],
    });

    // Open dropdown
    fireEvent.click(
      screen.getByRole("button", {
        name: "Select phase. Current phase Foundation",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: /Polish/i }));
    expect(screen.getByText("Tighten verification copy")).toBeInTheDocument();
  });

  it("moves a ticket to another status when dropped", async () => {
    const onMoveTicket = vi.fn(async () => undefined);
    const dataTransfer = createDataTransfer();

    renderSection({ onMoveTicket, initiativeReviews: [passedCoverageReview] });

    const ticketCard = screen.getByText(baseTicket.title).closest("li");
    const readyColumn = screen.getByLabelText("Up next tickets");

    fireEvent.dragStart(ticketCard!, { dataTransfer });
    fireEvent.dragEnter(readyColumn, { dataTransfer });
    fireEvent.dragOver(readyColumn, { dataTransfer });
    fireEvent.drop(readyColumn, { dataTransfer });

    await waitFor(() => {
      expect(onMoveTicket).toHaveBeenCalledWith(baseTicket.id, "ready");
    });
  });

  it("does not move a blocked ticket into execution when a dependency is still open", async () => {
    const onMoveTicket = vi.fn(async () => undefined);
    const dataTransfer = createDataTransfer();
    const blockedTicket: Ticket = {
      ...baseTicket,
      status: "ready",
      blockedBy: ["ticket-blocker"],
    };
    const blockerTicket: Ticket = {
      ...baseTicket,
      id: "ticket-blocker",
      title: "Finish prerequisite ticket",
      status: "verify",
      blockedBy: [],
      blocks: [blockedTicket.id],
      coverageItemIds: ["coverage-prd-requirements-1"],
    };

    renderSection({
      onMoveTicket,
      initiativeTickets: [blockedTicket, blockerTicket],
      initiativeReviews: [passedCoverageReview],
    });

    const ticketCard = screen.getByText(blockedTicket.title).closest("li");
    const inProgressColumn = screen.getByLabelText("In progress tickets");

    fireEvent.dragStart(ticketCard!, { dataTransfer });
    fireEvent.dragEnter(inProgressColumn, { dataTransfer });
    fireEvent.dragOver(inProgressColumn, { dataTransfer });
    fireEvent.drop(inProgressColumn, { dataTransfer });

    await waitFor(() => {
      expect(onMoveTicket).not.toHaveBeenCalled();
    });
  });

  it("ignores drops into the same status column", async () => {
    const onMoveTicket = vi.fn(async () => undefined);
    const dataTransfer = createDataTransfer();

    renderSection({ onMoveTicket });

    const ticketCard = screen.getByText(baseTicket.title).closest("li");
    const backlogColumn = screen.getByLabelText("Backlog tickets");

    fireEvent.dragStart(ticketCard!, { dataTransfer });
    fireEvent.dragEnter(backlogColumn, { dataTransfer });
    fireEvent.dragOver(backlogColumn, { dataTransfer });
    fireEvent.drop(backlogColumn, { dataTransfer });

    await waitFor(() => {
      expect(onMoveTicket).not.toHaveBeenCalled();
    });
  });
});
