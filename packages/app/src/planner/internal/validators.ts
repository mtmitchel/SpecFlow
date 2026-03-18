import type {
  ClarifyHelpResult,
  PhaseCheckInput,
  PhaseCheckResult,
  PhaseMarkdownResult,
  PlanResult,
  RefinementHistoryEntry,
  RefinementStep,
  ReviewRunResult,
  TriageResult
} from "../types.js";
import type { InitiativePlanningQuestion } from "../../types/entities.js";
import { getDecisionTypeFamily, normalizeDecisionType } from "../decision-types.js";
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

const normalizeFreeText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const DUPLICATE_QUESTION_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "be",
  "by",
  "do",
  "for",
  "from",
  "how",
  "if",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "should",
  "the",
  "to",
  "v1",
  "what",
  "which",
  "who"
]);

const normalizeQuestionLabel = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getQuestionTokens = (label: string): string[] =>
  normalizeQuestionLabel(label)
    .split(" ")
    .filter((token) => token.length > 1 && !DUPLICATE_QUESTION_STOPWORDS.has(token));

const getTokenOverlapRatio = (left: string[], right: string[]): number => {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const rightSet = new Set(right);
  const overlap = left.filter((token) => rightSet.has(token)).length;
  return overlap / Math.min(left.length, right.length);
};

const getNormalizedOptions = (question: InitiativePlanningQuestion): string[] =>
  (question.options ?? [])
    .map((option: string) => option.toLowerCase().trim())
    .filter(Boolean)
    .sort();

const matchesExactTokenOrPhrase = (haystack: string, rawNeedle: string): boolean => {
  const needle = normalizeFreeText(rawNeedle);
  if (!needle) {
    return false;
  }

  if (needle.includes(" ") || needle.includes("-")) {
    return haystack.includes(needle);
  }

  return haystack.split(" ").includes(needle);
};

const buildConditionalForbiddenContext = (input: PhaseCheckInput): string =>
  normalizeFreeText(
    [
      input.initiativeDescription,
      input.briefMarkdown,
      input.coreFlowsMarkdown,
      input.prdMarkdown,
      JSON.stringify(input.savedContext ?? {}, null, 2),
      JSON.stringify(
        (input.refinementHistory ?? []).map((entry) => ({
          step: entry.step,
          label: entry.label,
          decisionType: entry.decisionType,
          whyThisBlocks: entry.whyThisBlocks,
          answer: entry.answer,
          assumption: entry.assumption
        })),
        null,
        2
      )
    ]
      .filter((value): value is string => Boolean(value))
      .join("\n")
  );

type HistoricalQuestion = Pick<
  InitiativePlanningQuestion,
  "id" | "label" | "decisionType" | "options" | "whyThisBlocks"
> & { step: RefinementStep };

const toHistoricalQuestion = (entry: RefinementHistoryEntry): HistoricalQuestion => ({
  id: entry.questionId,
  label: entry.label,
  decisionType: normalizeDecisionType(entry.decisionType),
  options: [],
  whyThisBlocks: entry.whyThisBlocks,
  step: entry.step
});

const isEquivalentConcernFamily = (
  left: InitiativePlanningQuestion["decisionType"],
  right: InitiativePlanningQuestion["decisionType"]
): boolean => getDecisionTypeFamily(left) === getDecisionTypeFamily(right);

const hasEquivalentLabel = (
  question: Pick<InitiativePlanningQuestion, "label">,
  priorQuestion: Pick<InitiativePlanningQuestion, "label">
): { overlap: number; exactOrContained: boolean } => {
  const normalizedLabel = normalizeQuestionLabel(question.label);
  const normalizedPriorLabel = normalizeQuestionLabel(priorQuestion.label);
  const exactOrContained =
    normalizedLabel.length > 0 &&
    normalizedPriorLabel.length > 0 &&
    (
      normalizedLabel === normalizedPriorLabel ||
      normalizedLabel.includes(normalizedPriorLabel) ||
      normalizedPriorLabel.includes(normalizedLabel)
    );

  return {
    overlap: getTokenOverlapRatio(getQuestionTokens(question.label), getQuestionTokens(priorQuestion.label)),
    exactOrContained
  };
};

const isDuplicateConcern = (
  question: InitiativePlanningQuestion,
  priorQuestion: InitiativePlanningQuestion
): boolean => {
  if (!isEquivalentConcernFamily(question.decisionType, priorQuestion.decisionType)) {
    return false;
  }

  const { overlap, exactOrContained } = hasEquivalentLabel(question, priorQuestion);
  if (exactOrContained) {
    return true;
  }

  const options = getNormalizedOptions(question);
  const priorOptions = getNormalizedOptions(priorQuestion);
  const identicalOptions = options.join("|") === priorOptions.join("|");
  const bothOptionless = options.length === 0 && priorOptions.length === 0;

  if ((identicalOptions || bothOptionless) && overlap >= 0.8) {
    return true;
  }

  return false;
};

const isCrossStageDuplicateConcern = (
  question: InitiativePlanningQuestion,
  priorQuestion: HistoricalQuestion
): boolean => {
  if (!isEquivalentConcernFamily(question.decisionType, priorQuestion.decisionType)) {
    return false;
  }

  const { overlap, exactOrContained } = hasEquivalentLabel(question, priorQuestion);
  return exactOrContained || overlap >= 0.8;
};

const validateQuestions = (
  questions: PhaseCheckResult["questions"],
  input: PhaseCheckInput,
  priorQuestions: InitiativePlanningQuestion[] = []
): void => {
  const questionPolicy = getQuestionPolicy(input.phase);
  const allowedDecisionTypes = new Set(questionPolicy.allowedDecisionTypes.map((decisionType) => normalizeDecisionType(decisionType)));
  const seenQuestions: InitiativePlanningQuestion[] = [...priorQuestions];
  const priorHistoryQuestions = (input.refinementHistory ?? [])
    .filter((entry) => entry.step !== input.phase)
    .map(toHistoricalQuestion);
  const conditionalForbiddenContext = buildConditionalForbiddenContext(input);

  if (!Array.isArray(questions)) {
    throw new Error("Phase-check result missing questions array");
  }

  if (questions.length > questionPolicy.maxQuestions) {
    throw new Error(`Phase-check result exceeded max question budget (${questionPolicy.maxQuestions})`);
  }

  for (const question of questions) {
    const options = Array.isArray(question.options) ? question.options : [];
    const normalizedDecisionType = normalizeDecisionType(question.decisionType);
    if (question.affectedArtifact !== input.phase) {
      throw new Error(`Refinement question ${question.id} must target ${input.phase}`);
    }

    if (!allowedDecisionTypes.has(normalizedDecisionType)) {
      throw new Error(
        `Refinement question ${question.id} uses disallowed decisionType "${question.decisionType}" for ${input.phase}`
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

    if (question.reopensQuestionIds != null && !Array.isArray(question.reopensQuestionIds)) {
      throw new Error(`Refinement question ${question.id} has invalid reopensQuestionIds`);
    }

    const reopensQuestionIds = Array.isArray(question.reopensQuestionIds)
      ? Array.from(new Set(question.reopensQuestionIds.map((questionId) => questionId.trim()).filter(Boolean)))
      : [];
    if (question.reopensQuestionIds && reopensQuestionIds.length !== question.reopensQuestionIds.length) {
      throw new Error(`Refinement question ${question.id} includes blank or duplicate reopensQuestionIds`);
    }

    const normalizedQuestionText = normalizeQuestionText(question);
    const hardForbiddenTerm = questionPolicy.hardForbiddenTerms.find((term) =>
      matchesExactTokenOrPhrase(normalizedQuestionText, term)
    );
    if (hardForbiddenTerm) {
      throw new Error(
        `Refinement question ${question.id} includes forbidden ${input.phase} theme "${hardForbiddenTerm}"`
      );
    }

    const conditionalForbiddenTerm = questionPolicy.conditionalForbiddenTerms.find(
      (term) =>
        matchesExactTokenOrPhrase(normalizedQuestionText, term) &&
        !matchesExactTokenOrPhrase(conditionalForbiddenContext, term)
    );
    if (conditionalForbiddenTerm) {
      throw new Error(
        `Refinement question ${question.id} includes forbidden ${input.phase} theme "${conditionalForbiddenTerm}"`
      );
    }

    const duplicateQuestion = seenQuestions.find((priorQuestion) => isDuplicateConcern(question, priorQuestion));
    if (duplicateQuestion) {
      throw new Error(
        `Refinement question ${question.id} repeats already-asked ${input.phase} concern from ${duplicateQuestion.id}`
      );
    }

    const reopenedQuestions = reopensQuestionIds.map((questionId) =>
      priorHistoryQuestions.find((priorQuestion) => priorQuestion.id === questionId)
    );
    if (reopenedQuestions.some((priorQuestion) => !priorQuestion)) {
      throw new Error(`Refinement question ${question.id} reopens an unknown earlier question`);
    }

    const invalidReopenReference = reopenedQuestions.find(
      (priorQuestion) => priorQuestion && !isCrossStageDuplicateConcern(question, priorQuestion)
    );
    if (invalidReopenReference) {
      throw new Error(
        `Refinement question ${question.id} reopens unrelated prior concern ${invalidReopenReference.id}`
      );
    }

    const duplicateEarlierConcern = priorHistoryQuestions.find((priorQuestion) =>
      isCrossStageDuplicateConcern(question, priorQuestion)
    );
    if (duplicateEarlierConcern && !reopensQuestionIds.includes(duplicateEarlierConcern.id)) {
      throw new Error(
        `Refinement question ${question.id} reopens earlier concern ${duplicateEarlierConcern.id} without reopensQuestionIds`
      );
    }

    seenQuestions.push({
      ...question,
      decisionType: normalizedDecisionType,
      reopensQuestionIds: reopensQuestionIds.length > 0 ? reopensQuestionIds : undefined
    });
  }

};

export const validatePhaseCheckResult = (
  result: PhaseCheckResult,
  input: PhaseCheckInput,
  priorQuestions: InitiativePlanningQuestion[] = []
): void => {
  const questionPolicy = getQuestionPolicy(input.phase);
  const requiredQuestionCount = input.requiredStarterQuestionCount ?? 0;

  if (result.decision !== "proceed" && result.decision !== "ask") {
    throw new Error(`Phase-check decision must be "proceed" or "ask", received "${String(result.decision)}"`);
  }

  validateQuestions(result.questions, input, priorQuestions);

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
      if (!result.questions.some((question) => normalizeDecisionType(question.decisionType) === normalizeDecisionType(decisionType))) {
        throw new Error(
          `Phase-check result for ${input.phase} must include a ${decisionType} question in the first starter set`
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
