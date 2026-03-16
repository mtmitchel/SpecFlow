import type {
  ClarifyHelpResult,
  PhaseCheckResult,
  PhaseMarkdownResult,
  PlanResult,
  ReviewRunResult,
  TriageResult
} from "../types.js";

const validateQuestions = (
  questions: PhaseCheckResult["questions"],
  maxQuestions: number
): void => {
  if (!Array.isArray(questions)) {
    throw new Error("Phase-check result missing questions array");
  }

  if (questions.length > maxQuestions) {
    throw new Error(`Phase-check result exceeded max question budget (${maxQuestions})`);
  }

  for (const question of questions) {
    const options = Array.isArray(question.options) ? question.options : [];
    if (question.type === "text") {
      throw new Error(`Refinement question ${question.id} must use finite options`);
    }

    if ((question.type === "select" || question.type === "multi-select") && options.length === 0) {
      throw new Error(`Refinement question ${question.id} is missing options`);
    }

    if (!question.whyThisBlocks?.trim()) {
      throw new Error(`Refinement question ${question.id} is missing whyThisBlocks`);
    }

    if (!question.assumptionIfUnanswered?.trim()) {
      throw new Error(`Refinement question ${question.id} is missing assumptionIfUnanswered`);
    }

    if (question.optionHelp && typeof question.optionHelp !== "object") {
      throw new Error(`Refinement question ${question.id} has invalid optionHelp`);
    }

    if (question.recommendedOption && options.length > 0 && !options.includes(question.recommendedOption)) {
      throw new Error(`Refinement question ${question.id} recommendedOption must match one of the provided options`);
    }
  }
};

export const validatePhaseCheckResult = (
  result: PhaseCheckResult,
  maxQuestions: number
): void => {
  if (result.decision !== "proceed" && result.decision !== "ask") {
    throw new Error(`Phase-check decision must be "proceed" or "ask", received "${String(result.decision)}"`);
  }

  validateQuestions(result.questions, maxQuestions);

  if (!Array.isArray(result.assumptions)) {
    throw new Error("Phase-check result missing assumptions array");
  }
}

export const validateClarifyHelpResult = (result: ClarifyHelpResult): void => {
  if (!result.guidance?.trim()) {
    throw new Error("Clarify-help result must include guidance");
  }
};

export const validatePhaseMarkdownResult = (result: PhaseMarkdownResult): void => {
  if (!result.markdown?.trim()) {
    throw new Error("Phase generation result must include markdown");
  }

  if (!result.traceOutline || !Array.isArray(result.traceOutline.sections)) {
    throw new Error("Phase generation result must include traceOutline.sections");
  }
};

const validateStringArray = (value: unknown, fieldName: string): void => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${fieldName} must be an array of strings`);
  }
};

export const validateReviewRunResult = (result: ReviewRunResult): void => {
  if (!result.summary?.trim()) {
    throw new Error("Review result must include summary");
  }

  validateStringArray(result.blockers, "Review blockers");
  validateStringArray(result.warnings, "Review warnings");
  validateStringArray(result.traceabilityGaps, "Review traceabilityGaps");
  validateStringArray(result.assumptions, "Review assumptions");
  validateStringArray(result.recommendedFixes, "Review recommendedFixes");
};

export const validatePlanResult = (result: PlanResult): void => {
  if (!Array.isArray(result.phases)) {
    throw new Error("Plan result missing phases array");
  }

  validateStringArray(result.uncoveredCoverageItemIds, "Plan uncoveredCoverageItemIds");

  for (const phase of result.phases) {
    if (!Array.isArray(phase.tickets)) {
      throw new Error(`Plan phase "${phase.name}" is missing tickets array`);
    }

    for (const ticket of phase.tickets) {
      validateStringArray(ticket.acceptanceCriteria, `Plan ticket "${ticket.title}" acceptanceCriteria`);
      validateStringArray(ticket.fileTargets, `Plan ticket "${ticket.title}" fileTargets`);
      validateStringArray(ticket.coverageItemIds, `Plan ticket "${ticket.title}" coverageItemIds`);
    }
  }
};

export const validateTriageResult = (result: TriageResult): void => {
  const decision = result.decision?.toLowerCase();
  if (decision !== "ok" && decision !== "too-large") {
    throw new Error(`Triage result decision must be 'ok' or 'too-large', received '${result.decision}'`);
  }

  if (decision === "ok" && !result.ticketDraft) {
    throw new Error("Triage result for decision 'ok' must include ticketDraft");
  }
};
