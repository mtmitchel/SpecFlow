import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { saveInitiativeRefinement, saveInitiativeSpecs } from "../../../api.js";
import type {
  Initiative,
  InitiativePlanningStep,
  InitiativePlanningSurface,
  InitiativeRefinementState
} from "../../../types.js";
import { INITIATIVE_WORKFLOW_LABELS } from "../../utils/initiative-workflow.js";
import type { PlanningDrawerState, SaveState, SpecStep } from "./shared.js";
import {
  partitionValidationAnswersByStep,
  VALIDATION_REFINEMENT_STEPS
} from "./validation-refinement.js";

interface InitiativePlanningPersistenceConfig {
  activeStep: InitiativePlanningStep;
  activeRefinement: InitiativeRefinementState | null;
  activeSurface: InitiativePlanningSurface | null;
  activeSpecStep: SpecStep | null;
  defaultAnswerQuestionIds: string[];
  drafts: Record<SpecStep, string>;
  drawerState: PlanningDrawerState;
  editingStep: SpecStep | null;
  initiative: Initiative | null;
  onRefresh: () => Promise<void>;
  refinementAnswers: Record<string, string | string[] | boolean>;
  savedDrafts: Record<SpecStep, string>;
  setDraftSaveState: Dispatch<SetStateAction<Record<SpecStep, SaveState>>>;
  setEditingStep: Dispatch<SetStateAction<SpecStep | null>>;
  setRefinementAssumptions: Dispatch<SetStateAction<string[]>>;
  setRefinementSaveState: Dispatch<SetStateAction<SaveState>>;
  showError: (message: string) => void;
}

interface InitiativePlanningPersistenceResult {
  flushRefinementPersistence: () => Promise<boolean>;
}

export const useInitiativePlanningPersistence = ({
  activeStep,
  activeRefinement,
  activeSurface,
  activeSpecStep,
  defaultAnswerQuestionIds,
  drafts,
  drawerState,
  editingStep,
  initiative,
  onRefresh,
  refinementAnswers,
  savedDrafts,
  setDraftSaveState,
  setEditingStep,
  setRefinementAssumptions,
  setRefinementSaveState,
  showError,
}: InitiativePlanningPersistenceConfig): InitiativePlanningPersistenceResult => {
  const refinementTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!initiative || !activeSpecStep || editingStep !== activeSpecStep) {
      return;
    }

    const drawerIsEditingCurrentStep = drawerState?.type === "edit" && drawerState.step === activeSpecStep;
    if (drafts[activeSpecStep] === savedDrafts[activeSpecStep]) {
      return;
    }

    const timer = window.setTimeout(async () => {
      setDraftSaveState((current) => ({ ...current, [activeSpecStep]: "saving" }));
      try {
        await saveInitiativeSpecs(initiative.id, activeSpecStep, drafts[activeSpecStep]);
        await onRefresh();
        setDraftSaveState((current) => ({ ...current, [activeSpecStep]: "saved" }));
        if (!drawerIsEditingCurrentStep) {
          setEditingStep(null);
        }
      } catch (error) {
        showError((error as Error).message ?? `We couldn't save the ${INITIATIVE_WORKFLOW_LABELS[activeSpecStep].toLowerCase()}.`);
        setDraftSaveState((current) => ({ ...current, [activeSpecStep]: "error" }));
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [
    activeSpecStep,
    drafts,
    drawerState,
    editingStep,
    initiative,
    onRefresh,
    savedDrafts,
    setDraftSaveState,
    setEditingStep,
    showError,
  ]);

  const serverRefinementSignature = activeRefinement
    ? activeStep === "validation" && initiative
      ? JSON.stringify({
          answers: VALIDATION_REFINEMENT_STEPS.reduce<Record<string, string | string[] | boolean>>(
            (accumulator, step) => ({
              ...accumulator,
              ...initiative.workflow.refinements[step].answers
            }),
            {}
          ),
          defaultAnswerQuestionIds: Array.from(
            new Set(
              VALIDATION_REFINEMENT_STEPS.flatMap(
                (step) => initiative.workflow.refinements[step].defaultAnswerQuestionIds
              )
            )
          )
        })
      : JSON.stringify({
          answers: activeRefinement.answers,
          defaultAnswerQuestionIds: activeRefinement.defaultAnswerQuestionIds,
          preferredSurface: activeRefinement.preferredSurface ?? null,
        })
    : "";
  const localRefinementSignature = JSON.stringify({
    answers: refinementAnswers,
    defaultAnswerQuestionIds,
    preferredSurface: activeStep === "validation" ? null : activeSurface ?? null,
  });

  const persistRefinement = useCallback(async (): Promise<boolean> => {
    if (!initiative || !activeRefinement || localRefinementSignature === serverRefinementSignature) {
      return true;
    }

    setRefinementSaveState("saving");
    try {
      if (activeStep === "validation") {
        const nextByStep = partitionValidationAnswersByStep({
          initiative,
          answers: refinementAnswers,
          defaultAnswerQuestionIds
        });

        for (const step of VALIDATION_REFINEMENT_STEPS) {
          const persisted = initiative.workflow.refinements[step];
          const next = nextByStep[step];
          const persistedSignature = JSON.stringify({
            answers: persisted.answers,
            defaultAnswerQuestionIds: persisted.defaultAnswerQuestionIds
          });
          const nextSignature = JSON.stringify(next);
          if (persistedSignature === nextSignature) {
            continue;
          }

          await saveInitiativeRefinement(
            initiative.id,
            step,
            next.answers,
            next.defaultAnswerQuestionIds,
            persisted.preferredSurface ?? null
          );
        }
      } else if (activeSpecStep) {
        const result = await saveInitiativeRefinement(
          initiative.id,
          activeSpecStep,
          refinementAnswers,
          defaultAnswerQuestionIds,
          activeSurface,
        );
        setRefinementAssumptions(result.assumptions);
      }

      await onRefresh();
      setRefinementSaveState("saved");
      return true;
    } catch (error) {
      showError((error as Error).message ?? "We couldn't save your answers.");
      setRefinementSaveState("error");
      return false;
    }
  }, [
    activeRefinement,
    activeSurface,
    activeStep,
    activeSpecStep,
    defaultAnswerQuestionIds,
    initiative,
    localRefinementSignature,
    onRefresh,
    refinementAnswers,
    serverRefinementSignature,
    setRefinementAssumptions,
    setRefinementSaveState,
    showError,
  ]);

  useEffect(() => {
    if (!initiative || !activeSpecStep || !activeRefinement || localRefinementSignature === serverRefinementSignature) {
      if (refinementTimerRef.current !== null) {
        window.clearTimeout(refinementTimerRef.current);
        refinementTimerRef.current = null;
      }
      return;
    }

    refinementTimerRef.current = window.setTimeout(() => {
      refinementTimerRef.current = null;
      void persistRefinement();
    }, 500);

    return () => {
      if (refinementTimerRef.current !== null) {
        window.clearTimeout(refinementTimerRef.current);
        refinementTimerRef.current = null;
      }
    };
  }, [
    activeRefinement,
    activeSpecStep,
    initiative,
    localRefinementSignature,
    persistRefinement,
    serverRefinementSignature,
  ]);

  const flushRefinementPersistence = useCallback(async (): Promise<boolean> => {
    if (refinementTimerRef.current !== null) {
      window.clearTimeout(refinementTimerRef.current);
      refinementTimerRef.current = null;
    }

    return persistRefinement();
  }, [persistRefinement]);

  return {
    flushRefinementPersistence,
  };
};
