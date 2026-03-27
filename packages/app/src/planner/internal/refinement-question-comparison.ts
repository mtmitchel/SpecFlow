import type { InitiativePlanningQuestion } from "../../types/entities.js";
import { getDecisionTypeFamily } from "../decision-types.js";

export type ComparablePlanningQuestion = Pick<
  InitiativePlanningQuestion,
  "id" | "label" | "decisionType" | "options" | "whyThisBlocks"
> & {
  type?: InitiativePlanningQuestion["type"];
};

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

const getNormalizedOptions = (
  question: Pick<ComparablePlanningQuestion, "options">,
): string[] =>
  (question.options ?? [])
    .map((option) => option.toLowerCase().trim())
    .filter(Boolean)
    .sort();

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
  question: Pick<ComparablePlanningQuestion, "id">,
  priorQuestion: Pick<ComparablePlanningQuestion, "id">,
): boolean => {
  const normalizedId = normalizeConcernId(question.id);
  const normalizedPriorId = normalizeConcernId(priorQuestion.id);

  return normalizedId.length > 0 && normalizedId === normalizedPriorId;
};

const isEquivalentConcernFamily = (
  left: InitiativePlanningQuestion["decisionType"],
  right: InitiativePlanningQuestion["decisionType"],
): boolean => getDecisionTypeFamily(left) === getDecisionTypeFamily(right);

const hasEquivalentLabel = (
  question: Pick<ComparablePlanningQuestion, "label">,
  priorQuestion: Pick<ComparablePlanningQuestion, "label">,
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

const getMeaningfulNewTokens = (nextText: string, priorText: string): string[] => {
  const priorTokens = new Set(getQuestionTokens(priorText));
  return getQuestionTokens(nextText).filter((token) => !priorTokens.has(token));
};

const hasOverlappingDecisionScope = (
  question: ComparablePlanningQuestion,
  priorQuestion: ComparablePlanningQuestion,
): boolean => {
  const whyTokens = getQuestionTokens(question.whyThisBlocks);
  const priorWhyTokens = getQuestionTokens(priorQuestion.whyThisBlocks);
  const labelTokens = getQuestionTokens(question.label);
  const priorLabelTokens = getQuestionTokens(priorQuestion.label);

  const whyOverlap = getTokenOverlapRatio(whyTokens, priorWhyTokens);
  const labelOverlap = getTokenOverlapRatio(labelTokens, priorLabelTokens);

  // Require high overlap in BOTH label and whyThisBlocks to flag as duplicate.
  // Single-dimension overlap catches legitimate follow-ups too aggressively.
  if (whyOverlap >= 0.7 && labelOverlap >= 0.6) {
    return true;
  }

  const combinedTokens = [...labelTokens, ...whyTokens];
  const priorCombinedTokens = [...priorLabelTokens, ...priorWhyTokens];
  return combinedTokens.length >= 5 && priorCombinedTokens.length >= 5 &&
    getTokenOverlapRatio(combinedTokens, priorCombinedTokens) >= 0.8;
};

export const optionEntailsQuestion = (
  optionSource: ComparablePlanningQuestion,
  targetQuestion: ComparablePlanningQuestion,
): string | null => {
  const targetTokens = getQuestionTokens(targetQuestion.label);
  if (targetTokens.length === 0) {
    return null;
  }

  for (const option of optionSource.options ?? []) {
    const optionTokens = getQuestionTokens(option);
    if (optionTokens.length < 3) {
      continue;
    }
    const overlapWithLabel = getTokenOverlapRatio(optionTokens, targetTokens);
    if (overlapWithLabel >= 0.7) {
      return option;
    }
    const targetWhyTokens = getQuestionTokens(targetQuestion.whyThisBlocks);
    if (targetWhyTokens.length > 0) {
      const combinedTarget = [...targetTokens, ...targetWhyTokens];
      if (getTokenOverlapRatio(optionTokens, combinedTarget) >= 0.7) {
        return option;
      }
    }
  }
  return null;
};

export const isDuplicateConcern = (
  question: InitiativePlanningQuestion,
  priorQuestion: ComparablePlanningQuestion,
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

  if ((identicalOptions || bothOptionless) && overlap >= 0.8) {
    return true;
  }

  return hasOverlappingDecisionScope(question, priorQuestion);
};

export const isExplicitReopenReference = (
  question: InitiativePlanningQuestion,
  priorQuestion: ComparablePlanningQuestion,
): boolean => {
  if (hasEquivalentConcernId(question, priorQuestion)) {
    return true;
  }

  const { overlap, exactOrContained } = hasEquivalentLabel(question, priorQuestion);
  if (exactOrContained || overlap >= 0.8) {
    return true;
  }

  return getConcernIdTokenOverlapCount(question.id, priorQuestion.id) >= 2;
};

export const isSemanticallyRepeatedConcern = (
  question: InitiativePlanningQuestion,
  priorQuestion: ComparablePlanningQuestion,
): boolean =>
  isDuplicateConcern(question, priorQuestion) ||
  isExplicitReopenReference(question, priorQuestion);

export const materiallyNarrowsDecisionBoundary = (
  question: InitiativePlanningQuestion,
  priorQuestion: ComparablePlanningQuestion,
): boolean => {
  if (priorQuestion.type && priorQuestion.type !== question.type) {
    return true;
  }

  const options = getNormalizedOptions(question);
  const priorOptions = getNormalizedOptions(priorQuestion);
  if (options.join("|") !== priorOptions.join("|")) {
    return true;
  }

  if (getMeaningfulNewTokens(question.label, priorQuestion.label).length >= 2) {
    return true;
  }

  return getMeaningfulNewTokens(question.whyThisBlocks, priorQuestion.whyThisBlocks).length >= 3;
};
