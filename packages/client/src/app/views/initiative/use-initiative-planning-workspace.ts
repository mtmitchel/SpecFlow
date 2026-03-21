import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  checkInitiativePhase,
  generateInitiativeBrief,
  generateInitiativeCoreFlows,
  generateInitiativePlan,
  generateInitiativePrd,
  generateInitiativeTechSpec,
  requestInitiativeClarificationHelp,
  updateInitiativePhases
} from "../../../api.js";
import { deleteInitiative, type InitiativePhaseCheckResult } from "../../../api/initiatives.js";
import { ApiError } from "../../../api/http.js";
import type { ArtifactsSnapshot, PlanningReviewArtifact, PlanningReviewKind } from "../../../types.js";
import { useConfirm } from "../../context/confirm.js";
import { useToast } from "../../context/toast.js";
import { getInitiativeDisplayTitle } from "../../utils/initiative-titles.js";
import { getNextInitiativeStep } from "../../utils/initiative-workflow.js";
import { EMPTY_SPEC_DRAFTS, useInitiativeLoadedSpecs } from "./use-initiative-loaded-specs.js";
import { useOptimisticPhaseCheck } from "./use-optimistic-phase-check.js";
import { useInitiativePlanningPersistence } from "./use-initiative-planning-persistence.js";
import { type BusyActionResult, useCancellableBusyAction } from "./use-cancellable-busy-action.js";
import { useInitiativePlanningRoute } from "./use-initiative-planning-route.js";
import { useInitiativeAutoQuestionLoading } from "./use-initiative-auto-question-loading.js";
import { useInitiativeReviewActions } from "./use-initiative-review-actions.js";
import {
  type PlanningDrawerState,
  TICKET_COVERAGE_REVIEW_KIND,
  isQuestionResolved,
  isResolvedReview,
  type SaveState,
  type SpecStep
} from "./shared.js";
import {
  buildValidationReviewFeedback,
  buildValidationRefinement,
  VALIDATION_REFINEMENT_STEPS
} from "./validation-refinement.js";
import {
  buildPlanValidationFeedbackByStep,
  buildValidationReviewFeedbackByStep,
  getValidationFeedbackForStep,
  getValidationFeedbackSteps
} from "./validation-feedback.js";

const EMPTY_DRAFT_SAVE_STATE: Record<SpecStep, SaveState> = {
  brief: "idle", "core-flows": "idle", prd: "idle", "tech-spec": "idle"
};

export const useInitiativePlanningWorkspace = (
  snapshot: ArtifactsSnapshot,
  onRefresh: () => Promise<void>
) => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showError } = useToast();
  const confirm = useConfirm();
  const initiative = snapshot.initiatives.find((item) => item.id === params.id) ?? null;

  const [editingStep, setEditingStep] = useState<SpecStep | null>(null);
  const [drafts, setDrafts] = useState<Record<SpecStep, string>>(EMPTY_SPEC_DRAFTS);
  const [draftSaveState, setDraftSaveState] = useState<Record<SpecStep, SaveState>>(EMPTY_DRAFT_SAVE_STATE);
  const [refinementAnswers, setRefinementAnswers] = useState<Record<string, string | string[] | boolean>>({});
  const [defaultAnswerQuestionIds, setDefaultAnswerQuestionIds] = useState<string[]>([]);
  const [refinementAssumptions, setRefinementAssumptions] = useState<string[]>([]);
  const [refinementSaveState, setRefinementSaveState] = useState<SaveState>("idle");
  const [guidanceQuestionId, setGuidanceQuestionId] = useState<string | null>(null);
  const [guidanceText, setGuidanceText] = useState<string | null>(null);
  const [reviewOverrideKind, setReviewOverrideKind] = useState<PlanningReviewKind | null>(null);
  const [reviewOverrideReason, setReviewOverrideReason] = useState("");
  const [ticketGenerationError, setTicketGenerationError] = useState<string | null>(null);
  const [drawerState, setDrawerState] = useState<PlanningDrawerState>(null);
  const [isDeletingInitiative, setIsDeletingInitiative] = useState(false);
  const { busyAction, isBusy, cancelBusyAction, withBusyAction } = useCancellableBusyAction();
  const loadedSpecs = useInitiativeLoadedSpecs(initiative?.id ?? null, snapshot.specs);

  const savedDrafts = useMemo<Record<SpecStep, string>>(() => {
    if (!initiative) return EMPTY_SPEC_DRAFTS;
    return { brief: loadedSpecs.brief, "core-flows": loadedSpecs["core-flows"], prd: loadedSpecs.prd, "tech-spec": loadedSpecs["tech-spec"] };
  }, [initiative, loadedSpecs]);

  useEffect(() => {
    if (!initiative) {
      return;
    }

    setDrafts((current) => ({
      brief: editingStep === "brief" && current.brief !== savedDrafts.brief ? current.brief : savedDrafts.brief,
      "core-flows":
        editingStep === "core-flows" && current["core-flows"] !== savedDrafts["core-flows"]
          ? current["core-flows"]
          : savedDrafts["core-flows"],
      prd: editingStep === "prd" && current.prd !== savedDrafts.prd ? current.prd : savedDrafts.prd,
      "tech-spec":
        editingStep === "tech-spec" && current["tech-spec"] !== savedDrafts["tech-spec"]
          ? current["tech-spec"]
          : savedDrafts["tech-spec"]
    }));
  }, [editingStep, initiative, savedDrafts]);

  const initiativeReviews = useMemo(
    () => (initiative ? snapshot.planningReviews.filter((item) => item.initiativeId === initiative.id) : []),
    [initiative, snapshot.planningReviews],
  );
  const getReview = (kind: PlanningReviewKind): PlanningReviewArtifact | undefined =>
    initiativeReviews.find((item) => item.kind === kind);
  const hasOutstandingReview = (kind: PlanningReviewKind): boolean => {
    const review = getReview(kind);
    return Boolean(review && !isResolvedReview(review));
  };
  const {
    activeStep,
    activeSurface,
    activeSpecStep,
    navigateToStep,
    setActiveSurface,
  } = useInitiativePlanningRoute({
    initiative,
    planningReviews: initiativeReviews,
    specSummaries: snapshot.specs,
  });
  const validationRefinement = useMemo(
    () => (initiative ? buildValidationRefinement(initiative) : null),
    [initiative]
  );
  const persistedSpecRefinement = initiative && activeSpecStep ? initiative.workflow.refinements[activeSpecStep] : null;
  const { activeRefinement: optimisticRefinement, applyPhaseCheckResult } = useOptimisticPhaseCheck({
    initiative,
    activeSpecStep,
    persistedRefinement: persistedSpecRefinement,
    refinementAnswers,
    defaultAnswerQuestionIds,
  });
  const activeRefinement =
    activeStep === "validation"
      ? validationRefinement
      : optimisticRefinement;
  const persistedActiveRefinement =
    activeStep === "validation"
      ? validationRefinement
      : persistedSpecRefinement;
  const refinementSignature = activeRefinement
    ? JSON.stringify({
        checkedAt: activeRefinement.checkedAt,
        questions: activeRefinement.questions,
        answers: activeRefinement.answers,
        defaultAnswerQuestionIds: activeRefinement.defaultAnswerQuestionIds,
        baseAssumptions: activeRefinement.baseAssumptions
      })
    : "";

  useEffect(() => {
    if (!activeRefinement) {
      setRefinementAnswers({});
      setDefaultAnswerQuestionIds([]);
      setRefinementAssumptions([]);
      setGuidanceQuestionId(null);
      setGuidanceText(null);
      return;
    }

    setRefinementAnswers(activeRefinement.answers);
    setDefaultAnswerQuestionIds(activeRefinement.defaultAnswerQuestionIds);
    setRefinementAssumptions(activeRefinement.baseAssumptions);
    setGuidanceQuestionId(null);
    setGuidanceText(null);
  }, [activeRefinement, activeStep, refinementSignature]);

  const initiativeTickets = initiative
    ? snapshot.tickets.filter((ticket) => ticket.initiativeId === initiative.id)
    : [];
  const ticketCoverageArtifact =
    initiative
      ? snapshot.ticketCoverageArtifacts.find((item) => item.initiativeId === initiative.id) ?? null
      : null;
  const validationReview = getReview(TICKET_COVERAGE_REVIEW_KIND);
  const validationFeedback = buildValidationReviewFeedback(validationReview);
  const validationFeedbackByStep = useMemo(
    () => buildValidationReviewFeedbackByStep(validationReview),
    [validationReview]
  );
  const linkedRuns =
    initiativeTickets.length > 0
      ? snapshot.runs.filter((run) => run.ticketId && initiativeTickets.some((ticket) => ticket.id === run.ticketId))
      : [];
  useEffect(() => {
    if ((initiative?.phases.length ?? 0) > 0 || initiativeTickets.length > 0) {
      setTicketGenerationError(null);
    }
  }, [initiative?.phases.length, initiativeTickets.length]);
  useEffect(() => {
    if (activeStep === "validation" && (activeRefinement?.questions.length ?? 0) > 0) {
      setTicketGenerationError(null);
    }
  }, [activeRefinement?.questions.length, activeStep]);
  const headerTitle = initiative ? getInitiativeDisplayTitle(initiative.title, initiative.description) : "";
  const hasActiveContent = activeSpecStep ? savedDrafts[activeSpecStep].trim().length > 0 : false;
  const hasRefinementQuestions = Boolean(activeRefinement && activeRefinement.questions.length > 0);
  const hasPhaseSpecificRefinementDecisions = Boolean(activeRefinement && (
    Object.keys(activeRefinement.answers).length > 0 || activeRefinement.defaultAnswerQuestionIds.length > 0
  ));
  const unresolvedQuestionCount = activeRefinement
    ? activeRefinement.questions.filter(
        (question) => !isQuestionResolved(question, refinementAnswers, defaultAnswerQuestionIds)
      ).length
    : 0;
  const nextStep = getNextInitiativeStep(activeStep);

  useEffect(() => {
    if (!drawerState) {
      return;
    }

    if (drawerState.step === activeSpecStep) {
      return;
    }

    setDrawerState(null);
    setReviewOverrideKind(null);
    setReviewOverrideReason("");

    if (editingStep && editingStep !== activeSpecStep) {
      setEditingStep(null);
    }
  }, [activeSpecStep, drawerState, editingStep]);

  const { flushRefinementPersistence } = useInitiativePlanningPersistence({
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

  const refreshSnapshotInBackground = useCallback(() => {
    void onRefresh().catch((error) => showError((error as Error).message ?? "We couldn't refresh planning."));
  }, [onRefresh, showError]);

  const handlePhaseCheckResult = useCallback((step: SpecStep, result: InitiativePhaseCheckResult) => {
    applyPhaseCheckResult(step, result);
    setRefinementAssumptions(result.assumptions);
  }, [applyPhaseCheckResult]);

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

  const rerunValidationQuestions = useCallback(
    async (
      signal: AbortSignal,
      feedbackByStep: Partial<Record<SpecStep, string>>,
      fallbackFeedback?: string | null
    ): Promise<boolean> => {
      if (!initiative) {
        return false;
      }

      const scopedSteps = getValidationFeedbackSteps(feedbackByStep);
      const stepsToCheck =
        scopedSteps.length > 0 ? scopedSteps : VALIDATION_REFINEMENT_STEPS;
      let validationBlocked = false;

      for (const step of stepsToCheck) {
        const result = await checkInitiativePhase(initiative.id, step, {
          signal,
          validationFeedback: getValidationFeedbackForStep(step, feedbackByStep, fallbackFeedback),
        });

        if (result.decision === "ask") {
          validationBlocked = true;
        }
      }

      return validationBlocked;
    },
    [initiative]
  );

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
    rerunValidationQuestions,
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

  const handleGenerateTickets = async (): Promise<void> => {
    if (!initiative) {
      return;
    }
    const persisted = await flushRefinementPersistence();
    if (!persisted) {
      return;
    }
    setTicketGenerationError(null);
    let generationError: string | null = null;
    const status = await withBusyAction("generate-tickets", async (signal) => {
      if (activeStep === "validation") {
        const validationBlocked = await rerunValidationQuestions(
          signal,
          validationFeedbackByStep,
          validationFeedback
        );
        if (validationBlocked) {
          await onRefresh();
          return;
        }
      }

      try {
        await generateInitiativePlan(initiative.id, { signal });
        await onRefresh();
      } catch (error) {
        const recoverableFeedbackByStep = buildPlanValidationFeedbackByStep(
          error instanceof ApiError ? error.details : undefined
        );
        const recovered = await rerunValidationQuestions(signal, recoverableFeedbackByStep);
        if (recovered) {
          await onRefresh();
          return;
        }

        generationError =
          (error as Error).message?.trim() || "Ticket generation failed.";
        throw error;
      }
    });

    if (
      status === "failed" &&
      initiative.phases.length === 0 &&
      initiativeTickets.length === 0
    ) {
      setTicketGenerationError(generationError ?? "Ticket generation failed.");
    }
  };

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

  const setReviewOverride = (kind: PlanningReviewKind, reason: string) => { setReviewOverrideKind(kind); setReviewOverrideReason(reason); };
  const clearReviewOverride = () => { setReviewOverrideKind(null); setReviewOverrideReason(""); };

  const updateDraft = (value: string) => {
    if (!activeSpecStep) {
      return;
    }

    setDrafts((current) => ({
      ...current,
      [activeSpecStep]: value
    }));
    setDraftSaveState((current) => ({ ...current, [activeSpecStep]: "idle" }));
  };

  const openEditDrawer = (step: SpecStep) => {
    setReviewOverrideKind(null);
    setReviewOverrideReason("");
    setEditingStep(step);
    setDrawerState({ type: "edit", step });
  };

  const openRefinementDrawer = (step: SpecStep) => {
    setReviewOverrideKind(null);
    setReviewOverrideReason("");
    setEditingStep(null);
    setDrawerState({ type: "refinement", step });
  };

  const closeDrawer = () => {
    setDrawerState(null);
    setReviewOverrideKind(null);
    setReviewOverrideReason("");
  };

  const updateRefinementAnswer = (questionId: string, nextValue: string | string[] | boolean) => {
    setRefinementAnswers((current) => ({
      ...current,
      [questionId]: nextValue
    }));
    setDefaultAnswerQuestionIds((current) => current.filter((id) => id !== questionId));
    setRefinementSaveState("idle");
  };

  const deferRefinementQuestion = (questionId: string) => {
    setRefinementAnswers((current) => {
      const next = { ...current };
      delete next[questionId];
      return next;
    });
    setDefaultAnswerQuestionIds((current) => (current.includes(questionId) ? current : [...current, questionId]));
    setRefinementSaveState("idle");
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
    if (!confirmed) return;

    setIsDeletingInitiative(true);
    setDrawerState(null);
    setEditingStep(null);
    setReviewOverrideKind(null);
    setReviewOverrideReason("");
    cancelBusyAction();
    resetAutoQuestionLoadState();

    try {
      await deleteInitiative(initiative.id);
      await onRefresh();
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
    await updateInitiativePhases(initiative.id, nextPhases);
    await onRefresh();
  };

  const openTicket = (ticketId: string) => { navigate(`/ticket/${ticketId}`); };

  return {
    initiative,
    initiativeReviews,
    initiativeTickets,
    linkedRuns,
    ticketCoverageArtifact,
    validationReview,
    savedDrafts,
    drafts,
    draftSaveState,
    busyAction,
    editingStep,
    refinementAnswers,
    defaultAnswerQuestionIds,
    refinementAssumptions,
    refinementSaveState,
    guidanceQuestionId,
    guidanceText,
    reviewOverrideKind,
    reviewOverrideReason,
    ticketGenerationError,
    drawerState,
    headerTitle,
    activeStep,
    activeSurface,
    activeSpecStep,
    activeRefinement,
    getReview,
    isBusy,
    isDeletingInitiative,
    hasActiveContent,
    hasRefinementQuestions,
    hasPhaseSpecificRefinementDecisions,
    unresolvedQuestionCount,
    nextStep,
    handlePhaseCheckResult,
    navigateToStep,
    setActiveSurface,
    handleDeleteInitiative,
    handleGenerateSpec,
    handleCheckAndAdvance,
    flushRefinementPersistence,
    autoQuestionLoadStep,
    autoQuestionLoadFailedStep,
    handleGenerateTickets,
    handleRequestGuidance,
    handleRunReview,
    handleOverrideReview,
    handlePhaseRename,
    openTicket,
    updateDraft,
    updateRefinementAnswer,
    deferRefinementQuestion,
    setReviewOverride,
    clearReviewOverride,
    setReviewOverrideReason,
    openEditDrawer,
    openRefinementDrawer,
    closeDrawer
  };
};
