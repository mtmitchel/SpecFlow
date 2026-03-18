import type { InitiativePlanningQuestion, InitiativeRefinementState } from "../../../types.js";
import type { RefinementAnswer } from "./shared.js";
import { isQuestionAnswered } from "./shared.js";

export const getAnswerPreview = (
  question: InitiativePlanningQuestion,
  value: RefinementAnswer,
  usingDefault: boolean,
): string | null => {
  if (usingDefault) {
    return question.assumptionIfUnanswered;
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    const resolvedValues = value.map((item) => item.trim()).filter(Boolean);
    return resolvedValues.length > 0 ? resolvedValues.join(", ") : null;
  }

  return null;
};

export const getFirstOpenQuestionId = (
  activeRefinement: InitiativeRefinementState,
  refinementAnswers: Record<string, string | string[] | boolean>,
  defaultAnswerQuestionIds: string[],
): string | null => {
  const firstUnresolved = activeRefinement.questions.find(
    (question) =>
      !isQuestionAnswered(refinementAnswers[question.id]) && !defaultAnswerQuestionIds.includes(question.id),
  );

  return firstUnresolved?.id ?? activeRefinement.questions[0]?.id ?? null;
};

export const getResumeQuestionId = (
  activeRefinement: InitiativeRefinementState,
  refinementAnswers: Record<string, string | string[] | boolean>,
  defaultAnswerQuestionIds: string[],
): string | null => {
  const firstUnresolved = activeRefinement.questions.find(
    (question) =>
      !isQuestionAnswered(refinementAnswers[question.id]) && !defaultAnswerQuestionIds.includes(question.id),
  );
  if (firstUnresolved) {
    return firstUnresolved.id;
  }

  return activeRefinement.questions[activeRefinement.questions.length - 1]?.id ?? null;
};
