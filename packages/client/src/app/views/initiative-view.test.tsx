import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ArtifactsSnapshot, Initiative } from "../../types.js";
import { InitiativeRouteView } from "./initiative-route-view.js";

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
            label: "What problem should the first release solve?",
            type: "text",
            whyThisBlocks: "One focused problem — not a feature list.",
            affectedArtifact: "brief",
            decisionType: "scope",
            assumptionIfUnanswered: "Focus on the user's primary note-taking problem.",
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
      id: "spec-brief",
      initiativeId: initiative.id,
      type: "brief",
      title: "Brief",
      content: "# Brief\n\nA short summary.\n\n## Goals\n\n- Keep capture fast.\n- Support richer notes.",
      sourcePath: "specflow/initiatives/initiative-12345678/brief.md",
      createdAt: "2026-03-16T12:10:00.000Z",
      updatedAt: "2026-03-16T12:10:00.000Z"
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
    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=brief&handoff=created`]}>
        <Routes>
          <Route path="/initiative/:id" element={<WorkspaceWithLocation />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("New initiative")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Brief intake" })).toBeInTheDocument();
    expect(screen.getByText("What problem should the first release solve?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("?step=brief&handoff=created")).toBeInTheDocument();
    });
  });

  it("keeps review detail out of the page body until the drawer is opened", async () => {
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
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Summary" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Document" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByText("The scope is still too broad for a first release.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "See issues" }));

    expect(screen.getByRole("dialog", { name: "Brief review" })).toBeInTheDocument();
    expect(screen.getByText("The scope is still too broad for a first release.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with risk" })).toBeInTheDocument();
  });
});
