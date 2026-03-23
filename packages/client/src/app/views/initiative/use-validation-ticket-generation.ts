import { useCallback, useEffect, useState } from "react";
import {
  continueInitiativeValidation,
  generateInitiativePlan,
} from "../../../api.js";
import { ApiError } from "../../../api/http.js";
import type {
  Initiative,
  InitiativePlanningStep,
  InitiativeRefinementState,
} from "../../../types.js";
import type { BusyActionResult } from "./use-cancellable-busy-action.js";
import { buildPlanValidationFeedbackByStep } from "./validation-feedback.js";
import {
  buildValidationDraftByStep,
  rerunValidationQuestions,
} from "./planning-continuation.js";

interface UseValidationTicketGenerationInput {
  initiative: Initiative | null;
  initiativeTicketCount: number;
  activeStep: InitiativePlanningStep;
  activeRefinement: InitiativeRefinementState | null;
  refinementAnswers: Record<string, string | string[] | boolean>;
  defaultAnswerQuestionIds: string[];
  validationFeedbackByStep: Partial<
    Record<"brief" | "core-flows" | "prd" | "tech-spec", string>
  >;
  validationFeedback: string | null;
  flushRefinementPersistence: () => Promise<boolean>;
  withBusyAction: (
    label: string,
    work: (signal: AbortSignal) => Promise<void>
  ) => Promise<BusyActionResult>;
  onRefresh: () => Promise<void>;
  navigateToStep: (
    step: InitiativePlanningStep,
    surface?: "questions" | "review" | null
  ) => void;
}

export const useValidationTicketGeneration = ({
  initiative,
  initiativeTicketCount,
  activeStep,
  activeRefinement,
  refinementAnswers,
  defaultAnswerQuestionIds,
  validationFeedbackByStep,
  validationFeedback,
  flushRefinementPersistence,
  withBusyAction,
  onRefresh,
  navigateToStep,
}: UseValidationTicketGenerationInput) => {
  const [ticketGenerationError, setTicketGenerationError] = useState<string | null>(
    null
  );
  const [validationStatusMessage, setValidationStatusMessage] = useState<
    string | null
  >(null);

  useEffect(() => {
    if ((initiative?.phases.length ?? 0) > 0 || initiativeTicketCount > 0) {
      setTicketGenerationError(null);
    }
  }, [initiative?.phases.length, initiativeTicketCount]);

  useEffect(() => {
    if (
      activeStep === "validation" &&
      (activeRefinement?.questions.length ?? 0) > 0
    ) {
      setTicketGenerationError(null);
    }
  }, [activeRefinement?.questions.length, activeStep]);

  const handleGenerateTickets = useCallback(async (): Promise<void> => {
    if (!initiative) {
      return;
    }

    const persisted = await flushRefinementPersistence();
    if (!persisted) {
      return;
    }

    setTicketGenerationError(null);
    setValidationStatusMessage("Preparing validation inputs...");

    let generationError: string | null = null;
    const status = await withBusyAction("generate-tickets", async (signal) => {
      const recoverPlanValidationFailure = async (
        error: unknown
      ): Promise<boolean> => {
        const recoverableFeedbackByStep = buildPlanValidationFeedbackByStep(
          error instanceof ApiError ? error.details : undefined
        );
        const recovered =
          Object.keys(recoverableFeedbackByStep).length > 0
            ? await rerunValidationQuestions({
                initiativeId: initiative.id,
                signal,
                feedbackByStep: recoverableFeedbackByStep,
              })
            : false;
        if (recovered) {
          await onRefresh();
          return true;
        }

        generationError =
          (error as Error).message?.trim() || "Ticket generation failed.";
        return false;
      };

      const plannerOptions = {
        signal,
        onPlannerStatus: (message: string) => {
          setValidationStatusMessage(message);
        },
      };

      if (activeStep === "validation") {
        try {
          const result = await continueInitiativeValidation(
            initiative.id,
            {
              draftByStep: buildValidationDraftByStep({
                initiative,
                answers: refinementAnswers,
                defaultAnswerQuestionIds,
              }),
              validationFeedbackByStep,
              validationFeedback,
            },
            plannerOptions
          );
          if (result.decision === "ask") {
            await onRefresh();
            return;
          }
          await onRefresh();
          navigateToStep("tickets");
          return;
        } catch (error) {
          if (await recoverPlanValidationFailure(error)) {
            return;
          }
          throw error;
        }
      }

      try {
        await generateInitiativePlan(initiative.id, plannerOptions);
        await onRefresh();
        navigateToStep("tickets");
      } catch (error) {
        if (await recoverPlanValidationFailure(error)) {
          return;
        }
        throw error;
      }
    });

    setValidationStatusMessage(null);

    if (
      status === "failed" &&
      initiative.phases.length === 0 &&
      initiativeTicketCount === 0
    ) {
      setTicketGenerationError(generationError ?? "Ticket generation failed.");
    }
  }, [
    activeStep,
    defaultAnswerQuestionIds,
    flushRefinementPersistence,
    initiative,
    initiativeTicketCount,
    navigateToStep,
    onRefresh,
    refinementAnswers,
    validationFeedback,
    validationFeedbackByStep,
    withBusyAction,
  ]);

  return {
    ticketGenerationError,
    validationStatusMessage,
    handleGenerateTickets,
  };
};
