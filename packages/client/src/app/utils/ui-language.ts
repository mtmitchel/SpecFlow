import type { Initiative, InitiativePlanningStep, PlanningReviewKind, Ticket } from "../../types.js";
import type { InitiativeProgressModel } from "./initiative-progress.js";
import { INITIATIVE_WORKFLOW_LABELS } from "./initiative-workflow.js";

const REVIEW_ACTION_LABELS: Record<PlanningReviewKind, string> = {
  "brief-review": "Review brief",
  "brief-core-flows-crosscheck": "Review flows",
  "core-flows-review": "Review flows",
  "core-flows-prd-crosscheck": "Review PRD",
  "prd-review": "Review PRD",
  "prd-tech-spec-crosscheck": "Review tech spec",
  "tech-spec-review": "Review tech spec",
  "spec-set-review": "Review plan",
  "ticket-coverage-review": "Coverage check"
};

export const getPlanningStepName = (step: InitiativePlanningStep): string =>
  INITIATIVE_WORKFLOW_LABELS[step].toLowerCase();

export const getPlanningQuestionActionLabel = (
  step: InitiativePlanningStep,
  checkedAt: string | null
): string => {
  if (!checkedAt) {
    return step === "brief" ? "Answer a few questions" : `Answer ${getPlanningStepName(step)} questions`;
  }

  return "Revise answers";
};

export const getPlanningGenerateActionLabel = (
  step: InitiativePlanningStep,
  hasContent: boolean
): string => (hasContent ? `Refresh ${getPlanningStepName(step)}` : `Generate ${getPlanningStepName(step)}`);

export const getPlanningNextActionLabel = (step: InitiativePlanningStep): string =>
  step === "tickets" ? "Continue to tickets" : `Continue to ${getPlanningStepName(step)}`;

export const getPlanningResumeActionLabel = (step: InitiativePlanningStep): string =>
  step === "tickets" ? "Continue tickets" : `Continue ${getPlanningStepName(step)}`;

export const getPlanningStageCopy = (
  step: InitiativePlanningStep,
  stage: "consult" | "draft" | "checkpoint" | "complete",
  options?: {
    readyToGenerate?: boolean;
  }
): string | null => {
  if (stage === "consult") {
    return step === "brief"
      ? "Answer a few questions to shape the brief."
      : `Answer the missing questions before you generate the ${getPlanningStepName(step)}.`;
  }

  if (stage === "draft") {
    if (options?.readyToGenerate) {
      return step === "brief"
        ? "Brief intake is complete. No more context is required right now. Generate the brief when you're ready."
        : `Inputs are complete. No more context is required right now. Generate the ${getPlanningStepName(step)} when you're ready.`;
    }

    return step === "tickets"
      ? "Break the work into tickets when the plan feels stable."
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
    return "Continue ticket";
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
      return "Continue ticket";
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
    return "Answer a few questions";
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
    return "Continue quick task";
  }

  if (ticket.status === "ready") {
    return "Open quick task";
  }

  return "Open quick task";
};
