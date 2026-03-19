import { useCallback, useEffect, useMemo, useState } from "react";
import type { InitiativePhaseCheckResult } from "../../../api/initiatives.js";
import type { Initiative, InitiativeRefinementState } from "../../../types.js";
import type { SpecStep } from "./shared.js";

interface OptimisticPhaseCheckState {
  step: SpecStep;
  questions: InitiativeRefinementState["questions"];
  assumptions: string[];
  checkedAt: string;
}

interface UseOptimisticPhaseCheckConfig {
  initiative: Initiative | null;
  activeSpecStep: SpecStep | null;
  persistedRefinement: InitiativeRefinementState | null;
  refinementAnswers: Record<string, string | string[] | boolean>;
  defaultAnswerQuestionIds: string[];
}

const mergeRefinementHistory = (
  persistedRefinement: InitiativeRefinementState,
  questions: InitiativeRefinementState["questions"],
): InitiativeRefinementState["history"] => {
  const historyById = new Map((persistedRefinement.history ?? []).map((question) => [question.id, question]));
  for (const question of questions) {
    historyById.set(question.id, question);
  }

  return Array.from(historyById.values());
};

export const useOptimisticPhaseCheck = ({
  initiative,
  activeSpecStep,
  persistedRefinement,
  refinementAnswers,
  defaultAnswerQuestionIds,
}: UseOptimisticPhaseCheckConfig) => {
  const [optimisticPhaseCheck, setOptimisticPhaseCheck] = useState<OptimisticPhaseCheckState | null>(null);

  useEffect(() => {
    if (!optimisticPhaseCheck) {
      return;
    }

    if (!initiative) {
      setOptimisticPhaseCheck(null);
      return;
    }

    const persistedStepRefinement = initiative.workflow.refinements[optimisticPhaseCheck.step];
    if (persistedStepRefinement.checkedAt && persistedStepRefinement.questions.length > 0) {
      setOptimisticPhaseCheck(null);
    }
  }, [initiative, optimisticPhaseCheck]);

  const applyPhaseCheckResult = useCallback((step: SpecStep, result: InitiativePhaseCheckResult) => {
    if (result.decision === "ask") {
      setOptimisticPhaseCheck({
        step,
        questions: result.questions,
        assumptions: result.assumptions,
        checkedAt: new Date().toISOString(),
      });
      return;
    }

    setOptimisticPhaseCheck((current) => (current?.step === step ? null : current));
  }, []);

  const activeRefinement = useMemo(() => {
    if (!persistedRefinement || optimisticPhaseCheck?.step !== activeSpecStep) {
      return persistedRefinement;
    }

    return {
      ...persistedRefinement,
      questions: optimisticPhaseCheck.questions,
      history: mergeRefinementHistory(persistedRefinement, optimisticPhaseCheck.questions),
      answers: refinementAnswers,
      defaultAnswerQuestionIds,
      baseAssumptions: optimisticPhaseCheck.assumptions,
      checkedAt: optimisticPhaseCheck.checkedAt,
    } satisfies InitiativeRefinementState;
  }, [
    activeSpecStep,
    defaultAnswerQuestionIds,
    optimisticPhaseCheck,
    persistedRefinement,
    refinementAnswers,
  ]);

  return {
    activeRefinement,
    applyPhaseCheckResult,
  };
};
