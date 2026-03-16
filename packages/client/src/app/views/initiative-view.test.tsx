import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ArtifactsSnapshot, Initiative } from "../../types.js";
import { InitiativeView } from "./initiative-view.js";

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
      brief: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
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

const WorkspaceWithLocation = () => {
  const location = useLocation();

  return (
    <>
      <div>{location.search || "(no search)"}</div>
      <InitiativeView snapshot={snapshot} onRefresh={vi.fn(async () => undefined)} />
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

    expect(screen.getByRole("heading", { name: "Start with brief intake" })).toBeInTheDocument();
    expect(
      screen.getByText("Answer a short intake before SpecFlow writes the first brief. The brief should never appear fully formed from a raw idea.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start brief intake" })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("?step=brief")).toBeInTheDocument();
    });
  });
});
