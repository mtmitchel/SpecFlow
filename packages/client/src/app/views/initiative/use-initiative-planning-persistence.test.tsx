// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Initiative, InitiativeRefinementState } from "../../../types.js";
import { useInitiativePlanningPersistence } from "./use-initiative-planning-persistence.js";
import type { SaveState, SpecStep } from "./shared.js";

const saveInitiativeRefinementMock = vi.fn();
const saveInitiativeSpecsMock = vi.fn();

vi.mock("../../../api.js", () => ({
  saveInitiativeRefinement: (...args: unknown[]) => saveInitiativeRefinementMock(...args),
  saveInitiativeSpecs: (...args: unknown[]) => saveInitiativeSpecsMock(...args),
}));

const initiative: Initiative = {
  id: "initiative-12345678",
  title: "Notes",
  description: "Build a local-first notes app.",
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
        questions: [],
        history: [],
        answers: {},
        defaultAnswerQuestionIds: [],
        baseAssumptions: [],
        checkedAt: "2026-03-21T10:00:00.000Z",
      },
      "core-flows": { questions: [], history: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      prd: { questions: [], history: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
      "tech-spec": { questions: [], history: [], answers: {}, defaultAnswerQuestionIds: [], baseAssumptions: [], checkedAt: null },
    },
  },
  createdAt: "2026-03-21T10:00:00.000Z",
  updatedAt: "2026-03-21T10:00:00.000Z",
};

const activeRefinement: InitiativeRefinementState = {
  questions: [
    {
      id: "brief-launch",
      label: "What should happen on launch?",
      type: "select",
      whyThisBlocks: "The brief needs one launch behavior.",
      affectedArtifact: "brief",
      decisionType: "behavior",
      assumptionIfUnanswered: "Open ready to capture.",
      options: ["Open ready to capture", "Show the notes list"],
      recommendedOption: "Open ready to capture",
      allowCustomAnswer: true,
    },
  ],
  history: [],
  answers: {},
  defaultAnswerQuestionIds: [],
  baseAssumptions: [],
  checkedAt: "2026-03-21T10:00:00.000Z",
};

const uncheckedRefinement: InitiativeRefinementState = {
  questions: [],
  history: [],
  answers: {},
  defaultAnswerQuestionIds: [],
  baseAssumptions: [],
  checkedAt: null,
};

const EMPTY_DRAFTS: Record<SpecStep, string> = {
  brief: "",
  "core-flows": "",
  prd: "",
  "tech-spec": "",
};

const EMPTY_DRAFT_SAVE_STATE: Record<SpecStep, SaveState> = {
  brief: "idle",
  "core-flows": "idle",
  prd: "idle",
  "tech-spec": "idle",
};

const PersistenceHarness = ({
  onRefresh,
  showError,
  persistedRefinement = activeRefinement,
}: {
  onRefresh: () => Promise<void>;
  showError: (message: string) => void;
  persistedRefinement?: InitiativeRefinementState;
}) => {
  const [refinementAnswers, setRefinementAnswers] = useState<Record<string, string | string[] | boolean>>({});
  const [defaultAnswerQuestionIds] = useState<string[]>([]);
  const [, setDraftSaveState] = useState<Record<SpecStep, SaveState>>(EMPTY_DRAFT_SAVE_STATE);
  const [editingStep, setEditingStep] = useState<SpecStep | null>(null);
  const [, setRefinementAssumptions] = useState<string[]>([]);
  const [refinementSaveState, setRefinementSaveState] = useState<SaveState>("idle");

  useInitiativePlanningPersistence({
    activeStep: "brief",
    activeRefinement: persistedRefinement,
    activeSurface: "questions",
    activeSpecStep: "brief",
    defaultAnswerQuestionIds,
    drafts: EMPTY_DRAFTS,
    drawerState: null,
    editingStep,
    initiative,
    onRefresh,
    refinementAnswers,
    savedDrafts: EMPTY_DRAFTS,
    setDraftSaveState,
    setEditingStep,
    setRefinementAssumptions,
    setRefinementSaveState,
    showError,
  });

  return (
    <div>
      <button type="button" onClick={() => setRefinementAnswers({ "brief-launch": "Open ready to capture" })}>
        First answer
      </button>
      <button type="button" onClick={() => setRefinementAnswers({ "brief-launch": "Show the notes list" })}>
        Second answer
      </button>
      <span data-testid="save-state">{refinementSaveState}</span>
    </div>
  );
};

describe("useInitiativePlanningPersistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveInitiativeRefinementMock.mockReset();
    saveInitiativeSpecsMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces rapid refinement saves and reruns once with the latest answers", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const showError = vi.fn();
    let resolveFirstSave: ((value: { assumptions: string[] }) => void) | null = null;

    saveInitiativeRefinementMock
      .mockImplementationOnce(
        () =>
          new Promise<{ assumptions: string[] }>((resolve) => {
            resolveFirstSave = resolve;
          }),
      )
      .mockResolvedValue({ assumptions: [] });

    render(<PersistenceHarness onRefresh={onRefresh} showError={showError} />);

    fireEvent.click(screen.getByRole("button", { name: "First answer" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(saveInitiativeRefinementMock).toHaveBeenCalledTimes(1);

    expect(saveInitiativeRefinementMock).toHaveBeenNthCalledWith(
      1,
      initiative.id,
      "brief",
      { "brief-launch": "Open ready to capture" },
      [],
      "questions",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Second answer" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(saveInitiativeRefinementMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirstSave?.({ assumptions: [] });
      await Promise.resolve();
    });

    expect(saveInitiativeRefinementMock).toHaveBeenCalledTimes(2);

    expect(saveInitiativeRefinementMock).toHaveBeenNthCalledWith(
      2,
      initiative.id,
      "brief",
      { "brief-launch": "Show the notes list" },
      [],
      "questions",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("save-state").textContent).toBe("saved");

    expect(showError).not.toHaveBeenCalled();
  });

  it("does not persist a fresh unanswered phase just to keep the questions surface active", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const showError = vi.fn();

    render(
      <PersistenceHarness
        onRefresh={onRefresh}
        showError={showError}
        persistedRefinement={uncheckedRefinement}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });

    expect(saveInitiativeRefinementMock).not.toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
  });

  it("keeps refinement save failures inline instead of firing a toast", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const showError = vi.fn();

    saveInitiativeRefinementMock.mockRejectedValue(
      new Error("Saving your brief answers took too long. Try again.")
    );

    render(<PersistenceHarness onRefresh={onRefresh} showError={showError} />);

    fireEvent.click(screen.getByRole("button", { name: "First answer" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("save-state").textContent).toBe("error");
    expect(showError).not.toHaveBeenCalled();
  });
});
