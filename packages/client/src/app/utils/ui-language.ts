import type { Initiative, InitiativePlanningStep, PlanningReviewKind, Ticket } from "../../types.js";
import type { InitiativeProgressModel } from "./initiative-progress.js";
import { INITIATIVE_WORKFLOW_LABELS } from "./initiative-workflow.js";

const REVIEW_ACTION_LABELS: Record<PlanningReviewKind, string> = {
  "brief-review": "Review brief",
  "brief-core-flows-crosscheck": "Review core flows",
  "core-flows-review": "Review core flows",
  "core-flows-prd-crosscheck": "Review PRD",
  "prd-review": "Review PRD",
  "prd-tech-spec-crosscheck": "Review tech spec",
  "tech-spec-review": "Review tech spec",
  "spec-set-review": "Review plan",
  "ticket-coverage-review": "Run coverage check"
};

export const getPlanningStepName = (step: InitiativePlanningStep): string =>
  step === "prd" ? INITIATIVE_WORKFLOW_LABELS[step] : INITIATIVE_WORKFLOW_LABELS[step].toLowerCase();

export const getPlanningQuestionActionLabel = (
  step: InitiativePlanningStep,
  checkedAt: string | null
): string => {
  if (!checkedAt) {
    return step === "brief" ? "Start brief intake" : `Answer questions for ${getPlanningStepName(step)}`;
  }

  return "Review questions";
};

export const getPlanningGenerateActionLabel = (
  step: InitiativePlanningStep,
  hasContent: boolean
): string => (hasContent ? `Refresh ${getPlanningStepName(step)}` : `Generate ${getPlanningStepName(step)}`);

export const getPlanningNextActionLabel = (step: InitiativePlanningStep): string =>
  step === "tickets" ? "Continue to tickets" : `Continue to ${getPlanningStepName(step)}`;

export const getPlanningResumeActionLabel = (step: InitiativePlanningStep): string =>
  step === "tickets" ? "Open tickets" : `Review ${getPlanningStepName(step)}`;

const getPlanningDraftReference = (step: InitiativePlanningStep): string => {
  switch (step) {
    case "brief":
      return "the brief";
    case "core-flows":
      return "core flows";
    case "prd":
      return "the PRD";
    case "tech-spec":
      return "the tech spec";
    case "tickets":
      return "tickets";
  }
};

export const getPlanningQuestionTransitionCopy = (
  step: InitiativePlanningStep,
  mode: "entry" | "follow-up"
): { title: string; body: string } => {
  const stepName = getPlanningStepName(step);

  if (mode === "entry") {
    return {
      title: `Preparing ${stepName} questions...`,
      body: `Gathering the decisions needed before the first ${stepName} draft.`
    };
  }

  return {
    title: `Checking ${stepName} questions...`,
    body: `Reviewing your answers before drafting ${getPlanningDraftReference(step)}.`
  };
};

export const getPlanningGenerationTransitionCopy = (
  step: InitiativePlanningStep
): { title: string; body: string } => ({
  title: `Generating ${getPlanningStepName(step)}...`,
  body: `Drafting ${getPlanningDraftReference(step)} from the decisions you confirmed.`
});

export const getPlanningStageCopy = (
  step: InitiativePlanningStep,
  stage: "consult" | "draft" | "checkpoint" | "complete",
  options?: {
    readyToGenerate?: boolean;
  }
): string | null => {
  if (stage === "consult") {
    return step === "brief"
      ? "Answer a few questions to start the brief in the right place."
      : `Answer the open questions, then generate the ${getPlanningStepName(step)}.`;
  }

  if (stage === "draft") {
    if (options?.readyToGenerate) {
      return step === "brief"
        ? "Brief intake is done. Generate the brief when you're ready."
        : `The key decisions are set. Generate the ${getPlanningStepName(step)} when you're ready.`;
    }

    return step === "tickets"
      ? "Generate tickets when the plan is ready."
      : `Generate the ${getPlanningStepName(step)} when you're ready.`;
  }

  if (stage === "checkpoint") {
    return "Fix the open issues before you move on.";
  }

  return null;
};

export const getPlanningReviewActionLabel = (
  reviewKind: PlanningReviewKind | null,
  step: InitiativePlanningStep
): string => reviewKind ? REVIEW_ACTION_LABELS[reviewKind] : `Review ${getPlanningStepName(step)}`;

const getInitiativeTicketActionLabel = (ticket: Ticket): string => {
  if (ticket.status === "verify") {
    return "Verify ticket";
  }

  if (ticket.status === "in-progress") {
    return "Resume ticket";
  }

  return "Open ticket";
};

export const getInitiativeQueueActionLabel = (
  initiative: Initiative,
  progress: InitiativeProgressModel
): string => {
  if (progress.resumeTicket) {
    return getInitiativeTicketActionLabel(progress.resumeTicket);
  }

  if (progress.currentKey === "done") {
    return "Done";
  }

  if (progress.currentKey === "execute") {
    if (progress.nextTicket?.status === "in-progress") {
      return "Resume ticket";
    }

    return "Open ticket";
  }

  if (progress.currentKey === "verify") {
    return "Verify ticket";
  }

  if (progress.currentNodeState === "checkpoint") {
    return getPlanningReviewActionLabel(progress.currentReviewKind, progress.currentKey);
  }

  if (progress.currentKey === "brief" && !initiative.workflow.refinements.brief.checkedAt) {
    return "Start brief intake";
  }

  if (initiative.workflow.steps[progress.currentKey].status === "stale") {
    return getPlanningResumeActionLabel(progress.currentKey);
  }

  return getPlanningNextActionLabel(progress.currentKey);
};

export const getStandaloneTicketActionLabel = (ticket: Ticket): string => {
  if (ticket.status === "verify") {
    return "Verify quick task";
  }

  if (ticket.status === "in-progress") {
    return "Resume quick task";
  }

  if (ticket.status === "ready") {
    return "Open quick task";
  }

  return "Open quick task";
};
