import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { InitiativeRefinementState } from "../../../types.js";
import { ToastProvider } from "../../context/toast.js";
import { PlanningSpecSection } from "./planning-spec-section.js";

const emptyRefinement: InitiativeRefinementState = {
  questions: [],
  answers: {},
  defaultAnswerQuestionIds: [],
  baseAssumptions: [],
  checkedAt: null
};

describe("PlanningSpecSection", () => {
  it("shows a handoff loading state instead of rendering a blank column while the next step is preparing", () => {
    render(
      <ToastProvider>
        <PlanningSpecSection
          initiativeId="initiative-1"
          initiativeTitle="Simple desktop notes"
          activeSpecStep="core-flows"
          activeSurface="questions"
          activeRefinement={emptyRefinement}
          busyAction={null}
          isBusy={false}
          isDeletingInitiative={false}
          hasActiveContent={false}
          hasRefinementQuestions={false}
          hasPhaseSpecificRefinementDecisions={false}
          unresolvedQuestionCount={0}
          nextStep="prd"
          handlePhaseCheckResult={vi.fn()}
          flushRefinementPersistence={vi.fn().mockResolvedValue(true)}
          refinementAnswers={{}}
          defaultAnswerQuestionIds={[]}
          refinementAssumptions={[]}
          refinementSaveState="idle"
          guidanceQuestionId={null}
          guidanceText={null}
          savedDrafts={{ brief: "", "core-flows": "", prd: "", "tech-spec": "" }}
          autoQuestionLoadStep={null}
          autoQuestionLoadFailedStep={null}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          navigateToStep={vi.fn()}
          setActiveSurface={vi.fn()}
          handleCheckAndAdvance={vi.fn().mockResolvedValue("completed")}
          handleRequestGuidance={vi.fn()}
          updateRefinementAnswer={vi.fn()}
          deferRefinementQuestion={vi.fn()}
          openEditDrawer={vi.fn()}
          renderSaveState={() => null}
        />
      </ToastProvider>
    );

    expect(screen.getByRole("status")).toHaveTextContent("Preparing core flows questions...");
    expect(
      screen.getByText("Gathering the decisions needed before the first core flows draft.")
    ).toBeInTheDocument();
  });

  it("stops showing the handoff spinner forever and falls back to retry", async () => {
    vi.useFakeTimers();

    render(
      <ToastProvider>
        <PlanningSpecSection
          initiativeId="initiative-1"
          initiativeTitle="Simple desktop notes"
          activeSpecStep="core-flows"
          activeSurface="questions"
          activeRefinement={emptyRefinement}
          busyAction={null}
          isBusy={false}
          isDeletingInitiative={false}
          hasActiveContent={false}
          hasRefinementQuestions={false}
          hasPhaseSpecificRefinementDecisions={false}
          unresolvedQuestionCount={0}
          nextStep="prd"
          handlePhaseCheckResult={vi.fn()}
          flushRefinementPersistence={vi.fn().mockResolvedValue(true)}
          refinementAnswers={{}}
          defaultAnswerQuestionIds={[]}
          refinementAssumptions={[]}
          refinementSaveState="idle"
          guidanceQuestionId={null}
          guidanceText={null}
          savedDrafts={{ brief: "", "core-flows": "", prd: "", "tech-spec": "" }}
          autoQuestionLoadStep={null}
          autoQuestionLoadFailedStep={null}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          navigateToStep={vi.fn()}
          setActiveSurface={vi.fn()}
          handleCheckAndAdvance={vi.fn().mockResolvedValue("completed")}
          handleRequestGuidance={vi.fn()}
          updateRefinementAnswer={vi.fn()}
          deferRefinementQuestion={vi.fn()}
          openEditDrawer={vi.fn()}
          renderSaveState={() => null}
        />
      </ToastProvider>
    );

    expect(screen.getByRole("status")).toHaveTextContent("Preparing core flows questions...");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();

    vi.useRealTimers();
  });
});
