import { render, screen } from "@testing-library/react";
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

    expect(screen.getByRole("status")).toHaveTextContent("Getting the questions ready");
    expect(
      screen.getByText("SpecFlow is checking what it needs before drafting the core flows.")
    ).toBeInTheDocument();
  });
});
