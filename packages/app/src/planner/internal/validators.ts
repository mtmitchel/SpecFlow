import type {
  ClarifyHelpResult,
  PhaseCheckResult,
  PhaseMarkdownResult,
  PlanResult,
  RefinementStep,
  ReviewRunResult,
  TriageResult
} from "../types.js";
import { getQuestionPolicy } from "../refinement-check-policy.js";

const normalizeQuestionText = (question: PhaseCheckResult["questions"][number]): string =>
  [
    question.label,
    question.whyThisBlocks,
    question.assumptionIfUnanswered,
    ...(question.options ?? []),
    ...Object.values(question.optionHelp ?? {})
  ]
    .join(" ")
    .toLowerCase();

const validateQuestions = (
  questions: PhaseCheckResult["questions"],
  step: RefinementStep,
  maxQuestions: number
): void => {
  const questionPolicy = getQuestionPolicy(step);

  if (!Array.isArray(questions)) {
    throw new Error("Phase-check result missing questions array");
  }

  if (questions.length > maxQuestions) {
    throw new Error(`Phase-check result exceeded max question budget (${maxQuestions})`);
  }

  for (const question of questions) {
    const options = Array.isArray(question.options) ? question.options : [];
    if (question.affectedArtifact !== step) {
      throw new Error(`Refinement question ${question.id} must target ${step}`);
    }

    if (!questionPolicy.allowedDecisionTypes.includes(question.decisionType)) {
      throw new Error(
        `Refinement question ${question.id} uses disallowed decisionType "${question.decisionType}" for ${step}`
      );
    }

    if (!question.label?.trim()) {
      throw new Error(`Refinement question ${question.id} is missing label`);
    }

    if ((question.type === "select" || question.type === "multi-select") && options.length === 0) {
      throw new Error(`Refinement question ${question.id} is missing options`);
    }

    if (question.type === "boolean" && options.length > 0) {
      throw new Error(`Refinement question ${question.id} must not provide options for boolean questions`);
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

    const normalizedOptions = options.map((option) => option.trim()).filter(Boolean);
    if (normalizedOptions.length !== options.length) {
      throw new Error(`Refinement question ${question.id} includes blank option values`);
    }

    if (new Set(normalizedOptions.map((option) => option.toLowerCase())).size !== normalizedOptions.length) {
      throw new Error(`Refinement question ${question.id} includes duplicate options`);
    }

    if (normalizedOptions.some((option) => option.toLowerCase() === "other")) {
      throw new Error(`Refinement question ${question.id} must not include "Other" in options`);
    }

    if (normalizedOptions.length > 0) {
      const optionHelp = question.optionHelp ?? {};
      const missingOptionHelp = normalizedOptions.filter((option) => !optionHelp[option]?.trim());
      if (missingOptionHelp.length > 0) {
        throw new Error(
          `Refinement question ${question.id} is missing optionHelp for: ${missingOptionHelp.join(", ")}`
        );
      }

      const extraOptionHelp = Object.keys(optionHelp).filter((option) => !options.includes(option));
      if (extraOptionHelp.length > 0) {
        throw new Error(
          `Refinement question ${question.id} includes optionHelp for unknown options: ${extraOptionHelp.join(", ")}`
        );
      }
    }

    if (question.recommendedOption && options.length > 0 && !options.includes(question.recommendedOption)) {
      throw new Error(`Refinement question ${question.id} recommendedOption must match one of the provided options`);
    }

    if (question.allowCustomAnswer != null && typeof question.allowCustomAnswer !== "boolean") {
      throw new Error(`Refinement question ${question.id} has invalid allowCustomAnswer`);
    }

    const normalizedQuestionText = normalizeQuestionText(question);
    const forbiddenTerm = questionPolicy.forbiddenTerms.find((term) => normalizedQuestionText.includes(term));
    if (forbiddenTerm) {
      throw new Error(
        `Refinement question ${question.id} includes forbidden ${step} theme "${forbiddenTerm}"`
      );
    }
  }

};

export const validatePhaseCheckResult = (
  result: PhaseCheckResult,
  step: RefinementStep,
  maxQuestions: number,
  requiredQuestionCount = 0
): void => {
  const questionPolicy = getQuestionPolicy(step);

  if (result.decision !== "proceed" && result.decision !== "ask") {
    throw new Error(`Phase-check decision must be "proceed" or "ask", received "${String(result.decision)}"`);
  }

  validateQuestions(result.questions, step, maxQuestions);

  if (requiredQuestionCount > 0) {
    if (result.decision !== "ask") {
      throw new Error('Phase-check decision must be "ask" when starter questions are required');
    }

    if (result.questions.length < requiredQuestionCount) {
      throw new Error(
        `Phase-check result must include at least ${requiredQuestionCount} starter question${requiredQuestionCount === 1 ? "" : "s"} when starter questions are required`
      );
    }

    for (const decisionType of questionPolicy.requiredStarterDecisionTypes) {
      if (!result.questions.some((question) => question.decisionType === decisionType)) {
        throw new Error(
          `Phase-check result for ${step} must include a ${decisionType} question in the first starter set`
        );
      }
    }
  }

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
