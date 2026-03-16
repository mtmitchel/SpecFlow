import type {
  InitiativeArtifactStep,
  InitiativePlanningStep,
  InitiativeWorkflow,
  PlanningReviewArtifact,
  PlanningReviewKind
} from "../../types";

export const INITIATIVE_WORKFLOW_STEPS: InitiativePlanningStep[] = ["brief", "core-flows", "prd", "tech-spec", "tickets"];
export const INITIATIVE_ARTIFACT_STEPS: InitiativeArtifactStep[] = ["brief", "core-flows", "prd", "tech-spec"];

export const INITIATIVE_WORKFLOW_LABELS: Record<InitiativePlanningStep, string> = {
  brief: "Brief",
  "core-flows": "Core flows",
  prd: "PRD",
  "tech-spec": "Tech Spec",
  tickets: "Tickets"
};

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

export const REVIEWS_BY_STEP: Record<InitiativeArtifactStep, PlanningReviewKind[]> = {
  brief: ["brief-review"],
  "core-flows": ["core-flows-review", "brief-core-flows-crosscheck"],
  prd: ["prd-review", "core-flows-prd-crosscheck"],
  "tech-spec": ["tech-spec-review", "prd-tech-spec-crosscheck", "spec-set-review"]
};

export const REQUIRED_REVIEWS_BEFORE_STEP = (step: InitiativePlanningStep): PlanningReviewKind[] => {
  const index = INITIATIVE_WORKFLOW_STEPS.indexOf(step);
  if (index <= 0) {
    return [];
  }

  const prerequisite = INITIATIVE_WORKFLOW_STEPS[index - 1];
  if (prerequisite === "tickets") {
    return [];
  }

  return REVIEWS_BY_STEP[prerequisite];
};

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
    return review && (review.status === "passed" || review.status === "overridden");
  });

export const INITIATIVE_WORKFLOW_STATUS_LABELS: Record<
  InitiativeWorkflow["steps"][InitiativePlanningStep]["status"],
  string
> = {
  locked: "Not ready",
  ready: "Up next",
  complete: "Done",
  stale: "Needs review"
};

export const getNextInitiativeStep = (
  step: InitiativePlanningStep
): InitiativePlanningStep | null => {
  const index = INITIATIVE_WORKFLOW_STEPS.indexOf(step);
  if (index < 0 || index === INITIATIVE_WORKFLOW_STEPS.length - 1) {
    return null;
  }
  return INITIATIVE_WORKFLOW_STEPS[index + 1];
};
