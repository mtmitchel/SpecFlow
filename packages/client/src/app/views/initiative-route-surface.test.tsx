import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactsSnapshot, Initiative } from "../../types.js";
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

  it("returns Back from review to the questions surface instead of keeping the document view open", async () => {
    fetchSpecDetailMock.mockResolvedValueOnce(briefSpecDetail);

    renderRoute(createSnapshot([briefSpecSummary]), `/initiative/${initiative.id}?step=brief&surface=review`);

    const backButton = await screen.findByRole("button", { name: "Back" });
    fireEvent.click(backButton);

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

    const backButton = await screen.findByRole("button", { name: "Back" });
    fireEvent.click(backButton);

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        `/initiative/${initiative.id}?step=brief&surface=questions`,
      );
    });

    expect(screen.getByText("What primary problem should v1 solve?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate brief" })).toBeInTheDocument();
  });
});
