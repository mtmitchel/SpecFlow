import { useMemo } from "react";
import type { ArtifactsSnapshot, PlanningReviewArtifact, PlanningReviewKind } from "../../../types.js";
import { getInitiativeDisplayTitle } from "../../utils/initiative-titles.js";
import { getNextInitiativeStep } from "../../utils/initiative-workflow.js";
import { EMPTY_SPEC_DRAFTS, useInitiativeLoadedSpecs } from "./use-initiative-loaded-specs.js";
import { useOptimisticPhaseCheck } from "./use-optimistic-phase-check.js";
import { useInitiativePlanningRoute } from "./use-initiative-planning-route.js";
import { getVisibleRefinementQuestions } from "./refinement-history.js";
import {
  TICKET_COVERAGE_REVIEW_KIND,
  isQuestionResolved,
  isResolvedReview,
  type SpecStep
} from "./shared.js";
import { buildValidationReviewFeedback, buildValidationRefinement } from "./validation-refinement.js";
import { buildValidationReviewFeedbackByStep } from "./validation-feedback.js";

export const useInitiativePlanningDerivedState = ({
  snapshot,
  initiativeId,
  refinementAnswers,
  defaultAnswerQuestionIds,
}: {
  snapshot: ArtifactsSnapshot;
  initiativeId: string | undefined;
  refinementAnswers: Record<string, string | string[] | boolean>;
  defaultAnswerQuestionIds: string[];
}) => {
  const initiative = snapshot.initiatives.find((item) => item.id === initiativeId) ?? null;
  const loadedSpecs = useInitiativeLoadedSpecs(initiative?.id ?? null, snapshot.specs);

  const savedDrafts = useMemo<Record<SpecStep, string>>(() => {
    if (!initiative) {
      return EMPTY_SPEC_DRAFTS;
    }

    return {
      brief: loadedSpecs.brief,
      "core-flows": loadedSpecs["core-flows"],
      prd: loadedSpecs.prd,
      "tech-spec": loadedSpecs["tech-spec"]
    };
  }, [initiative, loadedSpecs]);

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

  const activeRefinement = activeStep === "validation" ? validationRefinement : optimisticRefinement;
  const persistedActiveRefinement = activeStep === "validation" ? validationRefinement : persistedSpecRefinement;

  const initiativeTickets = useMemo(
    () => (initiative ? snapshot.tickets.filter((ticket) => ticket.initiativeId === initiative.id) : []),
    [initiative, snapshot.tickets]
  );
  const ticketCoverageArtifact = initiative
    ? snapshot.ticketCoverageArtifacts.find((item) => item.initiativeId === initiative.id) ?? null
    : null;
  const validationReview = getReview(TICKET_COVERAGE_REVIEW_KIND);
  const validationFeedback = buildValidationReviewFeedback(validationReview);
  const validationFeedbackByStep = useMemo(
    () => buildValidationReviewFeedbackByStep(validationReview),
    [validationReview]
  );
  const linkedRuns = useMemo(
    () =>
      initiativeTickets.length > 0
        ? snapshot.runs.filter((run) => run.ticketId && initiativeTickets.some((ticket) => ticket.id === run.ticketId))
        : [],
    [initiativeTickets, snapshot.runs]
  );

  const headerTitle = initiative ? getInitiativeDisplayTitle(initiative.title, initiative.description) : "";
  const hasActiveContent = activeSpecStep ? savedDrafts[activeSpecStep].trim().length > 0 : false;
  const hasRefinementQuestions = getVisibleRefinementQuestions(activeRefinement).length > 0;
  const hasPhaseSpecificRefinementDecisions = Boolean(activeRefinement && (
    Object.keys(activeRefinement.answers).length > 0 || activeRefinement.defaultAnswerQuestionIds.length > 0
  ));
  const unresolvedQuestionCount = activeRefinement
    ? activeRefinement.questions.filter(
        (question) => !isQuestionResolved(question, refinementAnswers, defaultAnswerQuestionIds)
      ).length
    : 0;
  const nextStep = getNextInitiativeStep(activeStep);

  return {
    initiative,
    initiativeReviews,
    getReview,
    hasOutstandingReview,
    activeStep,
    activeSurface,
    activeSpecStep,
    navigateToStep,
    setActiveSurface,
    savedDrafts,
    activeRefinement,
    persistedActiveRefinement,
    initiativeTickets,
    ticketCoverageArtifact,
    validationReview,
    validationFeedback,
    validationFeedbackByStep,
    linkedRuns,
    headerTitle,
    hasActiveContent,
    hasRefinementQuestions,
    hasPhaseSpecificRefinementDecisions,
    unresolvedQuestionCount,
    nextStep,
    applyPhaseCheckResult,
  };
};
