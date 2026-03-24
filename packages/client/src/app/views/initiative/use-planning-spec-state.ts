import { useEffect, useRef, useState } from "react";
import type { InitiativePhaseCheckResult } from "../../../api/initiatives.js";
import type {
  InitiativePlanningStep,
  InitiativeRefinementState,
} from "../../../types.js";
import type { InitiativePlanningSurface } from "../../utils/initiative-progress.js";
import {
  getPreviousInitiativeStep,
  INITIATIVE_WORKFLOW_LABELS,
} from "../../utils/initiative-workflow.js";
import {
  getPlanningGenerationTransitionCopy,
  getPlanningQuestionTransitionCopy,
} from "../../utils/ui-language.js";
import type { BusyActionResult } from "./use-cancellable-busy-action.js";
import { usePhaseAutoAdvance } from "./use-phase-auto-advance.js";
import {
  getVisibleRefinementQuestions,
} from "./refinement-history.js";
import type { SpecStep } from "./shared.js";

const ENTRY_LOADING_STALL_MS = 3_000;

interface UsePlanningSpecStateInput {
  initiativeId: string;
  activeSpecStep: SpecStep;
  activeSurface: InitiativePlanningSurface;
  activeRefinement: InitiativeRefinementState | null;
  busyAction: string | null;
  isDeletingInitiative: boolean;
  hasActiveContent: boolean;
  hasPhaseSpecificRefinementDecisions: boolean;
  unresolvedQuestionCount: number;
  nextStep: InitiativePlanningStep | null;
  nextStepActionLabel: string | null;
  handlePhaseCheckResult: (
    step: SpecStep,
    result: InitiativePhaseCheckResult,
  ) => void;
  flushRefinementPersistence: () => Promise<boolean>;
  refinementAnswers: Record<string, string | string[] | boolean>;
  defaultAnswerQuestionIds: string[];
  autoQuestionLoadStep: SpecStep | null;
  autoQuestionLoadFailedStep: SpecStep | null;
  onRefresh: () => Promise<void>;
  navigateToStep: (
    step: InitiativePlanningStep,
    surface?: InitiativePlanningSurface | null,
  ) => void;
  setActiveSurface: (surface: InitiativePlanningSurface) => void;
  handleCheckAndAdvance: (step: SpecStep) => Promise<BusyActionResult>;
  onAdvanceToNextStep: (() => void) | null;
  openRefinementDrawer: (step: SpecStep) => void;
}

export const usePlanningSpecState = ({
  initiativeId,
  activeSpecStep,
  activeSurface,
  activeRefinement,
  busyAction,
  isDeletingInitiative,
  hasActiveContent,
  hasPhaseSpecificRefinementDecisions,
  unresolvedQuestionCount,
  nextStep,
  nextStepActionLabel,
  handlePhaseCheckResult,
  flushRefinementPersistence,
  refinementAnswers,
  defaultAnswerQuestionIds,
  autoQuestionLoadStep,
  autoQuestionLoadFailedStep,
  onRefresh,
  navigateToStep,
  setActiveSurface,
  handleCheckAndAdvance,
  onAdvanceToNextStep,
  openRefinementDrawer,
}: UsePlanningSpecStateInput) => {
  const [surveyResumeKey, setSurveyResumeKey] = useState(0);
  const [entryLoadingStalled, setEntryLoadingStalled] = useState(false);
  const downstreamEntryGenerationRef = useRef<SpecStep | null>(null);
  const previousSurfaceRef = useRef<InitiativePlanningSurface>(activeSurface);
  const {
    autoAdvanceFailedStage,
    autoAdvanceStep,
    autoAdvanceFailedStep,
    beginAutoAdvance,
    cancelAutoAdvance,
    isAutoGenerating,
    isAutoPending,
  } = usePhaseAutoAdvance({
    initiativeId,
    navigateToStep,
    nextStep,
    onRefresh,
    onPhaseCheckResult: handlePhaseCheckResult,
  });

  useEffect(() => {
    if (!isDeletingInitiative) {
      return;
    }

    cancelAutoAdvance();
  }, [cancelAutoAdvance, isDeletingInitiative]);

  const refinementCheckedAt = activeRefinement?.checkedAt ?? null;
  const label = INITIATIVE_WORKFLOW_LABELS[activeSpecStep];
  const previousStep = getPreviousInitiativeStep(activeSpecStep);
  const previousStepLabel = previousStep ? "Back" : null;
  const hasRevisableQuestions =
    getVisibleRefinementQuestions(activeRefinement).length > 0;
  const canReviseAnswers =
    refinementCheckedAt !== null ||
    hasRevisableQuestions ||
    hasPhaseSpecificRefinementDecisions;
  const showingInlineSurvey =
    activeSurface === "questions" && hasRevisableQuestions;
  const shouldAutoStartBrief =
    activeSpecStep === "brief" &&
    !hasActiveContent &&
    !hasRevisableQuestions &&
    !hasPhaseSpecificRefinementDecisions &&
    !refinementCheckedAt;
  const shouldAutoGenerateAfterEntryCheck =
    activeSpecStep !== "brief" &&
    !hasActiveContent &&
    !hasRevisableQuestions &&
    !hasPhaseSpecificRefinementDecisions &&
    Boolean(refinementCheckedAt);

  useEffect(() => {
    if (
      activeSurface === "questions" &&
      previousSurfaceRef.current !== "questions"
    ) {
      setSurveyResumeKey((current) => current + 1);
    }

    previousSurfaceRef.current = activeSurface;
  }, [activeSpecStep, activeSurface]);

  useEffect(() => {
    if (!shouldAutoStartBrief) {
      return;
    }

    if (
      (isAutoPending && autoAdvanceStep === "brief") ||
      autoAdvanceFailedStep === "brief"
    ) {
      return;
    }

    void beginAutoAdvance("brief", {
      navigateOnSuccess: false,
    });
  }, [
    autoAdvanceFailedStep,
    autoAdvanceStep,
    beginAutoAdvance,
    isAutoPending,
    shouldAutoStartBrief,
  ]);

  useEffect(() => {
    if (!shouldAutoGenerateAfterEntryCheck) {
      downstreamEntryGenerationRef.current = null;
      return;
    }

    if (
      downstreamEntryGenerationRef.current === activeSpecStep ||
      autoQuestionLoadStep === activeSpecStep ||
      (autoQuestionLoadFailedStep === activeSpecStep && !refinementCheckedAt) ||
      autoAdvanceStep === activeSpecStep
    ) {
      return;
    }

    downstreamEntryGenerationRef.current = activeSpecStep;
    void beginAutoAdvance(activeSpecStep, {
      navigateOnSuccess: false,
      skipCheck: true,
    });
  }, [
    activeSpecStep,
    autoAdvanceStep,
    autoQuestionLoadFailedStep,
    autoQuestionLoadStep,
    beginAutoAdvance,
    refinementCheckedAt,
    shouldAutoGenerateAfterEntryCheck,
  ]);

  const loadingQuestions =
    autoQuestionLoadStep === activeSpecStep ||
    (isAutoPending && autoAdvanceStep === activeSpecStep && !isAutoGenerating);
  const generatingStep =
    busyAction === `generate-${activeSpecStep}` ||
    (activeSpecStep === autoAdvanceStep && isAutoGenerating);
  const loadingStateCopy = loadingQuestions
    ? getPlanningQuestionTransitionCopy(
        activeSpecStep,
        activeRefinement?.questions.length && unresolvedQuestionCount === 0
          ? "follow-up"
          : "entry",
      )
    : null;
  const entryLoadingCopy = getPlanningQuestionTransitionCopy(
    activeSpecStep,
    "entry",
  );
  const generationStateCopy =
    getPlanningGenerationTransitionCopy(activeSpecStep);
  const loadingStateLabel = loadingStateCopy?.title ?? null;
  const loadingStateBody = loadingStateCopy?.body ?? null;
  const inlineSurveyLoadingLabel = loadingQuestions
    ? loadingStateLabel
    : generatingStep
      ? generationStateCopy.title
      : null;
  const inlineSurveyLoadingBody = loadingQuestions
    ? loadingStateBody
    : generatingStep
      ? generationStateCopy.body
      : null;
  const questionLoadFailed =
    (activeSpecStep === "brief"
      ? autoAdvanceFailedStep === activeSpecStep
      : autoQuestionLoadFailedStep === activeSpecStep ||
        autoAdvanceFailedStep === activeSpecStep) &&
    (!refinementCheckedAt || autoAdvanceFailedStage === "check");
  const generationFailed =
    autoAdvanceFailedStep === activeSpecStep &&
    autoAdvanceFailedStage === "generate" &&
    !hasActiveContent;
  const showEntryLoadingFallback =
    !hasActiveContent &&
    !hasRevisableQuestions &&
    !loadingQuestions &&
    !generatingStep &&
    !questionLoadFailed &&
    !generationFailed;
  const showingTransientEntryLoading =
    showEntryLoadingFallback && !entryLoadingStalled;

  useEffect(() => {
    if (!showEntryLoadingFallback) {
      setEntryLoadingStalled(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setEntryLoadingStalled(true);
    }, ENTRY_LOADING_STALL_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [showEntryLoadingFallback]);

  const navigateToPreviousStage = () => {
    if (!previousStep) {
      return;
    }

    navigateToStep(previousStep, "review");
  };

  const handleReviseAnswers = () => {
    if (hasRevisableQuestions) {
      setActiveSurface("questions");
      return;
    }

    openRefinementDrawer(activeSpecStep);
    void handleCheckAndAdvance(activeSpecStep);
  };

  const handleCompleteSurvey = () => {
    void flushRefinementPersistence().then((persisted) => {
      if (!persisted) {
        return;
      }

      void beginAutoAdvance(activeSpecStep, {
        draft: {
          answers: refinementAnswers,
          defaultAnswerQuestionIds,
          preferredSurface: activeSurface,
        },
        navigateOnSuccess: false,
      });
    });
  };

  const handleRetry = () => {
    if (activeSpecStep === "brief") {
      void beginAutoAdvance("brief", {
        navigateOnSuccess: false,
        skipCheck: generationFailed,
      });
      return;
    }

    if (generationFailed) {
      void beginAutoAdvance(activeSpecStep, {
        navigateOnSuccess: false,
        skipCheck: true,
      });
      return;
    }

    void handleCheckAndAdvance(activeSpecStep);
  };

  const handleAdvanceToNextStep = () => {
    cancelAutoAdvance();
    onAdvanceToNextStep?.();
  };

  return {
    canReviseAnswers,
    entryLoadingCopy,
    generationFailed,
    generationStateCopy,
    handleAdvanceToNextStep,
    handleCompleteSurvey,
    handleRetry,
    handleReviseAnswers,
    hasRevisableQuestions,
    inlineSurveyLoadingBody,
    inlineSurveyLoadingLabel,
    label,
    loadingQuestions,
    loadingStateBody,
    loadingStateLabel,
    nextStepActionLabel,
    previousStep,
    previousStepLabel,
    questionLoadFailed,
    showingInlineSurvey,
    showingTransientEntryLoading,
    surveyResumeKey,
    navigateToPreviousStage,
    generatingStep,
  };
};
