import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { saveInitiativeRefinement, saveInitiativeSpecs } from "../../../api.js";
import type { Initiative, InitiativePlanningSurface, InitiativeRefinementState } from "../../../types.js";
import { INITIATIVE_WORKFLOW_LABELS } from "../../utils/initiative-workflow.js";
import type { PlanningDrawerState, SaveState, SpecStep } from "./shared.js";

interface InitiativePlanningPersistenceConfig {
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
    ? JSON.stringify({
        answers: activeRefinement.answers,
        defaultAnswerQuestionIds: activeRefinement.defaultAnswerQuestionIds,
        preferredSurface: activeRefinement.preferredSurface ?? null,
      })
    : "";
  const localRefinementSignature = JSON.stringify({
    answers: refinementAnswers,
    defaultAnswerQuestionIds,
    preferredSurface: activeSurface ?? null,
  });

  const persistRefinement = useCallback(async (): Promise<boolean> => {
    if (!initiative || !activeSpecStep || !activeRefinement || localRefinementSignature === serverRefinementSignature) {
      return true;
    }

    setRefinementSaveState("saving");
    try {
      const result = await saveInitiativeRefinement(
        initiative.id,
        activeSpecStep,
        refinementAnswers,
        defaultAnswerQuestionIds,
        activeSurface,
      );
      setRefinementAssumptions(result.assumptions);
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
