import type {
  InitiativeArtifactStep,
  InitiativePlanningStep,
  InitiativePlanningStepStatus,
  PlanningReviewKind,
  PlanningReviewStatus
} from "../types/entities.js";

export const PLANNING_STEPS: InitiativePlanningStep[] = ["brief", "core-flows", "prd", "tech-spec", "tickets"];
export const ARTIFACT_STEPS: InitiativeArtifactStep[] = ["brief", "core-flows", "prd", "tech-spec"];
export const REFINEMENT_STEPS = [...ARTIFACT_STEPS] as const;
export const REVIEW_KINDS: PlanningReviewKind[] = [
  "brief-review",
  "brief-core-flows-crosscheck",
  "core-flows-review",
  "core-flows-prd-crosscheck",
  "prd-review",
  "prd-tech-spec-crosscheck",
  "tech-spec-review",
  "spec-set-review",
  "ticket-coverage-review"
];

export const PLANNING_STEP_LABELS: Record<InitiativePlanningStep, string> = {
  brief: "Brief",
  "core-flows": "Core flows",
  prd: "PRD",
  "tech-spec": "Tech spec",
  tickets: "Tickets"
};

export const PLANNING_STEP_STATUS_LABELS: Record<InitiativePlanningStepStatus, string> = {
  locked: "Not ready",
  ready: "Up next",
  complete: "Done",
  stale: "Needs review"
};

export const REVIEW_KIND_LABELS: Record<PlanningReviewKind, string> = {
  "brief-review": "Review brief",
  "brief-core-flows-crosscheck": "Cross-check brief and core flows",
  "core-flows-review": "Review core flows",
  "core-flows-prd-crosscheck": "Cross-check core flows and PRD",
  "prd-review": "Review PRD",
  "prd-tech-spec-crosscheck": "Cross-check PRD and tech spec",
  "tech-spec-review": "Review tech spec",
  "spec-set-review": "Review the full spec set",
  "ticket-coverage-review": "Run coverage check"
};

export const REVIEW_KIND_SOURCE_STEPS: Record<PlanningReviewKind, InitiativePlanningStep[]> = {
  "brief-review": ["brief"],
  "brief-core-flows-crosscheck": ["brief", "core-flows"],
  "core-flows-review": ["core-flows"],
  "core-flows-prd-crosscheck": ["core-flows", "prd"],
  "prd-review": ["prd"],
  "prd-tech-spec-crosscheck": ["prd", "tech-spec"],
  "tech-spec-review": ["tech-spec"],
  "spec-set-review": ["brief", "core-flows", "prd", "tech-spec"],
  "ticket-coverage-review": ["brief", "core-flows", "prd", "tech-spec", "tickets"]
};

export const REVIEWS_BY_ARTIFACT_STEP: Record<InitiativeArtifactStep, PlanningReviewKind[]> = {
  brief: ["brief-review"],
  "core-flows": ["core-flows-review", "brief-core-flows-crosscheck"],
  prd: ["prd-review", "core-flows-prd-crosscheck"],
  "tech-spec": ["tech-spec-review", "prd-tech-spec-crosscheck", "spec-set-review"]
};

export const TICKET_REVIEW_KINDS: PlanningReviewKind[] = ["ticket-coverage-review"];

export const getArtifactStepsFrom = (step: InitiativeArtifactStep): InitiativeArtifactStep[] => {
  const index = ARTIFACT_STEPS.indexOf(step);
  return index >= 0 ? ARTIFACT_STEPS.slice(index) : [];
};

export const getReviewsOwnedByArtifactStep = (step: InitiativeArtifactStep): PlanningReviewKind[] =>
  REVIEWS_BY_ARTIFACT_STEP[step];

export const getPrerequisitePlanningStep = (step: InitiativePlanningStep): InitiativePlanningStep | null => {
  const index = PLANNING_STEPS.indexOf(step);
  if (index <= 0) {
    return null;
  }

  return PLANNING_STEPS[index - 1];
};

export const getNextPlanningStep = (step: InitiativePlanningStep): InitiativePlanningStep | null => {
  const index = PLANNING_STEPS.indexOf(step);
  if (index < 0 || index === PLANNING_STEPS.length - 1) {
    return null;
  }

  return PLANNING_STEPS[index + 1];
};

export const isReviewResolved = (status: PlanningReviewStatus): boolean =>
  status === "passed" || status === "overridden";
