import type {
  InitiativeArtifactStep,
  InitiativePlanningStep,
  PlanningReviewArtifact,
  PlanningReviewKind,
  PlanningReviewStatus
} from "../types/entities.js";
import { PLANNING_STEPS } from "./workflow-state.js";

export const REVIEW_KIND_LABELS: Record<PlanningReviewKind, string> = {
  "brief-review": "Review brief",
  "brief-core-flows-crosscheck": "Cross-check brief and core flows",
  "core-flows-review": "Review core flows",
  "core-flows-prd-crosscheck": "Cross-check core flows and PRD",
  "prd-review": "Review PRD",
  "prd-tech-spec-crosscheck": "Cross-check PRD and tech spec",
  "tech-spec-review": "Review tech spec",
  "spec-set-review": "Review the full spec set"
};

export const REVIEW_KIND_SOURCE_STEPS: Record<PlanningReviewKind, InitiativeArtifactStep[]> = {
  "brief-review": ["brief"],
  "brief-core-flows-crosscheck": ["brief", "core-flows"],
  "core-flows-review": ["core-flows"],
  "core-flows-prd-crosscheck": ["core-flows", "prd"],
  "prd-review": ["prd"],
  "prd-tech-spec-crosscheck": ["prd", "tech-spec"],
  "tech-spec-review": ["tech-spec"],
  "spec-set-review": ["brief", "core-flows", "prd", "tech-spec"]
};

export const AUTO_REVIEW_KINDS_BY_STEP: Record<InitiativeArtifactStep, PlanningReviewKind[]> = {
  brief: ["brief-review"],
  "core-flows": ["core-flows-review", "brief-core-flows-crosscheck"],
  prd: ["prd-review", "core-flows-prd-crosscheck"],
  "tech-spec": ["tech-spec-review", "prd-tech-spec-crosscheck", "spec-set-review"]
};

export const REQUIRED_REVIEWS_BY_COMPLETED_STEP: Record<InitiativeArtifactStep, PlanningReviewKind[]> = {
  brief: ["brief-review"],
  "core-flows": ["core-flows-review", "brief-core-flows-crosscheck"],
  prd: ["prd-review", "core-flows-prd-crosscheck"],
  "tech-spec": ["tech-spec-review", "prd-tech-spec-crosscheck", "spec-set-review"]
};

const ARTIFACT_STEPS: InitiativeArtifactStep[] = ["brief", "core-flows", "prd", "tech-spec"];

export const getArtifactStepsFrom = (step: InitiativeArtifactStep): InitiativeArtifactStep[] => {
  const index = ARTIFACT_STEPS.indexOf(step);
  return index >= 0 ? ARTIFACT_STEPS.slice(index) : [];
};

export const getReviewsOwnedByStep = (step: InitiativeArtifactStep): PlanningReviewKind[] =>
  AUTO_REVIEW_KINDS_BY_STEP[step];

export const getReviewsRequiredBeforeStep = (step: InitiativePlanningStep): PlanningReviewKind[] => {
  const index = PLANNING_STEPS.indexOf(step);
  if (index <= 0) {
    return [];
  }

  const prerequisite = PLANNING_STEPS[index - 1];
  if (prerequisite === "tickets") {
    return [];
  }

  return REQUIRED_REVIEWS_BY_COMPLETED_STEP[prerequisite];
};

export const isReviewResolved = (status: PlanningReviewStatus): boolean =>
  status === "passed" || status === "overridden";

export const isReviewBlocking = (review: PlanningReviewArtifact | undefined): boolean =>
  !review || !isReviewResolved(review.status);

export const getImpactedReviewKinds = (step: InitiativeArtifactStep): PlanningReviewKind[] => {
  const impactedSteps = new Set(getArtifactStepsFrom(step));
  return (Object.keys(REVIEW_KIND_SOURCE_STEPS) as PlanningReviewKind[]).filter((kind) =>
    REVIEW_KIND_SOURCE_STEPS[kind].some((sourceStep) => impactedSteps.has(sourceStep))
  );
};
