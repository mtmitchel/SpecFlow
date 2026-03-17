import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
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
  useToast: () => ({ showError: vi.fn() })
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
      tickets: { status: "locked", updatedAt: null }
    },
    refinements: {
      brief: {
        questions: [
          {
            id: "brief-problem",
            label: "Which problem matters most in v1?",
            type: "select",
            whyThisBlocks: "One focused problem — not a feature list.",
            affectedArtifact: "brief",
            decisionType: "scope",
            assumptionIfUnanswered: "Focus on the user's primary note-taking problem.",
            options: [
              "Capture something quickly",
              "Find or organize things better",
              "Replace an existing tool or workflow",
              "Support a platform-specific need",
              "Other"
            ],
            optionHelp: {
              "Capture something quickly": "Use this when speed matters most."
            },
            recommendedOption: null
          },
        ],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        checkedAt: "2026-03-16T12:05:00.000Z",
      },
      "core-flows": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      prd: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "tech-spec": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null }
    }
  },
  createdAt: "2026-03-16T12:00:00.000Z",
  updatedAt: "2026-03-16T12:00:00.000Z"
};

const snapshot: ArtifactsSnapshot = {
  config: null,
  initiatives: [initiative],
  tickets: [],
  runs: [],
  runAttempts: [],
  specs: [],
  planningReviews: [],
  ticketCoverageArtifacts: []
};

const briefSpec = {
  id: `${initiative.id}:brief`,
  initiativeId: initiative.id,
  type: "brief" as const,
  title: "Brief",
  content: "# Brief\n\nA short summary.\n\n## Goals\n\n- Keep capture fast.\n- Support richer notes.",
  sourcePath: "specflow/initiatives/initiative-12345678/brief.md",
  createdAt: "2026-03-16T12:10:00.000Z",
  updatedAt: "2026-03-16T12:10:00.000Z"
};

const reviewSnapshot: ArtifactsSnapshot = {
  ...snapshot,
  initiatives: [
    {
      ...initiative,
      workflow: {
        activeStep: "brief",
        steps: {
          brief: { status: "stale", updatedAt: "2026-03-16T12:10:00.000Z" },
          "core-flows": { status: "locked", updatedAt: null },
          prd: { status: "locked", updatedAt: null },
          "tech-spec": { status: "locked", updatedAt: null },
          tickets: { status: "locked", updatedAt: null }
        },
        refinements: initiative.workflow.refinements
      }
    }
  ],
  specs: [
    {
      id: briefSpec.id,
      initiativeId: briefSpec.initiativeId,
      type: briefSpec.type,
      title: briefSpec.title,
      sourcePath: briefSpec.sourcePath,
      createdAt: briefSpec.createdAt,
      updatedAt: briefSpec.updatedAt
    }
  ],
  planningReviews: [
    {
      id: `${initiative.id}:brief-review`,
      initiativeId: initiative.id,
      kind: "brief-review",
      status: "blocked",
      summary: "The brief still needs one clearer scope decision.",
      findings: [
        {
          id: "finding-1",
          type: "blocker",
          message: "The scope is still too broad for a first release.",
          relatedArtifacts: ["brief"]
        },
        {
          id: "finding-2",
          type: "warning",
          message: "The goals still need one measurable success metric.",
          relatedArtifacts: ["brief"]
        }
      ],
      sourceUpdatedAts: {
        brief: "2026-03-16T12:10:00.000Z"
      },
      overrideReason: null,
      reviewedAt: "2026-03-16T12:12:00.000Z",
      updatedAt: "2026-03-16T12:12:00.000Z"
    }
  ]
};

const completedReviewBlockedSnapshot: ArtifactsSnapshot = {
  ...snapshot,
  initiatives: [
    {
      ...initiative,
      workflow: {
        activeStep: "core-flows",
        steps: {
          brief: { status: "complete", updatedAt: "2026-03-16T12:10:00.000Z" },
          "core-flows": { status: "ready", updatedAt: "2026-03-16T12:12:00.000Z" },
          prd: { status: "locked", updatedAt: null },
          "tech-spec": { status: "locked", updatedAt: null },
          tickets: { status: "locked", updatedAt: null }
        },
        refinements: initiative.workflow.refinements
      }
    }
  ],
  specs: [
    {
      id: briefSpec.id,
      initiativeId: briefSpec.initiativeId,
      type: briefSpec.type,
      title: briefSpec.title,
      sourcePath: briefSpec.sourcePath,
      createdAt: briefSpec.createdAt,
      updatedAt: briefSpec.updatedAt
    }
  ],
  planningReviews: reviewSnapshot.planningReviews
};

const WorkspaceWithLocation = () => {
  const location = useLocation();

  return (
    <>
      <div>{location.search || "(no search)"}</div>
      <InitiativeRouteView snapshot={snapshot} onRefresh={vi.fn(async () => undefined)} />
    </>
  );
};

describe("InitiativeView", () => {
  it("lands the user in the contained brief intake stage after initiative creation", async () => {
    fetchSpecDetailMock.mockResolvedValue(briefSpec);

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=brief&handoff=created`]}>
        <Routes>
          <Route path="/initiative/:id" element={<WorkspaceWithLocation />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("New initiative")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Brief intake" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Idea" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change idea" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "What do you want to build?" })).not.toBeInTheDocument();
    expect(screen.queryByText("Build a Linux note app with fast capture and richer note editing.")).not.toBeInTheDocument();
    expect(screen.getByText("Which problem matters most in v1?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("heading", { name: "What do you want to build?" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Build a Linux note app with fast capture and richer note editing.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Which problem matters most in v1?")).toBeInTheDocument();
    expect(screen.queryByText("Build a Linux note app with fast capture and richer note editing.")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("?step=brief&handoff=created")).toBeInTheDocument();
    });
  });

  it("keeps blocked brief work in the clarification flow instead of dumping review findings into the page", async () => {
    fetchSpecDetailMock.mockResolvedValue(briefSpec);

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=brief`]}>
        <Routes>
          <Route
            path="/initiative/:id"
            element={<InitiativeRouteView snapshot={reviewSnapshot} onRefresh={vi.fn(async () => undefined)} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Brief" })).toBeInTheDocument();
    expect(screen.getByText("Which problem matters most in v1?")).toBeInTheDocument();
    expect(screen.queryByText("The scope is still too broad for a first release.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Capture something quickly/i })).toBeInTheDocument();
    expect(screen.queryByText("24 questions to answer")).not.toBeInTheDocument();
    expect(screen.queryByText("The scope is still too broad for a first release.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move on anyway" })).not.toBeInTheDocument();
  });

  it("does not surface override actions while clarification is still required", async () => {
    fetchSpecDetailMock.mockResolvedValue(briefSpec);

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=brief`]}>
        <Routes>
          <Route
            path="/initiative/:id"
            element={<InitiativeRouteView snapshot={reviewSnapshot} onRefresh={vi.fn(async () => undefined)} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText("More")).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Move on anyway" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change inputs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit text" })).not.toBeInTheDocument();
    expect(screen.getByText("Which problem matters most in v1?")).toBeInTheDocument();
  });

  it("keeps the blocked phase active in the pipeline when the next phase is ready", () => {
    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=core-flows`]}>
        <Routes>
          <Route
            path="/initiative/:id"
            element={
              <InitiativeRouteView snapshot={completedReviewBlockedSnapshot} onRefresh={vi.fn(async () => undefined)} />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Brief" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Brief" })).toHaveClass("pipeline-node-checkpoint");
    expect(screen.getByRole("button", { name: "Core flows" })).toHaveClass("pipeline-node-future");
  });
});
