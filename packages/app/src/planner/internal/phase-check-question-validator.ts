import type {
  PhaseCheckInput,
  PhaseCheckResult,
  RefinementHistoryEntry,
  RefinementStep,
} from "../types.js";
import type { InitiativePlanningQuestion } from "../../types/entities.js";
import { normalizeDecisionType } from "../decision-types.js";
import { getQuestionPolicy } from "../refinement-check-policy.js";
import { validateNoAmpersands } from "./title-style.js";
import {
  isDuplicateConcern,
  isExplicitReopenReference,
  isSemanticallyRepeatedConcern,
  materiallyNarrowsDecisionBoundary,
  optionEntailsQuestion,
} from "./refinement-question-comparison.js";

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

const isComparableOptionPhrase = (value: string): boolean => {
  const normalizedValue = normalizeFreeText(value);
  if (!normalizedValue) {
    return false;
  }

  const tokens = normalizedValue.split(" ").filter(Boolean);
  return tokens.length >= 2 || normalizedValue.length >= 10;
};

const countRestatedOptionsInLabel = (label: string, options: string[]): number => {
  const normalizedLabel = normalizeFreeText(label);

  return options.reduce((count, option) => {
    const normalizedOption = normalizeFreeText(option);
    if (!isComparableOptionPhrase(option) || !normalizedOption) {
      return count;
    }

    return normalizedLabel.includes(normalizedOption) ? count + 1 : count;
  }, 0);
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

    if (question.type === "boolean") {
      const normalizedLabel = question.label.trim().toLowerCase();
      if (/^(when|how|what|which|where)\b/.test(normalizedLabel)) {
        throw new Error(
          `Refinement question ${question.id} is boolean but the label starts with "${normalizedLabel.split(/\s/)[0]}" -- yes/no cannot answer that. Rewrite as a "should" or "does" question.`
        );
      }
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

    for (let oi = 0; oi < normalizedOptions.length; oi++) {
      const optTokens = normalizedOptions[oi].toLowerCase().split(/\s+/).filter((t) => t.length > 2);
      for (let oj = oi + 1; oj < normalizedOptions.length; oj++) {
        const otherTokens = normalizedOptions[oj].toLowerCase().split(/\s+/).filter((t) => t.length > 2);
        if (optTokens.length >= 3 && otherTokens.length >= 3) {
          const shared = optTokens.filter((t) => otherTokens.includes(t)).length;
          const ratio = shared / Math.min(optTokens.length, otherTokens.length);
          if (ratio >= 0.85) {
            throw new Error(
              `Refinement question ${question.id} has near-duplicate options "${normalizedOptions[oi]}" and "${normalizedOptions[oj]}"`,
            );
          }
        }
      }
    }

    if (
      (question.type === "select" || question.type === "multi-select") &&
      countRestatedOptionsInLabel(question.label, normalizedOptions) >= 3
    ) {
      throw new Error(`Refinement question ${question.id} restates answer options in the label. Rewrite the label as a short question about the decision without naming the specific choices -- the options are shown separately below the label.`);
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

    if (question.recommendedOption && question.type === "multi-select") {
      throw new Error(`Refinement question ${question.id} must not use recommendedOption for multi-select questions`);
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

      if (!materiallyNarrowsDecisionBoundary(question, duplicateQuestion)) {
        throw new Error(
          `Refinement question ${question.id} paraphrases already-asked ${input.phase} concern from ${duplicateQuestion.id} instead of materially narrowing it`,
        );
      }
    }

    for (const priorSeen of seenQuestions) {
      if (reopensQuestionIds.includes(priorSeen.id)) {
        continue;
      }
      const entailingOption = optionEntailsQuestion(priorSeen, question);
      if (entailingOption) {
        throw new Error(
          `Refinement question ${question.id} is already settled by option "${entailingOption}" in ${priorSeen.id}`,
        );
      }
      const reverseEntailing = optionEntailsQuestion(question, priorSeen);
      if (reverseEntailing) {
        throw new Error(
          `Refinement question ${question.id} has option "${reverseEntailing}" that settles earlier question ${priorSeen.id}`,
        );
      }
    }

    const duplicateEarlierConcern = historicalQuestions.find((priorQuestion) =>
      isSemanticallyRepeatedConcern(question, priorQuestion),
    );
    if (duplicateEarlierConcern && !reopensQuestionIds.includes(duplicateEarlierConcern.id)) {
      throw new Error(
        `Refinement question ${question.id} reopens earlier concern ${duplicateEarlierConcern.id} without reopensQuestionIds`,
      );
    }

    if (
      duplicateEarlierConcern &&
      reopensQuestionIds.includes(duplicateEarlierConcern.id) &&
      !materiallyNarrowsDecisionBoundary(question, duplicateEarlierConcern)
    ) {
      throw new Error(
        `Refinement question ${question.id} paraphrases earlier concern ${duplicateEarlierConcern.id} instead of materially narrowing it`,
      );
    }

    seenQuestions.push({
      ...question,
      decisionType: normalizedDecisionType,
      reopensQuestionIds: reopensQuestionIds.length > 0 ? reopensQuestionIds : undefined,
    });
  }
};
