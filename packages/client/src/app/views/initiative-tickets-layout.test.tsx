import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ArtifactsSnapshot, Initiative, Ticket } from "../../types.js";
import { InitiativeRouteView } from "./initiative-route-view.js";

vi.mock("../../api.js", async () => {
  const actual = await vi.importActual<typeof import("../../api.js")>("../../api.js");
  return {
    ...actual,
    checkInitiativePhase: vi.fn(),
    fetchSpecDetail: vi.fn(),
    generateInitiativeBrief: vi.fn(),
    generateInitiativeCoreFlows: vi.fn(),
    generateInitiativePlan: vi.fn(),
    generateInitiativePrd: vi.fn(),
    generateInitiativeTechSpec: vi.fn(),
    overrideInitiativeReview: vi.fn(),
    requestInitiativeClarificationHelp: vi.fn(),
    runInitiativeReview: vi.fn(),
    updateInitiativePhases: vi.fn(),
  };
});

vi.mock("../../api/initiatives.js", () => ({
  deleteInitiative: vi.fn(),
}));

vi.mock("../context/toast.js", () => ({
  useToast: () => ({ showError: vi.fn() }),
}));

vi.mock("../context/confirm.js", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(false),
}));

const baseInitiative: Initiative = {
  id: "initiative-12345678",
  title: "Linux notes",
  description: "Offline-first notes for Fedora.",
  status: "active",
  phases: [],
  specIds: [],
  ticketIds: [],
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
      brief: { questions: [], history: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "core-flows": { questions: [], history: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      prd: { questions: [], history: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "tech-spec": { questions: [], history: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
    },
  },
  createdAt: "2026-03-16T10:00:00.000Z",
  updatedAt: "2026-03-16T10:40:00.000Z",
};

const generatedTicket: Ticket = {
  id: "ticket-12345678",
  initiativeId: baseInitiative.id,
  phaseId: "phase-1",
  title: "Persist local note edits",
  description: "Write notes locally and keep them readable on disk.",
  status: "backlog",
  acceptanceCriteria: [{ id: "criterion-1", text: "Notes save locally." }],
  implementationPlan: "Persist note edits to disk.",
  fileTargets: ["packages/app/src/server/routes/ticket-routes.ts"],
  coverageItemIds: [],
  blockedBy: [],
  blocks: [],
  runId: null,
  createdAt: "2026-03-16T11:00:00.000Z",
  updatedAt: "2026-03-16T11:00:00.000Z",
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

const renderView = (
  snapshot: ArtifactsSnapshot,
  onMoveTicket = vi.fn(async () => undefined),
) => {
  render(
    <MemoryRouter initialEntries={[`/initiative/${baseInitiative.id}?step=tickets`]}>
      <Routes>
        <Route
          path="/initiative/:id"
          element={
            <InitiativeRouteView
              snapshot={snapshot}
              onRefresh={vi.fn(async () => undefined)}
              onMoveTicket={onMoveTicket}
            />
          }
        />
        <Route path="/ticket/:id" element={<div>Ticket route</div>} />
      </Routes>
    </MemoryRouter>,
  );
};

describe("InitiativeView tickets layout", () => {
  it("uses the narrow planning column when tickets are not ready yet", () => {
    renderView({
      config: null,
      initiatives: [baseInitiative],
      tickets: [],
      runs: [],
      runAttempts: [],
      specs: [],
      planningReviews: [],
      ticketCoverageArtifacts: [],
    });

    expect(screen.getByText("Tickets aren't ready yet")).toBeInTheDocument();
    expect(
      screen.getByText("Tickets aren't ready yet").closest(".planning-step-column"),
    ).toHaveClass("planning-step-column-narrow");
  });

  it("uses the wide planning column once tickets exist", () => {
    renderView({
      config: null,
      initiatives: [
        {
          ...baseInitiative,
          phases: [{ id: "phase-1", name: "Foundation", order: 1, status: "active" }],
          ticketIds: [generatedTicket.id],
        },
      ],
      tickets: [generatedTicket],
      runs: [],
      runAttempts: [],
      specs: [],
      planningReviews: [],
      ticketCoverageArtifacts: [],
    });

    expect(screen.queryByText("Execution board")).not.toBeInTheDocument();
    expect(
      screen
        .getByRole("button", {
          name: "Select phase. Current phase Foundation",
        })
        .closest(".planning-step-column"),
    ).toHaveClass("planning-step-column-wide");
    expect(screen.queryByText("Review questions")).not.toBeInTheDocument();
    expect(screen.queryByText("Coverage check")).not.toBeInTheDocument();
  });

  it("navigates directly to the ticket page when a ticket is clicked", async () => {
    renderView({
      config: null,
      initiatives: [
        {
          ...baseInitiative,
          phases: [{ id: "phase-1", name: "Foundation", order: 1, status: "active" }],
          ticketIds: [generatedTicket.id],
        },
      ],
      tickets: [generatedTicket],
      runs: [],
      runAttempts: [],
      specs: [],
      planningReviews: [],
      ticketCoverageArtifacts: [],
    });

    fireEvent.click(screen.getByRole("button", { name: generatedTicket.title }));

    await waitFor(() => {
      expect(screen.getByText("Ticket route")).toBeInTheDocument();
    });
  });

  it("threads the shared ticket status handler into the initiative board", async () => {
    const onMoveTicket = vi.fn(async () => undefined);
    const dataTransfer = createDataTransfer();

    renderView({
      config: null,
      initiatives: [
        {
          ...baseInitiative,
          phases: [{ id: "phase-1", name: "Foundation", order: 1, status: "active" }],
          ticketIds: [generatedTicket.id],
        },
      ],
      tickets: [generatedTicket],
      runs: [],
      runAttempts: [],
      specs: [],
      planningReviews: [],
      ticketCoverageArtifacts: [],
    }, onMoveTicket);

    const ticketCard = screen.getByText(generatedTicket.title).closest("li");
    const readyColumn = screen.getByLabelText("Ready tickets");

    fireEvent.dragStart(ticketCard!, { dataTransfer });
    fireEvent.dragEnter(readyColumn, { dataTransfer });
    fireEvent.dragOver(readyColumn, { dataTransfer });
    fireEvent.drop(readyColumn, { dataTransfer });

    await waitFor(() => {
      expect(onMoveTicket).toHaveBeenCalledWith(generatedTicket.id, "ready");
    });
  });
});
