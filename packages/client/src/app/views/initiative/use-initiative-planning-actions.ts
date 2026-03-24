import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useNavigate } from "react-router-dom";
import {
  checkInitiativePhase,
  generateInitiativeBrief,
  generateInitiativeCoreFlows,
  generateInitiativePrd,
  generateInitiativeTechSpec,
  requestInitiativeClarificationHelp,
  updateInitiativePhases
} from "../../../api.js";
import { deleteInitiative, type InitiativePhaseCheckResult } from "../../../api/initiatives.js";
import type {
  Initiative,
  InitiativePlanningStep,
  InitiativeRefinementState,
  PlanningReviewArtifact,
  PlanningReviewKind,
} from "../../../types.js";
import { useConfirm } from "../../context/confirm.js";
import { useToast } from "../../context/toast.js";
import type { InitiativePlanningSurface } from "../../utils/initiative-progress.js";
import {
  applyInitiativeDeletion,
  applyInitiativeUpdate,
  noopApplySnapshotUpdate,
  type ApplySnapshotUpdate,
} from "../../utils/snapshot-updates.js";
import { rerunValidationQuestions } from "./planning-continuation.js";
import type { BusyActionResult } from "./use-cancellable-busy-action.js";
import { useCancellableBusyAction } from "./use-cancellable-busy-action.js";
import { useInitiativeAutoQuestionLoading } from "./use-initiative-auto-question-loading.js";
import { useInitiativePlanningPersistence } from "./use-initiative-planning-persistence.js";
import { useInitiativeReviewActions } from "./use-initiative-review-actions.js";
import { useValidationTicketGeneration } from "./use-validation-ticket-generation.js";
import type { PlanningDrawerState, SaveState, SpecStep } from "./shared.js";

interface UseInitiativePlanningActionsOptions {
  initiative: Initiative | null;
  headerTitle: string;
  activeStep: InitiativePlanningStep;
  activeSurface: InitiativePlanningSurface | null;
  activeSpecStep: SpecStep | null;
  activeRefinement: InitiativeRefinementState | null;
  persistedActiveRefinement: InitiativeRefinementState | null;
  validationReview: PlanningReviewArtifact | undefined;
  validationFeedback: string | null;
  validationFeedbackByStep: Partial<Record<SpecStep, string>>;
  initiativeTickets: { id: string }[];
  hasActiveContent: boolean;
  hasRefinementQuestions: boolean;
  hasPhaseSpecificRefinementDecisions: boolean;
  getReview: (kind: PlanningReviewKind) => PlanningReviewArtifact | undefined;
  hasOutstandingReview: (kind: PlanningReviewKind) => boolean;
  navigateToStep: (step: SpecStep | "validation" | "tickets", surface?: InitiativePlanningSurface | null) => void;
  onRefresh: () => Promise<void>;
  onApplySnapshotUpdate?: ApplySnapshotUpdate;
  editingStep: SpecStep | null;
  drafts: Record<SpecStep, string>;
  savedDrafts: Record<SpecStep, string>;
  drawerState: PlanningDrawerState;
  refinementAnswers: Record<string, string | string[] | boolean>;
  defaultAnswerQuestionIds: string[];
  reviewOverrideReason: string;
  setEditingStep: Dispatch<SetStateAction<SpecStep | null>>;
  setDraftSaveState: Dispatch<SetStateAction<Record<SpecStep, SaveState>>>;
  setRefinementAssumptions: Dispatch<SetStateAction<string[]>>;
  setRefinementSaveState: Dispatch<SetStateAction<SaveState>>;
  setGuidanceQuestionId: Dispatch<SetStateAction<string | null>>;
  setGuidanceText: Dispatch<SetStateAction<string | null>>;
  setReviewOverrideKind: Dispatch<SetStateAction<PlanningReviewKind | null>>;
  setReviewOverrideReason: Dispatch<SetStateAction<string>>;
  setDrawerState: Dispatch<SetStateAction<PlanningDrawerState>>;
  setIsDeletingInitiative: Dispatch<SetStateAction<boolean>>;
  applyPhaseCheckResult: (step: SpecStep, result: InitiativePhaseCheckResult) => void;
}

export const useInitiativePlanningActions = ({
  initiative,
  headerTitle,
  activeStep,
  activeSurface,
  activeSpecStep,
  activeRefinement,
  persistedActiveRefinement,
  validationReview,
  validationFeedback,
  validationFeedbackByStep,
  initiativeTickets,
  hasActiveContent,
  hasRefinementQuestions,
  hasPhaseSpecificRefinementDecisions,
  getReview,
  hasOutstandingReview,
  navigateToStep,
  onRefresh,
  onApplySnapshotUpdate = noopApplySnapshotUpdate,
  editingStep,
  drafts,
  savedDrafts,
  drawerState,
  refinementAnswers,
  defaultAnswerQuestionIds,
  reviewOverrideReason,
  setEditingStep,
  setDraftSaveState,
  setRefinementAssumptions,
  setRefinementSaveState,
  setGuidanceQuestionId,
  setGuidanceText,
  setReviewOverrideKind,
  setReviewOverrideReason,
  setDrawerState,
  setIsDeletingInitiative,
  applyPhaseCheckResult,
}: UseInitiativePlanningActionsOptions) => {
  const navigate = useNavigate();
  const { showError } = useToast();
  const confirm = useConfirm();
  const { busyAction, isBusy, cancelBusyAction, withBusyAction } = useCancellableBusyAction();

  const flushPersistenceState = useInitiativePlanningPersistence({
    activeStep,
    activeRefinement: persistedActiveRefinement,
    activeSurface,
    activeSpecStep,
    defaultAnswerQuestionIds,
    drafts,
    drawerState,
    editingStep,
    initiative,
    onRefresh,
    refinementAnswers,
    savedDrafts,
    setDraftSaveState,
    setEditingStep,
    setRefinementAssumptions,
    setRefinementSaveState,
    showError,
  });
  const { flushRefinementPersistence } = flushPersistenceState;

  const refreshSnapshotInBackground = useCallback(() => {
    void onRefresh().catch((error) => showError((error as Error).message ?? "We couldn't refresh planning."));
  }, [onRefresh, showError]);

  const applyInitiativeSnapshot = useCallback((nextInitiative: NonNullable<typeof initiative>) => {
    onApplySnapshotUpdate((current) => applyInitiativeUpdate(current, nextInitiative));
  }, [onApplySnapshotUpdate]);

  const handlePhaseCheckResult = useCallback((step: SpecStep, result: InitiativePhaseCheckResult) => {
    applyPhaseCheckResult(step, result);
    setRefinementAssumptions(result.assumptions);
  }, [applyPhaseCheckResult, setRefinementAssumptions]);

  const generateSpec = async (step: SpecStep, signal: AbortSignal): Promise<void> => {
    if (!initiative) {
      return;
    }

    await (
      step === "brief"
        ? generateInitiativeBrief(initiative.id, { signal })
        : step === "core-flows"
          ? generateInitiativeCoreFlows(initiative.id, { signal })
          : step === "prd"
            ? generateInitiativePrd(initiative.id, { signal })
            : generateInitiativeTechSpec(initiative.id, { signal })
    );

    await onRefresh();
    setEditingStep(null);
    setDraftSaveState((current) => ({ ...current, [step]: "saved" }));
  };

  const handleGenerateSpec = async (step: SpecStep): Promise<void> => {
    await withBusyAction(`generate-${step}`, async (signal) => {
      await generateSpec(step, signal);
      navigateToStep(step, "review");
    });
  };

  const handleCheckAndAdvance = useCallback(async (step: SpecStep): Promise<BusyActionResult> => {
    if (!initiative) {
      return "failed";
    }

    return withBusyAction(`check-${step}`, async (signal) => {
      const result = await checkInitiativePhase(initiative.id, step, { signal });
      handlePhaseCheckResult(step, result);
      if (result.decision === "ask") {
        refreshSnapshotInBackground();
        return;
      }

      await onRefresh();
    });
  }, [handlePhaseCheckResult, initiative, onRefresh, refreshSnapshotInBackground, withBusyAction]);

  const {
    autoQuestionLoadStep,
    autoQuestionLoadFailedStep,
    resetAutoQuestionLoadState,
  } = useInitiativeAutoQuestionLoading({
    initiativeId: initiative?.id ?? null,
    activeStep,
    activeSpecStep,
    activeRefinementQuestionCount: activeRefinement?.questions.length ?? 0,
    hasActiveContent,
    hasRefinementQuestions,
    hasPhaseSpecificRefinementDecisions,
    busyAction,
    validationReviewId: validationReview?.id ?? null,
    validationReviewStatus: validationReview?.status ?? null,
    validationFeedback,
    validationFeedbackByStep,
    handleCheckAndAdvance,
    rerunValidationQuestions: (signal, feedbackByStep, fallbackFeedback) =>
      initiative
        ? rerunValidationQuestions({
            initiativeId: initiative.id,
            signal,
            feedbackByStep,
            fallbackFeedback,
          })
        : Promise.resolve(false),
    withBusyAction,
    onRefresh,
  });

  const { handleRunReview, handleOverrideReview } = useInitiativeReviewActions({
    initiativeId: initiative?.id ?? null,
    activeSpecStep,
    getReview,
    hasOutstandingReview,
    reviewOverrideReason,
    onRefresh,
    navigateToStep,
    setReviewOverrideKind,
    setReviewOverrideReason,
    withBusyAction,
  });

  const {
    ticketGenerationError,
    validationStatusMessage,
    handleGenerateTickets,
  } = useValidationTicketGeneration({
    initiative,
    initiativeTicketCount: initiativeTickets.length,
    activeStep,
    activeRefinement,
    refinementAnswers,
    defaultAnswerQuestionIds,
    validationFeedbackByStep,
    validationFeedback,
    flushRefinementPersistence,
    withBusyAction,
    onRefresh,
    navigateToStep,
  });

  const handleRequestGuidance = async (questionId: string): Promise<void> => {
    if (!initiative) {
      return;
    }

    await withBusyAction("refinement-help", async (signal) => {
      const result = await requestInitiativeClarificationHelp(initiative.id, questionId, "", { signal });
      setGuidanceQuestionId(questionId);
      setGuidanceText(result.guidance);
    });
  };

  const handleDeleteInitiative = async (): Promise<void> => {
    if (!initiative) {
      return;
    }

    const confirmed = await confirm({
      message: `Delete project "${headerTitle}"? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setIsDeletingInitiative(true);
    setDrawerState(null);
    setEditingStep(null);
    setReviewOverrideKind(null);
    setReviewOverrideReason("");
    cancelBusyAction();
    resetAutoQuestionLoadState();

    try {
      await deleteInitiative(initiative.id);
      onApplySnapshotUpdate((current) => applyInitiativeDeletion(current, initiative.id));
      navigate("/");
    } catch (error) {
      setIsDeletingInitiative(false);
      showError((error as Error).message);
    }
  };

  const handlePhaseRename = async (phaseId: string, nextName: string): Promise<void> => {
    if (!initiative) {
      return;
    }

    const nextPhases = initiative.phases.map((item) => (item.id === phaseId ? { ...item, name: nextName } : item));
    const updatedInitiative = await updateInitiativePhases(initiative.id, nextPhases);
    applyInitiativeSnapshot(updatedInitiative);
  };

  const openTicket = (ticketId: string) => {
    navigate(`/ticket/${ticketId}`);
  };

  return {
    busyAction,
    isBusy,
    flushRefinementPersistence,
    autoQuestionLoadStep,
    autoQuestionLoadFailedStep,
    ticketGenerationError,
    validationStatusMessage,
    handlePhaseCheckResult,
    handleGenerateSpec,
    handleCheckAndAdvance,
    handleGenerateTickets,
    handleRequestGuidance,
    handleRunReview,
    handleOverrideReview,
    handleDeleteInitiative,
    handlePhaseRename,
    openTicket,
  };
};
