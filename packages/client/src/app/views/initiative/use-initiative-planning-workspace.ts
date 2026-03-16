import { useEffect, useMemo, useState } from "react";
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
  saveInitiativeRefinement,
  saveInitiativeSpecs,
  updateInitiativePhases
} from "../../../api.js";
import { deleteInitiative } from "../../../api/initiatives.js";
import type {
  ArtifactsSnapshot,
  InitiativePlanningStep,
  PlanningReviewArtifact,
  PlanningReviewKind
} from "../../../types.js";
import { useToast } from "../../context/toast.js";
import { getInitiativeDisplayTitle } from "../../utils/initiative-titles.js";
import { getSpecMarkdown } from "../../utils/specs.js";
import {
  canOpenInitiativeStep,
  getInitiativeResumeStep,
  getNextInitiativeStep,
  INITIATIVE_ARTIFACT_STEPS,
  INITIATIVE_WORKFLOW_LABELS,
  REQUIRED_REVIEWS_BEFORE_STEP,
  REVIEWS_BY_STEP
} from "../../utils/initiative-workflow.js";
import {
  type PlanningJourneyStage,
  PHASE_TRANSITIONS,
  TICKET_COVERAGE_REVIEW_KIND,
  isQuestionResolved,
  isResolvedReview,
  type SaveState,
  type SpecStep
} from "./shared.js";

const EMPTY_DRAFTS: Record<SpecStep, string> = {
  brief: "",
  "core-flows": "",
  prd: "",
  "tech-spec": ""
};

const EMPTY_DRAFT_SAVE_STATE: Record<SpecStep, SaveState> = {
  brief: "idle",
  "core-flows": "idle",
  prd: "idle",
  "tech-spec": "idle"
};

export const useInitiativePlanningWorkspace = (
  snapshot: ArtifactsSnapshot,
  onRefresh: () => Promise<void>
) => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showError } = useToast();
  const initiative = snapshot.initiatives.find((item) => item.id === params.id) ?? null;

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [editingStep, setEditingStep] = useState<SpecStep | null>(null);
  const [drafts, setDrafts] = useState<Record<SpecStep, string>>(EMPTY_DRAFTS);
  const [draftSaveState, setDraftSaveState] = useState<Record<SpecStep, SaveState>>(EMPTY_DRAFT_SAVE_STATE);
  const [refinementAnswers, setRefinementAnswers] = useState<Record<string, string | string[] | boolean>>({});
  const [defaultAnswerQuestionIds, setDefaultAnswerQuestionIds] = useState<string[]>([]);
  const [refinementAssumptions, setRefinementAssumptions] = useState<string[]>([]);
  const [refinementSaveState, setRefinementSaveState] = useState<SaveState>("idle");
  const [guidanceQuestionId, setGuidanceQuestionId] = useState<string | null>(null);
  const [guidanceText, setGuidanceText] = useState<string | null>(null);
  const [transitionNotice, setTransitionNotice] = useState<{ heading: string; body: string } | null>(null);
  const [reviewOverrideKind, setReviewOverrideKind] = useState<PlanningReviewKind | null>(null);
  const [reviewOverrideReason, setReviewOverrideReason] = useState("");

  const savedDrafts = useMemo<Record<SpecStep, string>>(() => {
    if (!initiative) {
      return EMPTY_DRAFTS;
    }

    return {
      brief: getSpecMarkdown(snapshot.specs, initiative.id, "brief"),
      "core-flows": getSpecMarkdown(snapshot.specs, initiative.id, "core-flows"),
      prd: getSpecMarkdown(snapshot.specs, initiative.id, "prd"),
      "tech-spec": getSpecMarkdown(snapshot.specs, initiative.id, "tech-spec")
    };
  }, [initiative, snapshot.specs]);

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

  const initiativeReviews = initiative
    ? snapshot.planningReviews.filter((item) => item.initiativeId === initiative.id)
    : [];
  const getReview = (kind: PlanningReviewKind): PlanningReviewArtifact | undefined =>
    initiativeReviews.find((item) => item.kind === kind);

  const reviewBlockedStep =
    initiative &&
    (INITIATIVE_ARTIFACT_STEPS.find((step) => {
      if (!savedDrafts[step].trim()) {
        return false;
      }

      return REVIEWS_BY_STEP[step].some((kind) => !isResolvedReview(getReview(kind)));
    }) ??
      null);
  const requestedStep = searchParams.get("step");
  const handoff = searchParams.get("handoff");
  const resumeStep = initiative ? reviewBlockedStep ?? getInitiativeResumeStep(initiative.workflow) : "brief";
  const activeStep: InitiativePlanningStep =
    initiative && canOpenInitiativeStep(initiative.workflow, initiativeReviews, initiative.id, requestedStep)
      ? requestedStep
      : resumeStep;

  useEffect(() => {
    if (initiative && requestedStep !== activeStep) {
      setSearchParams({ step: activeStep }, { replace: true });
    }
  }, [activeStep, initiative, requestedStep, setSearchParams]);

  useEffect(() => {
    if (!initiative || !handoff) {
      return;
    }

    setSearchParams({ step: activeStep }, { replace: true });
  }, [activeStep, handoff, initiative, setSearchParams]);

  const activeSpecStep: SpecStep | null = activeStep === "tickets" ? null : activeStep;
  const activeRefinement = initiative && activeSpecStep ? initiative.workflow.refinements[activeSpecStep] : null;
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
  }, [activeStep, refinementSignature]);

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
  const showHeaderDescription = initiative ? headerTitle !== initiative.description : false;
  const stepStatus = initiative?.workflow.steps[activeStep].status ?? "locked";
  const isBusy = busyAction !== null;
  const hasActiveContent = activeSpecStep ? savedDrafts[activeSpecStep].trim().length > 0 : false;
  const activeContent = activeSpecStep ? drafts[activeSpecStep] : "";
  const hasRefinementQuestions = Boolean(activeRefinement && activeRefinement.questions.length > 0);
  const unresolvedQuestionCount = activeRefinement
    ? activeRefinement.questions.filter(
        (question) => !isQuestionResolved(question, refinementAnswers, defaultAnswerQuestionIds)
      ).length
    : 0;
  const nextStep = getNextInitiativeStep(activeStep);
  const unresolvedReviewsForActiveStep = activeSpecStep
    ? REVIEWS_BY_STEP[activeSpecStep].filter((kind) => !isResolvedReview(getReview(kind)))
    : [];
  const blockingReviewBeforeActiveStep = REQUIRED_REVIEWS_BEFORE_STEP(activeStep).find(
    (kind) => !isResolvedReview(getReview(kind))
  );
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
        : stepStatus === "stale" || unresolvedReviewsForActiveStep.length > 0
          ? "checkpoint"
          : "complete";

  useEffect(() => {
    if (!initiative || !activeSpecStep || editingStep !== activeSpecStep) {
      return;
    }

    if (drafts[activeSpecStep] === savedDrafts[activeSpecStep]) {
      return;
    }

    const timer = window.setTimeout(async () => {
      setDraftSaveState((current) => ({ ...current, [activeSpecStep]: "saving" }));
      try {
        await saveInitiativeSpecs(initiative.id, activeSpecStep, drafts[activeSpecStep]);
        await onRefresh();
        setDraftSaveState((current) => ({ ...current, [activeSpecStep]: "saved" }));
      } catch (error) {
        showError((error as Error).message ?? `Failed to save ${INITIATIVE_WORKFLOW_LABELS[activeSpecStep]}`);
        setDraftSaveState((current) => ({ ...current, [activeSpecStep]: "error" }));
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [activeSpecStep, drafts, editingStep, initiative, onRefresh, savedDrafts, showError]);

  const serverRefinementSignature = activeRefinement
    ? JSON.stringify({
        answers: activeRefinement.answers,
        defaultAnswerQuestionIds: activeRefinement.defaultAnswerQuestionIds
      })
    : "";
  const localRefinementSignature = JSON.stringify({
    answers: refinementAnswers,
    defaultAnswerQuestionIds
  });

  useEffect(() => {
    if (!initiative || !activeSpecStep || !activeRefinement) {
      return;
    }

    if (localRefinementSignature === serverRefinementSignature) {
      return;
    }

    const timer = window.setTimeout(async () => {
      setRefinementSaveState("saving");
      try {
        const result = await saveInitiativeRefinement(
          initiative.id,
          activeSpecStep,
          refinementAnswers,
          defaultAnswerQuestionIds
        );
        setRefinementAssumptions(result.assumptions);
        await onRefresh();
        setRefinementSaveState("saved");
      } catch (error) {
        showError((error as Error).message ?? "Failed to save answers");
        setRefinementSaveState("error");
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [
    activeRefinement,
    activeSpecStep,
    defaultAnswerQuestionIds,
    initiative,
    localRefinementSignature,
    onRefresh,
    refinementAnswers,
    serverRefinementSignature,
    showError
  ]);

  const withBusyAction = async (action: string, run: () => Promise<void>) => {
    setBusyAction(action);
    try {
      await run();
    } catch (error) {
      showError((error as Error).message ?? "Initiative action failed");
    } finally {
      setBusyAction(null);
    }
  };

  const navigateToStep = (step: InitiativePlanningStep): void => {
    setTransitionNotice(null);
    setSearchParams({ step });
  };

  const generateSpec = async (step: SpecStep): Promise<void> => {
    if (!initiative) {
      return;
    }

    const result =
      step === "brief"
        ? await generateInitiativeBrief(initiative.id)
        : step === "core-flows"
          ? await generateInitiativeCoreFlows(initiative.id)
          : step === "prd"
            ? await generateInitiativePrd(initiative.id)
            : await generateInitiativeTechSpec(initiative.id);

    await onRefresh();
    setEditingStep(null);
    setDraftSaveState((current) => ({ ...current, [step]: "saved" }));
    setTransitionNotice(PHASE_TRANSITIONS[step]);
    const followingStep = getNextInitiativeStep(step);
    const reviewsResolved = result.reviews.every((review) => review.status === "passed" || review.status === "overridden");
    if (followingStep && reviewsResolved) {
      navigateToStep(followingStep);
    }
  };

  const handleGenerateSpec = async (step: SpecStep): Promise<void> => {
    await withBusyAction(`generate-${step}`, async () => {
      await generateSpec(step);
    });
  };

  const handleCheckAndAdvance = async (step: SpecStep): Promise<void> => {
    if (!initiative) {
      return;
    }

    await withBusyAction(`check-${step}`, async () => {
      const result = await checkInitiativePhase(initiative.id, step);
      await onRefresh();
      setRefinementAssumptions(result.assumptions);
      setTransitionNotice(
        result.decision === "ask"
          ? {
              heading: `${INITIATIVE_WORKFLOW_LABELS[step]} intake ready`,
              body: `Answer the questions below before you generate the ${INITIATIVE_WORKFLOW_LABELS[step].toLowerCase()}.`
            }
          : {
              heading: `${INITIATIVE_WORKFLOW_LABELS[step]} intake complete`,
              body: `The decisions for this step are in place. Generate the ${INITIATIVE_WORKFLOW_LABELS[step].toLowerCase()} when you are ready.`
            }
      );
    });
  };

  const handleGenerateTickets = async (): Promise<void> => {
    if (!initiative) {
      return;
    }

    await withBusyAction("generate-tickets", async () => {
      await generateInitiativePlan(initiative.id);
      await onRefresh();
      setTransitionNotice(PHASE_TRANSITIONS.tickets);
    });
  };

  const handleRequestGuidance = async (questionId: string): Promise<void> => {
    if (!initiative) {
      return;
    }

    await withBusyAction("refinement-help", async () => {
      const result = await requestInitiativeClarificationHelp(initiative.id, questionId, "");
      setGuidanceQuestionId(questionId);
      setGuidanceText(result.guidance);
    });
  };

  const handleRunReview = async (kind: PlanningReviewKind): Promise<void> => {
    if (!initiative) {
      return;
    }

    await withBusyAction(`review-${kind}`, async () => {
      const review = await runInitiativeReview(initiative.id, kind);
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
          setTransitionNotice(PHASE_TRANSITIONS[activeSpecStep]);
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
              (reviewKind) => reviewKind !== kind && !isResolvedReview(getReview(reviewKind))
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

  const setReviewOverride = (kind: PlanningReviewKind, reason: string) => {
    setReviewOverrideKind(kind);
    setReviewOverrideReason(reason);
  };

  const clearReviewOverride = () => {
    setReviewOverrideKind(null);
    setReviewOverrideReason("");
  };

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

  const toggleEditingStep = () => {
    if (!activeSpecStep) {
      return;
    }

    setEditingStep((current) => (current === activeSpecStep ? null : activeSpecStep));
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

    if (!window.confirm(`Delete initiative "${headerTitle}"? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteInitiative(initiative.id);
      await onRefresh();
      navigate("/");
    } catch (error) {
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

  const openTicket = (ticketId: string) => {
    navigate(`/ticket/${ticketId}`);
  };

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
    transitionNotice,
    reviewOverrideKind,
    reviewOverrideReason,
    headerTitle,
    showHeaderDescription,
    activeStep,
    activeSpecStep,
    activeRefinement,
    getReview,
    stepStatus,
    isBusy,
    hasActiveContent,
    activeContent,
    hasRefinementQuestions,
    unresolvedQuestionCount,
    nextStep,
    unresolvedReviewsForActiveStep,
    blockingReviewBeforeActiveStep,
    navigateToStep,
    handleDeleteInitiative,
    handleGenerateSpec,
    handleCheckAndAdvance,
    handleGenerateTickets,
    handleRequestGuidance,
    handleRunReview,
    handleOverrideReview,
    handlePhaseRename,
    openTicket,
    toggleEditingStep,
    updateDraft,
    updateRefinementAnswer,
    deferRefinementQuestion,
    setReviewOverride,
    clearReviewOverride,
    setReviewOverrideReason
  };
};
