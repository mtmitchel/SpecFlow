import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  checkInitiativePhase,
  generateInitiativeBrief,
  generateInitiativeCoreFlows,
  generateInitiativePlan,
  generateInitiativePrd,
  generateInitiativeTechSpec,
  overrideInitiativeReview,
  requestInitiativeClarificationHelp,
  runInitiativeReview,
  updateInitiativePhases
} from "../../../api.js";
import { deleteInitiative, type InitiativePhaseCheckResult } from "../../../api/initiatives.js";
import type { ArtifactsSnapshot, InitiativePlanningStep, PlanningReviewArtifact, PlanningReviewKind } from "../../../types.js";
import { useConfirm } from "../../context/confirm.js";
import { useToast } from "../../context/toast.js";
import { buildInitiativeStepSearchParams, type InitiativePlanningSurface } from "../../utils/initiative-progress.js";
import { getInitiativeDisplayTitle } from "../../utils/initiative-titles.js";
import { getNextInitiativeStep, REVIEWS_BY_STEP } from "../../utils/initiative-workflow.js";
import { resolveInitiativePlanningRouteState } from "./planning-route-state.js";
import { EMPTY_SPEC_DRAFTS, useInitiativeLoadedSpecs } from "./use-initiative-loaded-specs.js";
import { useOptimisticPhaseCheck } from "./use-optimistic-phase-check.js";
import { useInitiativePlanningPersistence } from "./use-initiative-planning-persistence.js";
import { type BusyActionResult, useCancellableBusyAction } from "./use-cancellable-busy-action.js";
import {
  type PlanningDrawerState,
  type PlanningJourneyStage,
  TICKET_COVERAGE_REVIEW_KIND,
  isQuestionResolved,
  isResolvedReview,
  type SaveState,
  type SpecStep
} from "./shared.js";

const EMPTY_DRAFT_SAVE_STATE: Record<SpecStep, SaveState> = {
  brief: "idle", "core-flows": "idle", prd: "idle", "tech-spec": "idle"
};

export const useInitiativePlanningWorkspace = (
  snapshot: ArtifactsSnapshot,
  onRefresh: () => Promise<void>
) => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [drawerState, setDrawerState] = useState<PlanningDrawerState>(null);
  const [isDeletingInitiative, setIsDeletingInitiative] = useState(false);
  const [autoQuestionLoadStep, setAutoQuestionLoadStep] = useState<SpecStep | null>(null);
  const [autoQuestionLoadFailedStep, setAutoQuestionLoadFailedStep] = useState<SpecStep | null>(null);
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

  const requestedStep = searchParams.get("step");
  const requestedSurface = searchParams.get("surface");
  const routeState = useMemo(() => (
    initiative
      ? resolveInitiativePlanningRouteState({
          initiative,
          planningReviews: initiativeReviews,
          requestedStep,
          requestedSurface,
          specSummaries: snapshot.specs,
        })
      : null
  ), [initiative, initiativeReviews, requestedStep, requestedSurface, snapshot.specs]);
  const activeStep: InitiativePlanningStep = routeState?.activeStep ?? "brief";
  const activeSurface: InitiativePlanningSurface = routeState?.activeSurface ?? "questions";

  useEffect(() => {
    if (initiative && routeState && searchParams.toString() !== routeState.canonicalSearchParams.toString()) {
      setSearchParams(routeState.canonicalSearchParams, { replace: true });
    }
  }, [initiative, routeState, searchParams, setSearchParams]);

  const activeSpecStep: SpecStep | null = activeStep === "tickets" ? null : activeStep;
  const persistedActiveRefinement = initiative && activeSpecStep ? initiative.workflow.refinements[activeSpecStep] : null;
  const { activeRefinement, applyPhaseCheckResult } = useOptimisticPhaseCheck({
    initiative,
    activeSpecStep,
    persistedRefinement: persistedActiveRefinement,
    refinementAnswers,
    defaultAnswerQuestionIds,
  });
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
  const ticketCoverageReview = getReview(TICKET_COVERAGE_REVIEW_KIND);
  const uncoveredCoverageItems = ticketCoverageArtifact
    ? ticketCoverageArtifact.items.filter((item) => ticketCoverageArtifact.uncoveredItemIds.includes(item.id))
    : [];
  const coveredCoverageCount = ticketCoverageArtifact
    ? ticketCoverageArtifact.items.length - uncoveredCoverageItems.length
    : 0;
  const linkedRuns =
    initiativeTickets.length > 0
      ? snapshot.runs.filter((run) => run.ticketId && initiativeTickets.some((ticket) => ticket.id === run.ticketId))
      : [];
  const headerTitle = initiative ? getInitiativeDisplayTitle(initiative.title, initiative.description) : "";
  const stepStatus = initiative?.workflow.steps[activeStep].status ?? "locked";
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
  const ticketReviewsResolved =
    !ticketCoverageReview || ticketCoverageReview.status === "passed" || ticketCoverageReview.status === "overridden";
  const activeStage: PlanningJourneyStage =
    activeStep === "tickets"
      ? initiativeTickets.length === 0
        ? "draft"
        : ticketReviewsResolved
          ? "complete"
          : "checkpoint"
      : !hasActiveContent
        ? !activeRefinement?.checkedAt || hasRefinementQuestions
          ? "consult"
          : "draft"
        : stepStatus === "stale"
          ? "checkpoint"
          : "complete";

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

  const navigateToStep = (step: InitiativePlanningStep, surface?: InitiativePlanningSurface | null): void => {
    setSearchParams(buildInitiativeStepSearchParams(step, surface));
  };

  const setActiveSurface = (surface: InitiativePlanningSurface): void => {
    if (activeStep === "tickets") {
      return;
    }
    navigateToStep(activeStep, surface);
  };

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

  const shouldAutoLoadEntryQuestions = Boolean(
    initiative &&
      activeSpecStep &&
      activeSpecStep !== "brief" &&
      !hasActiveContent &&
      !hasRefinementQuestions &&
      !hasPhaseSpecificRefinementDecisions
  );

  useEffect(() => {
    if (!initiative || !activeSpecStep) {
      return;
    }

    if (!shouldAutoLoadEntryQuestions) {
      setAutoQuestionLoadStep((current) => (current === activeSpecStep ? null : current));
      setAutoQuestionLoadFailedStep((current) => (current === activeSpecStep ? null : current));
      return;
    }

    if (busyAction || autoQuestionLoadStep === activeSpecStep || autoQuestionLoadFailedStep === activeSpecStep) {
      return;
    }

    setAutoQuestionLoadStep(activeSpecStep);

    void handleCheckAndAdvance(activeSpecStep).then((status) => {
      setAutoQuestionLoadStep((current) => (current === activeSpecStep ? null : current));
      setAutoQuestionLoadFailedStep((current) => {
        if (status === "completed" || status === "cancelled") {
          return current === activeSpecStep ? null : current;
        }

        return activeSpecStep;
      });
    });
  }, [
    activeRefinement?.checkedAt,
    activeSpecStep,
    autoQuestionLoadFailedStep,
    autoQuestionLoadStep,
    busyAction,
    handleCheckAndAdvance,
    hasActiveContent,
    hasRefinementQuestions,
    initiative,
    shouldAutoLoadEntryQuestions
  ]);

  const handleGenerateTickets = async (): Promise<void> => {
    if (!initiative) {
      return;
    }
    await withBusyAction("generate-tickets", async (signal) => {
      await generateInitiativePlan(initiative.id, { signal });
      await onRefresh();
    });
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

  const handleRunReview = async (kind: PlanningReviewKind): Promise<void> => {
    if (!initiative) {
      return;
    }

    await withBusyAction(`review-${kind}`, async (signal) => {
      const review = await runInitiativeReview(initiative.id, kind, { signal });
      await onRefresh();
      if (
        activeSpecStep &&
        REVIEWS_BY_STEP[activeSpecStep].every((reviewKind) => {
          const currentReview = reviewKind === kind ? review : getReview(reviewKind);
          return currentReview && (currentReview.status === "passed" || currentReview.status === "overridden");
        })
      ) {
        const followingStep = getNextInitiativeStep(activeSpecStep);
        if (followingStep) {
          navigateToStep(followingStep);
        }
      }
    });
  };

  const handleOverrideReview = async (kind: PlanningReviewKind): Promise<void> => {
    if (!initiative) {
      return;
    }

    await withBusyAction(`override-${kind}`, async () => {
      await overrideInitiativeReview(initiative.id, kind, reviewOverrideReason.trim());
      const remainingUnresolved =
        activeSpecStep
          ? REVIEWS_BY_STEP[activeSpecStep].filter(
              (reviewKind) => reviewKind !== kind && hasOutstandingReview(reviewKind)
            )
          : [];
      setReviewOverrideKind(null);
      setReviewOverrideReason("");
      await onRefresh();
      if (activeSpecStep && remainingUnresolved.length === 0) {
        const followingStep = getNextInitiativeStep(activeSpecStep);
        if (followingStep) {
          navigateToStep(followingStep);
        }
      }
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
      message: `Delete initiative "${headerTitle}"? This cannot be undone.`,
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
    setAutoQuestionLoadStep(null);
    setAutoQuestionLoadFailedStep(null);

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
    activeStage,
    ticketCoverageArtifact,
    ticketCoverageReview,
    uncoveredCoverageItems,
    coveredCoverageCount,
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
    drawerState,
    headerTitle,
    activeStep,
    activeSurface,
    activeSpecStep,
    activeRefinement,
    getReview,
    stepStatus,
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
    closeDrawer
  };
};
