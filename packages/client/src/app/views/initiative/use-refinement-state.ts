import { useEffect, useMemo, useRef, useState } from "react";
import type {
  InitiativePlanningQuestion,
  InitiativePlanningStep,
  InitiativeRefinementState
} from "../../../types.js";
import { getFirstOpenQuestionId, getResumeQuestionId } from "./refinement-question-utils.js";
import { isQuestionAnswered } from "./shared.js";

const buildVisibleQuestions = (
  activeRefinement: InitiativeRefinementState,
): InitiativePlanningQuestion[] => {
  const history = activeRefinement.history ?? [];
  const activeQuestions = activeRefinement.questions;

  if (history.length === 0 || activeQuestions.length === 0) {
    return activeQuestions.length > 0 ? activeQuestions : history;
  }

  const reopenedHistoryQuestionIds = new Set(
    activeQuestions.flatMap((question) => question.reopensQuestionIds ?? [])
  );
  const visibleHistory = history.filter(
    (question) => !reopenedHistoryQuestionIds.has(question.id)
  );
  const activeQuestionsById = new Map(activeQuestions.map((question) => [question.id, question]));
  const visibleQuestions = visibleHistory.map((question) => activeQuestionsById.get(question.id) ?? question);
  const historyQuestionIds = new Set(visibleHistory.map((question) => question.id));

  for (const question of activeQuestions) {
    if (!historyQuestionIds.has(question.id)) {
      visibleQuestions.push(question);
    }
  }

  return visibleQuestions;
};

export interface UseRefinementStateOptions {
  activeSpecStep: InitiativePlanningStep;
  activeRefinement: InitiativeRefinementState;
  refinementAnswers: Record<string, string | string[] | boolean>;
  defaultAnswerQuestionIds: string[];
  variant: "full" | "compact" | "survey";
  leadingStepCount: number;
  surveyResumeKey: number;
  autoCompleteResolvedSurvey: boolean;
  loadingStateLabel: string | null;
  onCompleteSurvey?: () => void | Promise<void>;
}

export const useRefinementState = (options: UseRefinementStateOptions) => {
  const {
    activeSpecStep,
    activeRefinement,
    refinementAnswers,
    defaultAnswerQuestionIds,
    variant,
    leadingStepCount,
    surveyResumeKey,
    autoCompleteResolvedSurvey,
    loadingStateLabel,
    onCompleteSurvey,
  } = options;

  const compact = variant !== "full";
  const questionDeck = variant === "survey" || variant === "compact";
  const survey = variant === "survey";

  const visibleQuestions = useMemo(
    () => buildVisibleQuestions(activeRefinement),
    [activeRefinement],
  );
  const locallyTouchedQuestionIds = useMemo(
    () =>
      new Set([
        ...Object.keys(refinementAnswers),
        ...defaultAnswerQuestionIds,
      ]),
    [defaultAnswerQuestionIds, refinementAnswers],
  );
  const effectiveRefinementAnswers = useMemo(
    () =>
      locallyTouchedQuestionIds.size === 0
        ? activeRefinement.answers
        : {
            ...activeRefinement.answers,
            ...refinementAnswers,
          },
    [activeRefinement.answers, locallyTouchedQuestionIds.size, refinementAnswers],
  );
  const effectiveDefaultAnswerQuestionIds = useMemo(() => {
    if (locallyTouchedQuestionIds.size === 0) {
      return activeRefinement.defaultAnswerQuestionIds;
    }

    return [
      ...activeRefinement.defaultAnswerQuestionIds.filter(
        (questionId) => !locallyTouchedQuestionIds.has(questionId),
      ),
      ...defaultAnswerQuestionIds,
    ];
  }, [
    activeRefinement.defaultAnswerQuestionIds,
    defaultAnswerQuestionIds,
    locallyTouchedQuestionIds,
  ]);
  const locallyUnresolvedQuestionIds = useMemo(() => new Set(
    visibleQuestions
      .filter(
        (question) =>
          !isQuestionAnswered(effectiveRefinementAnswers[question.id]) &&
          !effectiveDefaultAnswerQuestionIds.includes(question.id),
      )
      .map((question) => question.id),
  ), [
    effectiveDefaultAnswerQuestionIds,
    effectiveRefinementAnswers,
    visibleQuestions,
  ]);
  const locallyUnresolvedQuestionCount = locallyUnresolvedQuestionIds.size;
  const visibleRefinement = useMemo<InitiativeRefinementState>(
    () => ({
      ...activeRefinement,
      questions: visibleQuestions,
    }),
    [activeRefinement, visibleQuestions],
  );
  const initialOpenQuestionId =
    questionDeck && locallyUnresolvedQuestionCount === 0
      ? null
      : getFirstOpenQuestionId(
          visibleRefinement,
          effectiveRefinementAnswers,
          effectiveDefaultAnswerQuestionIds,
        );
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(() =>
    initialOpenQuestionId,
  );
  const autoCompletedResolvedSurveyRef = useRef<string | null>(null);
  const showSurveyLoading = questionDeck && Boolean(loadingStateLabel);

  const resolvedQuestionCount = visibleQuestions.length - locallyUnresolvedQuestionCount;
  const completionPercent =
    visibleQuestions.length === 0
      ? 0
      : Math.round((resolvedQuestionCount / visibleQuestions.length) * 100);

  useEffect(() => {
    if (openQuestionId === null) {
      if (questionDeck && locallyUnresolvedQuestionCount > 0) {
        setOpenQuestionId(getFirstOpenQuestionId(
          visibleRefinement,
          effectiveRefinementAnswers,
          effectiveDefaultAnswerQuestionIds,
        ));
      }
      return;
    }

    const hasOpenQuestion = visibleQuestions.some((question) => question.id === openQuestionId);
    if (hasOpenQuestion) {
      return;
    }

    setOpenQuestionId(getFirstOpenQuestionId(
      visibleRefinement,
      effectiveRefinementAnswers,
      effectiveDefaultAnswerQuestionIds,
    ));
  }, [
    effectiveDefaultAnswerQuestionIds,
    effectiveRefinementAnswers,
    locallyUnresolvedQuestionCount,
    openQuestionId,
    questionDeck,
    visibleQuestions,
    visibleRefinement,
  ]);

  useEffect(() => {
    if (!survey || surveyResumeKey === 0) {
      return;
    }

    setOpenQuestionId(
      locallyUnresolvedQuestionCount > 0
        ? getResumeQuestionId(
            visibleRefinement,
            effectiveRefinementAnswers,
            effectiveDefaultAnswerQuestionIds,
          )
        : null,
    );
  }, [
    effectiveDefaultAnswerQuestionIds,
    effectiveRefinementAnswers,
    locallyUnresolvedQuestionCount,
    survey,
    surveyResumeKey,
    visibleRefinement,
  ]);

  const questionIds = useMemo(
    () => visibleQuestions.map((question) => question.id),
    [visibleQuestions],
  );
  const currentQuestion = questionDeck
    ? openQuestionId === null
      ? null
      : visibleQuestions.find((question) => question.id === openQuestionId) ?? null
    : null;
  const currentQuestionIndex = currentQuestion ? questionIds.indexOf(currentQuestion.id) : -1;
  const previousQuestionId = currentQuestionIndex > 0 ? questionIds[currentQuestionIndex - 1] ?? null : null;
  const nextQuestionId = currentQuestionIndex >= 0
    ? visibleQuestions
        .slice(currentQuestionIndex + 1)
        .find((question) => locallyUnresolvedQuestionIds.has(question.id))
        ?.id ?? null
    : null;
  const surveyStepLabel =
    questionDeck && currentQuestionIndex >= 0
      ? `Step ${leadingStepCount + currentQuestionIndex + 1} of ${leadingStepCount + visibleQuestions.length}`
      : null;
  const completionReviewQuestionId = questionIds[questionIds.length - 1] ?? null;
  const shouldAutoCompleteResolvedSurvey =
    autoCompleteResolvedSurvey &&
    questionDeck &&
    !showSurveyLoading &&
    openQuestionId === null &&
    locallyUnresolvedQuestionCount === 0 &&
    visibleQuestions.length > 0 &&
    Boolean(onCompleteSurvey);
  const autoCompleteResolvedSurveyKey = shouldAutoCompleteResolvedSurvey
    ? JSON.stringify({
        step: activeSpecStep,
        questionIds,
        answers: effectiveRefinementAnswers,
        defaultAnswerQuestionIds: effectiveDefaultAnswerQuestionIds,
        surveyResumeKey,
      })
    : null;

  useEffect(() => {
    if (!autoCompleteResolvedSurveyKey) {
      autoCompletedResolvedSurveyRef.current = null;
      return;
    }

    if (autoCompletedResolvedSurveyRef.current === autoCompleteResolvedSurveyKey) {
      return;
    }

    autoCompletedResolvedSurveyRef.current = autoCompleteResolvedSurveyKey;
    void onCompleteSurvey?.();
  }, [autoCompleteResolvedSurveyKey, onCompleteSurvey]);

  return {
    visibleQuestions,
    effectiveRefinementAnswers,
    effectiveDefaultAnswerQuestionIds,
    locallyUnresolvedQuestionIds,
    locallyUnresolvedQuestionCount,
    resolvedQuestionCount,
    completionPercent,
    openQuestionId,
    setOpenQuestionId,
    currentQuestion,
    currentQuestionIndex,
    previousQuestionId,
    nextQuestionId,
    questionIds,
    surveyStepLabel,
    completionReviewQuestionId,
    questionDeck,
    compact,
    survey,
    showSurveyLoading,
  };
};
