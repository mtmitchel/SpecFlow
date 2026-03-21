import { useEffect, useState } from "react";
import type { InitiativePlanningStep } from "../../../types.js";
import type { BusyActionResult } from "./use-cancellable-busy-action.js";
import type { SpecStep } from "./shared.js";

export const useInitiativeAutoQuestionLoading = (options: {
  initiativeId: string | null;
  activeStep: InitiativePlanningStep;
  activeSpecStep: SpecStep | null;
  activeRefinementQuestionCount: number;
  hasActiveContent: boolean;
  hasRefinementQuestions: boolean;
  hasPhaseSpecificRefinementDecisions: boolean;
  busyAction: string | null;
  validationReviewId: string | null;
  validationReviewStatus: string | null;
  validationFeedback: string | null;
  validationFeedbackByStep: Partial<Record<SpecStep, string>>;
  handleCheckAndAdvance: (step: SpecStep) => Promise<BusyActionResult>;
  rerunValidationQuestions: (
    signal: AbortSignal,
    feedbackByStep: Partial<Record<SpecStep, string>>,
    fallbackFeedback?: string | null,
  ) => Promise<boolean>;
  withBusyAction: (label: string, work: (signal: AbortSignal) => Promise<void>) => Promise<BusyActionResult>;
  onRefresh: () => Promise<void>;
}) => {
  const {
    initiativeId,
    activeStep,
    activeSpecStep,
    activeRefinementQuestionCount,
    hasActiveContent,
    hasRefinementQuestions,
    hasPhaseSpecificRefinementDecisions,
    busyAction,
    validationReviewId,
    validationReviewStatus,
    validationFeedback,
    validationFeedbackByStep,
    handleCheckAndAdvance,
    rerunValidationQuestions,
    withBusyAction,
    onRefresh,
  } = options;
  const [autoQuestionLoadStep, setAutoQuestionLoadStep] = useState<SpecStep | null>(null);
  const [autoQuestionLoadFailedStep, setAutoQuestionLoadFailedStep] = useState<SpecStep | null>(null);
  const [autoValidationQuestionLoadReviewId, setAutoValidationQuestionLoadReviewId] = useState<string | null>(null);

  const shouldAutoLoadEntryQuestions = Boolean(
    initiativeId &&
      activeSpecStep &&
      activeSpecStep !== "brief" &&
      !hasActiveContent &&
      !hasRefinementQuestions &&
      !hasPhaseSpecificRefinementDecisions,
  );

  const shouldAutoLoadValidationQuestions = Boolean(
    initiativeId &&
      activeStep === "validation" &&
      validationReviewStatus === "blocked" &&
      activeRefinementQuestionCount === 0,
  );

  useEffect(() => {
    if (!initiativeId || !activeSpecStep) {
      return;
    }

    if (!shouldAutoLoadEntryQuestions) {
      setAutoQuestionLoadStep((current) => (current === activeSpecStep ? null : current));
      setAutoQuestionLoadFailedStep((current) => (current === activeSpecStep ? null : current));
      return;
    }

    if (
      busyAction ||
      autoQuestionLoadStep === activeSpecStep ||
      autoQuestionLoadFailedStep === activeSpecStep
    ) {
      return;
    }

    setAutoQuestionLoadStep(activeSpecStep);

    void handleCheckAndAdvance(activeSpecStep).then((status) => {
      setAutoQuestionLoadStep((current) => (current === activeSpecStep ? null : current));
      setAutoQuestionLoadFailedStep((current) => {
        if (status === "completed" || status === "cancelled") {
          return current === activeSpecStep ? null : current;
        }

        return activeSpecStep;
      });
    });
  }, [
    autoQuestionLoadFailedStep,
    autoQuestionLoadStep,
    activeSpecStep,
    busyAction,
    handleCheckAndAdvance,
    initiativeId,
    shouldAutoLoadEntryQuestions,
  ]);

  useEffect(() => {
    if (activeStep === "validation" && validationReviewStatus === "blocked") {
      return;
    }

    setAutoValidationQuestionLoadReviewId(null);
  }, [activeStep, validationReviewStatus]);

  useEffect(() => {
    if (!initiativeId || !shouldAutoLoadValidationQuestions || busyAction) {
      return;
    }

    const reviewId = validationReviewId;
    if (!reviewId || autoValidationQuestionLoadReviewId === reviewId) {
      return;
    }

    setAutoValidationQuestionLoadReviewId(reviewId);

    void withBusyAction("check-validation", async (signal) => {
      await rerunValidationQuestions(signal, validationFeedbackByStep, validationFeedback);
      await onRefresh();
    });
  }, [
    activeRefinementQuestionCount,
    activeStep,
    autoValidationQuestionLoadReviewId,
    busyAction,
    initiativeId,
    onRefresh,
    rerunValidationQuestions,
    shouldAutoLoadValidationQuestions,
    validationFeedback,
    validationFeedbackByStep,
    validationReviewId,
    validationReviewStatus,
    withBusyAction,
  ]);

  const resetAutoQuestionLoadState = (): void => {
    setAutoQuestionLoadStep(null);
    setAutoQuestionLoadFailedStep(null);
  };

  return {
    autoQuestionLoadStep,
    autoQuestionLoadFailedStep,
    resetAutoQuestionLoadState,
  };
};
