import type {
  InitiativeArtifactStep,
  PlanningReviewArtifact,
  PlanningReviewKind
} from "../types/entities.js";
import {
  REVIEW_KIND_LABELS,
  REVIEW_KIND_SOURCE_STEPS,
  REVIEWS_BY_ARTIFACT_STEP as AUTO_REVIEW_KINDS_BY_STEP,
  REVIEWS_BY_ARTIFACT_STEP as REQUIRED_REVIEWS_BY_COMPLETED_STEP,
  getArtifactStepsFrom,
  getReviewsOwnedByArtifactStep,
  isReviewResolved
} from "./workflow-contract.js";

export { REVIEW_KIND_LABELS, REVIEW_KIND_SOURCE_STEPS, AUTO_REVIEW_KINDS_BY_STEP, REQUIRED_REVIEWS_BY_COMPLETED_STEP };
export { isReviewResolved };

export const getReviewsOwnedByStep = (step: InitiativeArtifactStep): PlanningReviewKind[] =>
  getReviewsOwnedByArtifactStep(step);

export const isReviewBlocking = (review: PlanningReviewArtifact | undefined): boolean =>
  !review || !isReviewResolved(review.status);

export const getImpactedReviewKinds = (step: InitiativeArtifactStep): PlanningReviewKind[] => {
  const impactedSteps = new Set(getArtifactStepsFrom(step));
  return (Object.keys(REVIEW_KIND_SOURCE_STEPS) as PlanningReviewKind[]).filter((kind) =>
    REVIEW_KIND_SOURCE_STEPS[kind].some(
      (sourceStep) => sourceStep !== "tickets" && sourceStep !== "validation" && impactedSteps.has(sourceStep)
    )
  );
};
