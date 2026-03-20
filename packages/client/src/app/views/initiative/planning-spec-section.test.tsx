import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InitiativeRefinementState } from "../../../types.js";
import { ToastProvider } from "../../context/toast.js";
import { PlanningSpecSection } from "./planning-spec-section.js";

const { checkInitiativePhaseMock, generateInitiativeTechSpecMock } = vi.hoisted(() => ({
  checkInitiativePhaseMock: vi.fn(),
  generateInitiativeTechSpecMock: vi.fn(),
}));

vi.mock("../../../api.js", async () => {
  const actual = await vi.importActual<typeof import("../../../api.js")>("../../../api.js");
  return {
    ...actual,
    checkInitiativePhase: (...args: unknown[]) => checkInitiativePhaseMock(...args),
    generateInitiativeTechSpec: (...args: unknown[]) => generateInitiativeTechSpecMock(...args),
  };
});

const emptyRefinement: InitiativeRefinementState = {
  questions: [],
  answers: {},
  defaultAnswerQuestionIds: [],
  baseAssumptions: [],
  checkedAt: null,
};

describe("PlanningSpecSection", () => {
  beforeEach(() => {
    checkInitiativePhaseMock.mockReset();
    generateInitiativeTechSpecMock.mockReset();
  });

  it("shows an inline loading state instead of the completion card while updating an existing spec from survey answers", async () => {
    let resolvePhaseCheck:
      | ((value: { decision: "proceed"; questions: []; assumptions: [] }) => void)
      | undefined;

    checkInitiativePhaseMock.mockImplementation(
      () =>
        new Promise<{ decision: "proceed"; questions: []; assumptions: [] }>((resolve) => {
          resolvePhaseCheck = resolve;
        }),
    );
    generateInitiativeTechSpecMock.mockResolvedValue({
      markdown: "# Tech spec",
      reviews: [],
    });

    render(
      <ToastProvider>
        <PlanningSpecSection
          initiativeId="initiative-1"
          initiativeTitle="Simple desktop notes"
          activeSpecStep="tech-spec"
          activeSurface="questions"
          activeRefinement={{
            questions: [
              {
                id: "tech-architecture",
                label: "Which application architecture should v1 use?",
                type: "select",
                whyThisBlocks: "The tech spec needs one architecture before implementation can be drafted.",
                affectedArtifact: "tech-spec",
                decisionType: "architecture",
                assumptionIfUnanswered: "Use the current app architecture.",
                options: ["Tauri", "Native GTK"],
                optionHelp: {
                  Tauri: "Keeps the existing web UI and desktop shell split.",
                  "Native GTK": "Moves the app to a native widget stack.",
                },
                recommendedOption: "Tauri",
                allowCustomAnswer: false,
              },
            ],
            history: [
              {
                id: "tech-architecture",
                label: "Which application architecture should v1 use?",
                type: "select",
                whyThisBlocks: "The tech spec needs one architecture before implementation can be drafted.",
                affectedArtifact: "tech-spec",
                decisionType: "architecture",
                assumptionIfUnanswered: "Use the current app architecture.",
                options: ["Tauri", "Native GTK"],
                optionHelp: {
                  Tauri: "Keeps the existing web UI and desktop shell split.",
                  "Native GTK": "Moves the app to a native widget stack.",
                },
                recommendedOption: "Tauri",
                allowCustomAnswer: false,
              },
            ],
            answers: {
              "tech-architecture": "Tauri",
            },
            defaultAnswerQuestionIds: [],
            baseAssumptions: [],
            checkedAt: "2026-03-19T09:00:00.000Z",
          }}
          busyAction={null}
          isBusy={false}
          isDeletingInitiative={false}
          hasActiveContent
          hasRefinementQuestions
          hasPhaseSpecificRefinementDecisions
          unresolvedQuestionCount={0}
          nextStep="validation"
          nextStepActionLabel="Continue"
          handlePhaseCheckResult={vi.fn()}
          flushRefinementPersistence={vi.fn().mockResolvedValue(true)}
          refinementAnswers={{ "tech-architecture": "Tauri" }}
          defaultAnswerQuestionIds={[]}
          refinementAssumptions={[]}
          refinementSaveState="saved"
          guidanceQuestionId={null}
          guidanceText={null}
          savedDrafts={{
            brief: "",
            "core-flows": "",
            prd: "",
            "tech-spec": "# Existing tech spec",
          }}
          autoQuestionLoadStep={null}
          autoQuestionLoadFailedStep={null}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          navigateToStep={vi.fn()}
          setActiveSurface={vi.fn()}
          handleCheckAndAdvance={vi.fn().mockResolvedValue("completed")}
          onAdvanceToNextStep={vi.fn()}
          handleRequestGuidance={vi.fn()}
          updateRefinementAnswer={vi.fn()}
          deferRefinementQuestion={vi.fn()}
          openEditDrawer={vi.fn()}
          openRefinementDrawer={vi.fn()}
          renderSaveState={() => <span>Saved</span>}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Update tech spec" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Checking tech spec questions...");
    });

    expect(screen.queryByText("All questions are answered")).not.toBeInTheDocument();

    resolvePhaseCheck?.({
      decision: "proceed",
      questions: [],
      assumptions: [],
    });
  });

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
          nextStepActionLabel="Continue"
          handlePhaseCheckResult={vi.fn()}
          flushRefinementPersistence={vi.fn().mockResolvedValue(true)}
          refinementAnswers={{}}
          defaultAnswerQuestionIds={[]}
          refinementAssumptions={[]}
          refinementSaveState="idle"
          guidanceQuestionId={null}
          guidanceText={null}
          savedDrafts={{
            brief: "",
            "core-flows": "",
            prd: "",
            "tech-spec": "",
          }}
          autoQuestionLoadStep={null}
          autoQuestionLoadFailedStep={null}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          navigateToStep={vi.fn()}
          setActiveSurface={vi.fn()}
          handleCheckAndAdvance={vi.fn().mockResolvedValue("completed")}
          onAdvanceToNextStep={vi.fn()}
          handleRequestGuidance={vi.fn()}
          updateRefinementAnswer={vi.fn()}
          deferRefinementQuestion={vi.fn()}
          openEditDrawer={vi.fn()}
          openRefinementDrawer={vi.fn()}
          renderSaveState={() => null}
        />
      </ToastProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Preparing core flows questions...",
    );
    expect(
      screen.getByText(
        "Gathering the decisions needed before the first core flows draft.",
      ),
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
          nextStepActionLabel="Continue"
          handlePhaseCheckResult={vi.fn()}
          flushRefinementPersistence={vi.fn().mockResolvedValue(true)}
          refinementAnswers={{}}
          defaultAnswerQuestionIds={[]}
          refinementAssumptions={[]}
          refinementSaveState="idle"
          guidanceQuestionId={null}
          guidanceText={null}
          savedDrafts={{
            brief: "",
            "core-flows": "",
            prd: "",
            "tech-spec": "",
          }}
          autoQuestionLoadStep={null}
          autoQuestionLoadFailedStep={null}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          navigateToStep={vi.fn()}
          setActiveSurface={vi.fn()}
          handleCheckAndAdvance={vi.fn().mockResolvedValue("completed")}
          onAdvanceToNextStep={vi.fn()}
          handleRequestGuidance={vi.fn()}
          updateRefinementAnswer={vi.fn()}
          deferRefinementQuestion={vi.fn()}
          openEditDrawer={vi.fn()}
          openRefinementDrawer={vi.fn()}
          renderSaveState={() => null}
        />
      </ToastProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Preparing core flows questions...",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("uses Back for the previous pipeline stage and a separate action to reopen current-step answers", () => {
    const navigateToStep = vi.fn();
    const setActiveSurface = vi.fn();

    render(
      <ToastProvider>
        <PlanningSpecSection
          initiativeId="initiative-1"
          initiativeTitle="Simple desktop notes"
          activeSpecStep="core-flows"
          activeSurface="review"
          activeRefinement={{
            questions: [],
            history: [
              {
                id: "core-flow-primary",
                label: "What should the primary note flow feel like?",
                type: "select",
                whyThisBlocks: "The core flows need one primary path before they can be drafted.",
                affectedArtifact: "core-flows",
                decisionType: "journey",
                assumptionIfUnanswered: "Optimize for fast capture first.",
                options: ["Capture first, organize later", "Browse existing notes first"],
                recommendedOption: "Capture first, organize later",
                allowCustomAnswer: true,
              },
            ],
            answers: {
              "core-flow-primary": "Capture first, organize later",
            },
            defaultAnswerQuestionIds: [],
            baseAssumptions: [],
            checkedAt: "2026-03-19T09:00:00.000Z",
          }}
          busyAction={null}
          isBusy={false}
          isDeletingInitiative={false}
          hasActiveContent
          hasRefinementQuestions={false}
          hasPhaseSpecificRefinementDecisions
          unresolvedQuestionCount={0}
          nextStep="prd"
          nextStepActionLabel="Continue"
          handlePhaseCheckResult={vi.fn()}
          flushRefinementPersistence={vi.fn().mockResolvedValue(true)}
          refinementAnswers={{ "core-flow-primary": "Capture first, organize later" }}
          defaultAnswerQuestionIds={[]}
          refinementAssumptions={[]}
          refinementSaveState="saved"
          guidanceQuestionId={null}
          guidanceText={null}
          savedDrafts={{
            brief: "# Brief",
            "core-flows": "# Core flows",
            prd: "",
            "tech-spec": "",
          }}
          autoQuestionLoadStep={null}
          autoQuestionLoadFailedStep={null}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          navigateToStep={navigateToStep}
          setActiveSurface={setActiveSurface}
          handleCheckAndAdvance={vi.fn().mockResolvedValue("completed")}
          onAdvanceToNextStep={vi.fn()}
          handleRequestGuidance={vi.fn()}
          updateRefinementAnswer={vi.fn()}
          deferRefinementQuestion={vi.fn()}
          openEditDrawer={vi.fn()}
          openRefinementDrawer={vi.fn()}
          renderSaveState={() => <span>Saved</span>}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(navigateToStep).toHaveBeenCalledWith("brief", "review");

    fireEvent.click(screen.getByRole("button", { name: "Revise answers" }));
    expect(setActiveSurface).toHaveBeenCalledWith("questions");
  });

  it("keeps a revise action available when saved decisions exist without reopenable question history", () => {
    const openRefinementDrawer = vi.fn();
    const handleCheckAndAdvance = vi.fn().mockResolvedValue("completed");

    render(
      <ToastProvider>
        <PlanningSpecSection
          initiativeId="initiative-1"
          initiativeTitle="Simple desktop notes"
          activeSpecStep="prd"
          activeSurface="review"
          activeRefinement={{
            questions: [],
            history: [],
            answers: {
              "prd-scope": "Keep collaboration out of v1",
            },
            defaultAnswerQuestionIds: [],
            baseAssumptions: [],
            checkedAt: "2026-03-19T09:00:00.000Z",
          }}
          busyAction={null}
          isBusy={false}
          isDeletingInitiative={false}
          hasActiveContent
          hasRefinementQuestions={false}
          hasPhaseSpecificRefinementDecisions
          unresolvedQuestionCount={0}
          nextStep="tech-spec"
          nextStepActionLabel="Continue"
          handlePhaseCheckResult={vi.fn()}
          flushRefinementPersistence={vi.fn().mockResolvedValue(true)}
          refinementAnswers={{ "prd-scope": "Keep collaboration out of v1" }}
          defaultAnswerQuestionIds={[]}
          refinementAssumptions={[]}
          refinementSaveState="saved"
          guidanceQuestionId={null}
          guidanceText={null}
          savedDrafts={{
            brief: "# Brief",
            "core-flows": "# Core flows",
            prd: "# PRD",
            "tech-spec": "",
          }}
          autoQuestionLoadStep={null}
          autoQuestionLoadFailedStep={null}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          navigateToStep={vi.fn()}
          setActiveSurface={vi.fn()}
          handleCheckAndAdvance={handleCheckAndAdvance}
          onAdvanceToNextStep={vi.fn()}
          handleRequestGuidance={vi.fn()}
          updateRefinementAnswer={vi.fn()}
          deferRefinementQuestion={vi.fn()}
          openEditDrawer={vi.fn()}
          openRefinementDrawer={openRefinementDrawer}
          renderSaveState={() => <span>Saved</span>}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Revise answers" }));

    expect(openRefinementDrawer).toHaveBeenCalledWith("prd");
    expect(handleCheckAndAdvance).toHaveBeenCalledWith("prd");
  });

  it("keeps a revise action available when the step was previously checked even if answers are not present", () => {
    const openRefinementDrawer = vi.fn();
    const handleCheckAndAdvance = vi.fn().mockResolvedValue("completed");

    render(
      <ToastProvider>
        <PlanningSpecSection
          initiativeId="initiative-1"
          initiativeTitle="Simple desktop notes"
          activeSpecStep="prd"
          activeSurface="review"
          activeRefinement={{
            questions: [],
            history: [],
            answers: {},
            defaultAnswerQuestionIds: [],
            baseAssumptions: [],
            checkedAt: "2026-03-19T09:00:00.000Z",
          }}
          busyAction={null}
          isBusy={false}
          isDeletingInitiative={false}
          hasActiveContent
          hasRefinementQuestions={false}
          hasPhaseSpecificRefinementDecisions={false}
          unresolvedQuestionCount={0}
          nextStep="tech-spec"
          nextStepActionLabel="Continue"
          handlePhaseCheckResult={vi.fn()}
          flushRefinementPersistence={vi.fn().mockResolvedValue(true)}
          refinementAnswers={{}}
          defaultAnswerQuestionIds={[]}
          refinementAssumptions={[]}
          refinementSaveState="saved"
          guidanceQuestionId={null}
          guidanceText={null}
          savedDrafts={{
            brief: "# Brief",
            "core-flows": "# Core flows",
            prd: "# PRD",
            "tech-spec": "",
          }}
          autoQuestionLoadStep={null}
          autoQuestionLoadFailedStep={null}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          navigateToStep={vi.fn()}
          setActiveSurface={vi.fn()}
          handleCheckAndAdvance={handleCheckAndAdvance}
          onAdvanceToNextStep={vi.fn()}
          handleRequestGuidance={vi.fn()}
          updateRefinementAnswer={vi.fn()}
          deferRefinementQuestion={vi.fn()}
          openEditDrawer={vi.fn()}
          openRefinementDrawer={openRefinementDrawer}
          renderSaveState={() => <span>Saved</span>}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Revise answers" }));

    expect(openRefinementDrawer).toHaveBeenCalledWith("prd");
    expect(handleCheckAndAdvance).toHaveBeenCalledWith("prd");
  });

  it("uses the survey Back action to leave for the previous pipeline stage", () => {
    const navigateToStep = vi.fn();
    const setActiveSurface = vi.fn();

    render(
      <ToastProvider>
        <PlanningSpecSection
          initiativeId="initiative-1"
          initiativeTitle="Simple desktop notes"
          activeSpecStep="core-flows"
          activeSurface="questions"
          activeRefinement={{
            questions: [
              {
                id: "core-flow-primary",
                label: "What should the primary note flow feel like?",
                type: "select",
                whyThisBlocks: "The core flows need one primary path before they can be drafted.",
                affectedArtifact: "core-flows",
                decisionType: "journey",
                assumptionIfUnanswered: "Optimize for fast capture first.",
                options: ["Capture first, organize later", "Browse existing notes first"],
                recommendedOption: "Capture first, organize later",
                allowCustomAnswer: true,
              },
            ],
            history: [
              {
                id: "core-flow-primary",
                label: "What should the primary note flow feel like?",
                type: "select",
                whyThisBlocks: "The core flows need one primary path before they can be drafted.",
                affectedArtifact: "core-flows",
                decisionType: "journey",
                assumptionIfUnanswered: "Optimize for fast capture first.",
                options: ["Capture first, organize later", "Browse existing notes first"],
                recommendedOption: "Capture first, organize later",
                allowCustomAnswer: true,
              },
            ],
            answers: {
              "core-flow-primary": "Capture first, organize later",
            },
            defaultAnswerQuestionIds: [],
            baseAssumptions: [],
            checkedAt: "2026-03-19T09:00:00.000Z",
          }}
          busyAction={null}
          isBusy={false}
          isDeletingInitiative={false}
          hasActiveContent
          hasRefinementQuestions={false}
          hasPhaseSpecificRefinementDecisions
          unresolvedQuestionCount={0}
          nextStep="prd"
          nextStepActionLabel="Continue"
          handlePhaseCheckResult={vi.fn()}
          flushRefinementPersistence={vi.fn().mockResolvedValue(true)}
          refinementAnswers={{ "core-flow-primary": "Capture first, organize later" }}
          defaultAnswerQuestionIds={[]}
          refinementAssumptions={[]}
          refinementSaveState="saved"
          guidanceQuestionId={null}
          guidanceText={null}
          savedDrafts={{
            brief: "# Brief",
            "core-flows": "# Core flows",
            prd: "",
            "tech-spec": "",
          }}
          autoQuestionLoadStep={null}
          autoQuestionLoadFailedStep={null}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          navigateToStep={navigateToStep}
          setActiveSurface={setActiveSurface}
          handleCheckAndAdvance={vi.fn().mockResolvedValue("completed")}
          onAdvanceToNextStep={vi.fn()}
          handleRequestGuidance={vi.fn()}
          updateRefinementAnswer={vi.fn()}
          deferRefinementQuestion={vi.fn()}
          openEditDrawer={vi.fn()}
          openRefinementDrawer={vi.fn()}
          renderSaveState={() => <span>Saved</span>}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(navigateToStep).toHaveBeenCalledWith("brief", "review");
    expect(setActiveSurface).not.toHaveBeenCalled();
  });
});
