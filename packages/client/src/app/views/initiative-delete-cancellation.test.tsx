import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactsSnapshot, Initiative } from "../../types.js";
import { InitiativeRouteView } from "./initiative-route-view.js";

const checkInitiativePhaseMock = vi.fn();
const deleteInitiativeMock = vi.fn();
const confirmMock = vi.fn();

vi.mock("../../api.js", async () => {
  const actual = await vi.importActual<typeof import("../../api.js")>("../../api.js");
  return {
    ...actual,
    checkInitiativePhase: (...args: unknown[]) => checkInitiativePhaseMock(...args),
  };
});

vi.mock("../../api/initiatives.js", () => ({
  deleteInitiative: (...args: unknown[]) => deleteInitiativeMock(...args),
}));

vi.mock("../context/toast.js", () => ({
  useToast: () => ({ showError: vi.fn() }),
}));

vi.mock("../context/confirm.js", () => ({
  useConfirm: () => confirmMock,
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
    activeStep: "core-flows",
    steps: {
      brief: { status: "complete", updatedAt: "2026-03-16T12:10:00.000Z" },
      "core-flows": { status: "ready", updatedAt: null },
      prd: { status: "locked", updatedAt: null },
      "tech-spec": { status: "locked", updatedAt: null },
      tickets: { status: "locked", updatedAt: null },
    },
    refinements: {
      brief: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "core-flows": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      prd: { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "tech-spec": { questions: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
    },
  },
  createdAt: "2026-03-16T12:00:00.000Z",
  updatedAt: "2026-03-16T12:00:00.000Z",
};

const snapshot: ArtifactsSnapshot = {
  config: null,
  initiatives: [initiative],
  tickets: [],
  runs: [],
  runAttempts: [],
  specs: [
    {
      id: `${initiative.id}:brief`,
      initiativeId: initiative.id,
      type: "brief",
      title: "Brief",
      sourcePath: "specflow/initiatives/initiative-12345678/brief.md",
      createdAt: "2026-03-16T12:10:00.000Z",
      updatedAt: "2026-03-16T12:10:00.000Z",
    },
  ],
  planningReviews: [],
  ticketCoverageArtifacts: [],
};

describe("Initiative delete cancellation", () => {
  beforeEach(() => {
    checkInitiativePhaseMock.mockReset();
    deleteInitiativeMock.mockReset();
    confirmMock.mockReset();
  });

  it("cancels the in-flight question load before deleting the initiative", async () => {
    let aborted = false;
    checkInitiativePhaseMock.mockImplementation(
      (_initiativeId: string, _step: string, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new Error("Request cancelled"));
            },
            { once: true },
          );
        }),
    );
    deleteInitiativeMock.mockResolvedValue(undefined);
    confirmMock.mockResolvedValue(true);

    render(
      <MemoryRouter initialEntries={[`/initiative/${initiative.id}?step=core-flows`]}>
        <Routes>
          <Route path="/" element={<div>home</div>} />
          <Route
            path="/initiative/:id"
            element={<InitiativeRouteView snapshot={snapshot} onRefresh={vi.fn(async () => undefined)} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Preparing core flows questions...")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete initiative" }));

    expect(await screen.findByText("Deleting initiative")).toBeInTheDocument();
    expect(screen.queryByText("Preparing core flows questions...")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(deleteInitiativeMock).toHaveBeenCalledWith(initiative.id);
    });

    expect(aborted).toBe(true);
    expect(await screen.findByText("home")).toBeInTheDocument();
  });
});
