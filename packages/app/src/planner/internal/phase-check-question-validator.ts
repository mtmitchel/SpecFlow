import type {
  PhaseCheckInput,
  PhaseCheckResult,
  RefinementHistoryEntry,
  RefinementStep,
} from "../types.js";
import type { InitiativePlanningQuestion } from "../../types/entities.js";
import { getDecisionTypeFamily, normalizeDecisionType } from "../decision-types.js";
import { getQuestionPolicy } from "../refinement-check-policy.js";
import { validateNoAmpersands } from "./title-style.js";

const normalizeQuestionText = (question: PhaseCheckResult["questions"][number]): string =>
  [
    question.label,
    question.whyThisBlocks,
    question.assumptionIfUnanswered,
    ...(question.options ?? []),
    ...Object.values(question.optionHelp ?? {}),
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
  "who",
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

const CONCERN_ID_SUFFIX_PATTERN = /-(?:v\d+|brief|prd|validation|tickets|tech-spec|core-flows)$/;
const CONCERN_ID_STOPWORDS = new Set([
  "brief",
  "core",
  "flows",
  "prd",
  "tech",
  "spec",
  "validation",
  "tickets",
]);

const normalizeConcernId = (id: string): string => {
  let normalized = id.toLowerCase().trim();

  while (CONCERN_ID_SUFFIX_PATTERN.test(normalized)) {
    normalized = normalized.replace(CONCERN_ID_SUFFIX_PATTERN, "");
  }

  return normalized;
};

const getConcernIdTokens = (id: string): string[] =>
  normalizeConcernId(id)
    .split("-")
    .filter((token) => token.length > 1 && !CONCERN_ID_STOPWORDS.has(token) && !/^v\d+$/.test(token));

const getConcernIdTokenOverlapCount = (leftId: string, rightId: string): number => {
  const rightTokens = new Set(getConcernIdTokens(rightId));
  return getConcernIdTokens(leftId).filter((token) => rightTokens.has(token)).length;
};

const hasEquivalentConcernId = (
  question: Pick<InitiativePlanningQuestion, "id">,
  priorQuestion: Pick<InitiativePlanningQuestion, "id">,
): boolean => {
  const normalizedId = normalizeConcernId(question.id);
  const normalizedPriorId = normalizeConcernId(priorQuestion.id);

  return normalizedId.length > 0 && normalizedId === normalizedPriorId;
};

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
          assumption: entry.assumption,
        })),
        null,
        2,
      ),
    ]
      .filter((value): value is string => Boolean(value))
      .join("\n"),
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
  step: entry.step,
});

const toPriorStepQuestion = (
  question: InitiativePlanningQuestion,
  step: RefinementStep,
): HistoricalQuestion => ({
  id: question.id,
  label: question.label,
  decisionType: normalizeDecisionType(question.decisionType),
  options: question.options ?? [],
  whyThisBlocks: question.whyThisBlocks,
  step,
});

const isEquivalentConcernFamily = (
  left: InitiativePlanningQuestion["decisionType"],
  right: InitiativePlanningQuestion["decisionType"],
): boolean => getDecisionTypeFamily(left) === getDecisionTypeFamily(right);

const hasEquivalentLabel = (
  question: Pick<InitiativePlanningQuestion, "label">,
  priorQuestion: Pick<InitiativePlanningQuestion, "label">,
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
    exactOrContained,
  };
};

const isDuplicateConcern = (
  question: InitiativePlanningQuestion,
  priorQuestion: InitiativePlanningQuestion,
): boolean => {
  if (!isEquivalentConcernFamily(question.decisionType, priorQuestion.decisionType)) {
    return false;
  }

  if (hasEquivalentConcernId(question, priorQuestion)) {
    return true;
  }

  const { overlap, exactOrContained } = hasEquivalentLabel(question, priorQuestion);
  if (exactOrContained) {
    return true;
  }

  const options = getNormalizedOptions(question);
  const priorOptions = getNormalizedOptions(priorQuestion);
  const identicalOptions = options.join("|") === priorOptions.join("|");
  const bothOptionless = options.length === 0 && priorOptions.length === 0;

  return (identicalOptions || bothOptionless) && overlap >= 0.8;
};

const isHistoricalDuplicateConcern = (
  question: InitiativePlanningQuestion,
  priorQuestion: HistoricalQuestion,
): boolean => {
  if (!isEquivalentConcernFamily(question.decisionType, priorQuestion.decisionType)) {
    return false;
  }

  if (hasEquivalentConcernId(question, priorQuestion)) {
    return true;
  }

  const { overlap, exactOrContained } = hasEquivalentLabel(question, priorQuestion);
  return exactOrContained || overlap >= 0.8;
};

const isExplicitReopenReference = (
  question: InitiativePlanningQuestion,
  priorQuestion: HistoricalQuestion,
): boolean => {
  // Explicit downstream reopens can legitimately move between decision families
  // when the same earlier concern turns into a product or implementation blocker.
  if (hasEquivalentConcernId(question, priorQuestion)) {
    return true;
  }

  const { overlap, exactOrContained } = hasEquivalentLabel(question, priorQuestion);
  if (exactOrContained || overlap >= 0.8) {
    return true;
  }

  return getConcernIdTokenOverlapCount(question.id, priorQuestion.id) >= 2;
};

export const validateQuestions = (
  questions: PhaseCheckResult["questions"],
  input: PhaseCheckInput,
  priorQuestions: InitiativePlanningQuestion[] = [],
): void => {
  const questionPolicy = getQuestionPolicy(input.phase);
  const allowedDecisionTypes = new Set(
    questionPolicy.allowedDecisionTypes.map((decisionType) => normalizeDecisionType(decisionType)),
  );
  const seenQuestions: InitiativePlanningQuestion[] = [...priorQuestions];
  const historicalQuestions = (input.refinementHistory ?? []).map(toHistoricalQuestion);
  const priorStepQuestions = priorQuestions.map((question) => toPriorStepQuestion(question, input.phase));
  const earlierQuestionsById = new Map(
    [...historicalQuestions, ...priorStepQuestions].map((question) => [question.id, question]),
  );
  const priorQuestionIds = new Set(priorQuestions.map((question) => question.id));
  const conditionalForbiddenContext = buildConditionalForbiddenContext(input);

  if (!Array.isArray(questions)) {
    throw new Error("Phase-check result missing questions array");
  }

  if (questions.length > questionPolicy.maxQuestions) {
    throw new Error(`Phase-check result exceeded max question budget (${questionPolicy.maxQuestions})`);
  }

  for (const [index, rawQuestion] of questions.entries()) {
    if (!rawQuestion || typeof rawQuestion !== "object") {
      throw new Error(`Phase-check question at index ${index} must be an object`);
    }

    const question = rawQuestion as InitiativePlanningQuestion;
    const options = Array.isArray(question.options) ? question.options : [];
    const normalizedDecisionType = normalizeDecisionType(question.decisionType);
    if (question.affectedArtifact !== input.phase) {
      throw new Error(`Refinement question ${question.id} must target ${input.phase}`);
    }

    if (!allowedDecisionTypes.has(normalizedDecisionType)) {
      throw new Error(
        `Refinement question ${question.id} uses disallowed decisionType "${question.decisionType}" for ${input.phase}`,
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

    const optionHelp = question.optionHelp ?? {};
    if (normalizedOptions.length > 0) {
      const missingOptionHelp = normalizedOptions.filter((option) => !optionHelp[option]?.trim());
      if (missingOptionHelp.length > 0) {
        throw new Error(
          `Refinement question ${question.id} is missing optionHelp for: ${missingOptionHelp.join(", ")}`,
        );
      }

      const extraOptionHelp = Object.keys(optionHelp).filter((option) => !options.includes(option));
      if (extraOptionHelp.length > 0) {
        throw new Error(
          `Refinement question ${question.id} includes optionHelp for unknown options: ${extraOptionHelp.join(", ")}`,
        );
      }
    }

    if (question.recommendedOption && options.length > 0 && !options.includes(question.recommendedOption)) {
      throw new Error(`Refinement question ${question.id} recommendedOption must match one of the provided options`);
    }

    if (question.allowCustomAnswer != null && typeof question.allowCustomAnswer !== "boolean") {
      throw new Error(`Refinement question ${question.id} has invalid allowCustomAnswer`);
    }

    if (
      question.reopensQuestionIds != null &&
      (!Array.isArray(question.reopensQuestionIds) ||
        question.reopensQuestionIds.some((questionId) => typeof questionId !== "string"))
    ) {
      throw new Error(`Refinement question ${question.id} has invalid reopensQuestionIds`);
    }

    validateNoAmpersands(question.label, `Refinement question ${question.id} label`);
    validateNoAmpersands(question.whyThisBlocks, `Refinement question ${question.id} whyThisBlocks`);
    validateNoAmpersands(question.assumptionIfUnanswered, `Refinement question ${question.id} assumptionIfUnanswered`);
    for (const option of normalizedOptions) {
      validateNoAmpersands(option, `Refinement question ${question.id} option`);
    }
    for (const helpText of Object.values(optionHelp)) {
      validateNoAmpersands(helpText, `Refinement question ${question.id} optionHelp`);
    }

    const reopensQuestionIds = Array.isArray(question.reopensQuestionIds)
      ? Array.from(new Set(question.reopensQuestionIds.map((questionId) => questionId.trim()).filter(Boolean)))
      : [];
    if (question.reopensQuestionIds && reopensQuestionIds.length !== question.reopensQuestionIds.length) {
      throw new Error(`Refinement question ${question.id} includes blank or duplicate reopensQuestionIds`);
    }

    const normalizedQuestionText = normalizeQuestionText(question);
    const hardForbiddenTerm = questionPolicy.hardForbiddenTerms.find((term) =>
      matchesExactTokenOrPhrase(normalizedQuestionText, term),
    );
    if (hardForbiddenTerm) {
      throw new Error(
        `Refinement question ${question.id} includes forbidden ${input.phase} theme "${hardForbiddenTerm}"`,
      );
    }

    const conditionalForbiddenTerm = questionPolicy.conditionalForbiddenTerms.find(
      (term) =>
        matchesExactTokenOrPhrase(normalizedQuestionText, term) &&
        !matchesExactTokenOrPhrase(conditionalForbiddenContext, term),
    );
    if (conditionalForbiddenTerm) {
      throw new Error(
        `Refinement question ${question.id} includes forbidden ${input.phase} theme "${conditionalForbiddenTerm}"`,
      );
    }

    const reopenedQuestions = reopensQuestionIds.map((questionId) =>
      earlierQuestionsById.get(questionId),
    );
    if (reopenedQuestions.some((priorQuestion) => !priorQuestion)) {
      throw new Error(`Refinement question ${question.id} reopens an unknown earlier question`);
    }

    const invalidReopenReference = reopenedQuestions.find(
      (priorQuestion) => priorQuestion && !isExplicitReopenReference(question, priorQuestion),
    );
    if (invalidReopenReference) {
      throw new Error(
        `Refinement question ${question.id} reopens unrelated prior concern ${invalidReopenReference.id}`,
      );
    }

    const duplicateQuestion = seenQuestions.find((priorQuestion) => isDuplicateConcern(question, priorQuestion));
    if (duplicateQuestion) {
      const explicitPriorReopen =
        priorQuestionIds.has(duplicateQuestion.id) &&
        reopensQuestionIds.includes(duplicateQuestion.id) &&
        Boolean(
          earlierQuestionsById.get(duplicateQuestion.id) &&
            isExplicitReopenReference(question, earlierQuestionsById.get(duplicateQuestion.id)!),
        );

      if (!explicitPriorReopen) {
        throw new Error(
          `Refinement question ${question.id} repeats already-asked ${input.phase} concern from ${duplicateQuestion.id}`,
        );
      }
    }

    const duplicateEarlierConcern = historicalQuestions.find((priorQuestion) =>
      isHistoricalDuplicateConcern(question, priorQuestion),
    );
    if (duplicateEarlierConcern && !reopensQuestionIds.includes(duplicateEarlierConcern.id)) {
      throw new Error(
        `Refinement question ${question.id} reopens earlier concern ${duplicateEarlierConcern.id} without reopensQuestionIds`,
      );
    }

    seenQuestions.push({
      ...question,
      decisionType: normalizedDecisionType,
      reopensQuestionIds: reopensQuestionIds.length > 0 ? reopensQuestionIds : undefined,
    });
  }
};
