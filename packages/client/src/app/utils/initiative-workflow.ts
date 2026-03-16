import type {
  InitiativeArtifactStep,
  InitiativePlanningStep,
  InitiativeWorkflow,
  PlanningReviewArtifact,
  PlanningReviewKind
} from "../../types";
import {
  ARTIFACT_STEPS,
  PLANNING_STEPS,
  PLANNING_STEP_LABELS,
  PLANNING_STEP_STATUS_LABELS,
  REVIEW_KIND_LABELS as SHARED_REVIEW_KIND_LABELS,
  REVIEWS_BY_ARTIFACT_STEP,
  TICKET_REVIEW_KINDS,
  getNextPlanningStep,
  getReviewsRequiredBeforePlanningStep,
  isReviewResolved
} from "../../../../app/src/planner/workflow-contract.js";

export const INITIATIVE_WORKFLOW_STEPS: InitiativePlanningStep[] = PLANNING_STEPS;
export const INITIATIVE_ARTIFACT_STEPS: InitiativeArtifactStep[] = ARTIFACT_STEPS;
export const INITIATIVE_WORKFLOW_LABELS: Record<InitiativePlanningStep, string> = PLANNING_STEP_LABELS;
export const REVIEW_KIND_LABELS: Record<PlanningReviewKind, string> = SHARED_REVIEW_KIND_LABELS;
export const REVIEWS_BY_STEP: Record<InitiativeArtifactStep, PlanningReviewKind[]> = REVIEWS_BY_ARTIFACT_STEP;
export const TICKETS_REVIEWS: PlanningReviewKind[] = TICKET_REVIEW_KINDS;
export const REQUIRED_REVIEWS_BEFORE_STEP = (step: InitiativePlanningStep): PlanningReviewKind[] =>
  getReviewsRequiredBeforePlanningStep(step);

const getReviewsOwnedByPlanningStep = (step: InitiativePlanningStep): PlanningReviewKind[] =>
  step === "tickets" ? TICKETS_REVIEWS : REVIEWS_BY_STEP[step];

export const getInitiativeResumeStep = (workflow: InitiativeWorkflow): InitiativePlanningStep => {
  for (const step of INITIATIVE_WORKFLOW_STEPS) {
    const status = workflow.steps[step].status;
    if (status === "ready" || status === "stale") {
      return step;
    }
  }

  for (const step of [...INITIATIVE_WORKFLOW_STEPS].reverse()) {
    if (workflow.steps[step].status === "complete") {
      return step;
    }
  }

  return "brief";
};

export const getInitiativeBlockedStep = (
  workflow: InitiativeWorkflow,
  planningReviews: PlanningReviewArtifact[],
): InitiativePlanningStep | null => {
  for (const step of INITIATIVE_WORKFLOW_STEPS) {
    if (workflow.steps[step].status === "locked") {
      continue;
    }

    const hasUnresolvedReview = getReviewsOwnedByPlanningStep(step).some((kind) => {
      const review = planningReviews.find((item) => item.kind === kind);
      return review && !isReviewResolved(review.status);
    });

    if (hasUnresolvedReview) {
      return step;
    }
  }

  return null;
};

export const canOpenInitiativeStep = (
  workflow: InitiativeWorkflow,
  planningReviews: PlanningReviewArtifact[],
  initiativeId: string,
  step: string | null
): step is InitiativePlanningStep =>
  Boolean(step) &&
  INITIATIVE_WORKFLOW_STEPS.includes(step as InitiativePlanningStep) &&
  workflow.steps[step as InitiativePlanningStep].status !== "locked" &&
  REQUIRED_REVIEWS_BEFORE_STEP(step as InitiativePlanningStep).every((kind) => {
    const review = planningReviews.find((item) => item.id === `${initiativeId}:${kind}`);
    return review && isReviewResolved(review.status);
  });
export const INITIATIVE_WORKFLOW_STATUS_LABELS: Record<
  InitiativeWorkflow["steps"][InitiativePlanningStep]["status"],
  string
> = PLANNING_STEP_STATUS_LABELS;

export const getNextInitiativeStep = (
  step: InitiativePlanningStep
): InitiativePlanningStep | null => getNextPlanningStep(step);
