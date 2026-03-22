import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactsSnapshot, Initiative, Ticket } from "../../types.js";
import { InitiativeRouteView } from "./initiative-route-view.js";

const fetchSpecDetailMock = vi.fn();

vi.mock("../../api.js", async () => {
  const actual = await vi.importActual<typeof import("../../api.js")>("../../api.js");
  return {
    ...actual,
    fetchSpecDetail: (...args: unknown[]) => fetchSpecDetailMock(...args),
  };
});

vi.mock("../context/toast.js", () => ({
  useToast: () => ({ showError: vi.fn() }),
}));

vi.mock("../context/confirm.js", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(false),
}));

const initiative: Initiative = {
  id: "initiative-12345678",
  title: "Note App for Linux Fedora",
  description: "Build a Linux note app with fast capture and richer note editing.",
  status: "draft",
  phases: [],
  specIds: [],
  ticketIds: [],
  workflow: {
    activeStep: "brief",
    steps: {
      brief: { status: "ready", updatedAt: null },
      "core-flows": { status: "locked", updatedAt: null },
      prd: { status: "locked", updatedAt: null },
      "tech-spec": { status: "locked", updatedAt: null },
      validation: { status: "locked", updatedAt: null },
      tickets: { status: "locked", updatedAt: null },
    },
    refinements: {
      brief: {
        questions: [
          {
            id: "brief-problem",
            label: "What primary problem should v1 solve?",
            type: "select",
            whyThisBlocks: "One focused problem, not a feature list.",
            affectedArtifact: "brief",
            decisionType: "problem",
            assumptionIfUnanswered: "Focus on the primary note-taking problem.",
            options: ["Capture quickly", "Organize better"],
            recommendedOption: null,
            allowCustomAnswer: true,
          },
        ],
        history: [
          {
            id: "brief-problem",
            label: "What primary problem should v1 solve?",
            type: "select",
            whyThisBlocks: "One focused problem, not a feature list.",
            affectedArtifact: "brief",
            decisionType: "problem",
            assumptionIfUnanswered: "Focus on the primary note-taking problem.",
            options: ["Capture quickly", "Organize better"],
            recommendedOption: null,
            allowCustomAnswer: true,
          },
        ],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        checkedAt: "2026-03-16T12:05:00.000Z",
      },
      "core-flows": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      prd: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "tech-spec": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
    },
  },
  createdAt: "2026-03-16T12:00:00.000Z",
  updatedAt: "2026-03-16T12:00:00.000Z",
};

const briefSpecSummary = {
  id: `${initiative.id}:brief`,
  initiativeId: initiative.id,
  type: "brief" as const,
  title: "Brief",
  sourcePath: "specflow/initiatives/initiative-12345678/brief.md",
  createdAt: "2026-03-16T12:10:00.000Z",
  updatedAt: "2026-03-16T12:10:00.000Z",
};

const briefSpecDetail = {
  ...briefSpecSummary,
  content: "# Brief\n\nA short summary.\n\n## Goals\n\n- Keep capture fast.\n",
};

const techSpecSummary = {
  id: `${initiative.id}:tech-spec`,
  initiativeId: initiative.id,
  type: "tech-spec" as const,
  title: "Tech spec",
  sourcePath: "specflow/initiatives/initiative-12345678/tech-spec.md",
  createdAt: "2026-03-16T12:40:00.000Z",
  updatedAt: "2026-03-16T12:40:00.000Z",
};

const techSpecDetail = {
  ...techSpecSummary,
  content: "# Tech spec\n\n## Architecture\n\nDesktop-first delivery through Tauri.\n",
};

const createSnapshot = (specs: ArtifactsSnapshot["specs"] = []): ArtifactsSnapshot => ({
  config: null,
  initiatives: [initiative],
  tickets: [],
  runs: [],
  runAttempts: [],
  specs,
  planningReviews: [],
  ticketCoverageArtifacts: [],
});

const generatedTicket: Ticket = {
  id: "ticket-12345678",
  initiativeId: initiative.id,
  phaseId: "phase-1",
  title: "Persist note edits",
  description: "Keep note changes on disk.",
  status: "backlog",
  acceptanceCriteria: [],
  implementationPlan: "",
  fileTargets: [],
  coverageItemIds: [],
  blockedBy: [],
  blocks: [],
  runId: null,
  createdAt: "2026-03-16T13:00:00.000Z",
  updatedAt: "2026-03-16T13:00:00.000Z",
};

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
};

const renderRoute = (snapshot: ArtifactsSnapshot, initialEntry: string) =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <Routes>
        <Route path="/initiative/:id" element={<InitiativeRouteView snapshot={snapshot} onRefresh={vi.fn(async () => undefined)} />} />
      </Routes>
    </MemoryRouter>,
  );

describe("InitiativeRouteView planning surfaces", () => {
  beforeEach(() => {
    fetchSpecDetailMock.mockReset();
  });

  it("canonicalizes a bare initiative route to the planning questions surface when no artifact exists", async () => {
    renderRoute(createSnapshot(), `/initiative/${initiative.id}`);

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        `/initiative/${initiative.id}?step=brief&surface=questions`,
      );
    });

    expect(screen.getByText("What primary problem should v1 solve?")).toBeInTheDocument();
  });

  it("canonicalizes a bare initiative route to the review surface when the current step already has a document", async () => {
    fetchSpecDetailMock.mockResolvedValueOnce(briefSpecDetail);

    renderRoute(createSnapshot([briefSpecSummary]), `/initiative/${initiative.id}`);

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        `/initiative/${initiative.id}?step=brief&surface=review`,
      );
    });

    expect(screen.getByText("A short summary.")).toBeInTheDocument();
  });

  it("restores a bare initiative route to review when that step already has a document", async () => {
    fetchSpecDetailMock.mockResolvedValueOnce(briefSpecDetail);

    renderRoute(
      {
        ...createSnapshot([briefSpecSummary]),
        initiatives: [
          {
            ...initiative,
            workflow: {
              ...initiative.workflow,
              refinements: {
                ...initiative.workflow.refinements,
                brief: {
                  ...initiative.workflow.refinements.brief,
                  preferredSurface: "questions",
                },
              },
            },
          },
        ],
      },
      `/initiative/${initiative.id}`,
    );

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        `/initiative/${initiative.id}?step=brief&surface=review`,
      );
    });

    expect(screen.getByText("A short summary.")).toBeInTheDocument();
  });

  it("reopens the question surface from review through the explicit revise action", async () => {
    fetchSpecDetailMock.mockResolvedValueOnce(briefSpecDetail);

    renderRoute(createSnapshot([briefSpecSummary]), `/initiative/${initiative.id}?step=brief&surface=review`);

    const reviseButton = await screen.findByRole("button", { name: "Revise answers" });
    fireEvent.click(reviseButton);

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        `/initiative/${initiative.id}?step=brief&surface=questions`,
      );
    });

    expect(screen.getByText("What primary problem should v1 solve?")).toBeInTheDocument();
  });

  it("can reopen the question surface from persisted history even after active questions are cleared", async () => {
    fetchSpecDetailMock.mockResolvedValueOnce(briefSpecDetail);

    renderRoute(
      {
        ...createSnapshot([briefSpecSummary]),
        initiatives: [
          {
            ...initiative,
            workflow: {
              ...initiative.workflow,
              steps: {
                ...initiative.workflow.steps,
                brief: { status: "complete", updatedAt: "2026-03-16T12:10:00.000Z" },
                "core-flows": { status: "ready", updatedAt: null },
              },
              refinements: {
                ...initiative.workflow.refinements,
                brief: {
                  ...initiative.workflow.refinements.brief,
                  questions: [],
                  answers: {
                    "brief-problem": "Capture quickly",
                  },
                },
              },
            },
          },
        ],
      },
      `/initiative/${initiative.id}?step=brief&surface=review`,
    );

    const reviseButton = await screen.findByRole("button", { name: "Revise answers" });
    fireEvent.click(reviseButton);

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        `/initiative/${initiative.id}?step=brief&surface=questions`,
      );
    });

    expect(screen.getByText("All questions are answered")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate brief" })).toBeInTheDocument();
  });

  it("opens validation when the validation pipeline node is clicked after tickets exist", async () => {
    const validationReadyInitiative: Initiative = {
      ...initiative,
      phases: [{ id: "phase-1", name: "Foundation", order: 1, status: "active" }],
      ticketIds: [generatedTicket.id],
      workflow: {
        ...initiative.workflow,
        activeStep: "tickets",
        steps: {
          brief: { status: "complete", updatedAt: "2026-03-16T12:10:00.000Z" },
          "core-flows": { status: "complete", updatedAt: "2026-03-16T12:20:00.000Z" },
          prd: { status: "complete", updatedAt: "2026-03-16T12:30:00.000Z" },
          "tech-spec": { status: "complete", updatedAt: "2026-03-16T12:40:00.000Z" },
          validation: { status: "complete", updatedAt: "2026-03-16T12:50:00.000Z" },
          tickets: { status: "ready", updatedAt: "2026-03-16T13:00:00.000Z" },
        },
      },
    };

    renderRoute(
      {
        ...createSnapshot(),
        initiatives: [validationReadyInitiative],
        tickets: [generatedTicket],
      },
      `/initiative/${initiative.id}?step=tickets`,
    );

    fireEvent.click(screen.getByRole("button", { name: "Validation" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        `/initiative/${initiative.id}?step=validation`,
      );
    });

    expect(
      screen.getByText(
        "Validation is complete. The ticket plan is committed and ready in Tickets.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revise answers" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("opens review when a completed spec pipeline node is clicked even if that step last stayed on questions", async () => {
    fetchSpecDetailMock.mockResolvedValueOnce(techSpecDetail);

    const ticketsStageInitiative: Initiative = {
      ...initiative,
      phases: [{ id: "phase-1", name: "Foundation", order: 1, status: "active" }],
      ticketIds: [generatedTicket.id],
      workflow: {
        ...initiative.workflow,
        activeStep: "tickets",
        steps: {
          brief: { status: "complete", updatedAt: "2026-03-16T12:10:00.000Z" },
          "core-flows": { status: "complete", updatedAt: "2026-03-16T12:20:00.000Z" },
          prd: { status: "complete", updatedAt: "2026-03-16T12:30:00.000Z" },
          "tech-spec": { status: "complete", updatedAt: "2026-03-16T12:40:00.000Z" },
          validation: { status: "complete", updatedAt: "2026-03-16T12:50:00.000Z" },
          tickets: { status: "ready", updatedAt: "2026-03-16T13:00:00.000Z" },
        },
        refinements: {
          ...initiative.workflow.refinements,
          "tech-spec": {
            ...initiative.workflow.refinements["tech-spec"],
            preferredSurface: "questions",
          },
        },
      },
    };

    renderRoute(
      {
        ...createSnapshot([techSpecSummary]),
        initiatives: [ticketsStageInitiative],
        tickets: [generatedTicket],
      },
      `/initiative/${initiative.id}?step=tickets`,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tech spec" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        `/initiative/${initiative.id}?step=tech-spec&surface=review`,
      );
    });

    expect(screen.getByText("Desktop-first delivery through Tauri.")).toBeInTheDocument();
    expect(
      screen.queryByText("What primary problem should v1 solve?"),
    ).not.toBeInTheDocument();
  });
});
