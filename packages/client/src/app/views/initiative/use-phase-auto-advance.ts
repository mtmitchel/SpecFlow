import { useCallback, useState } from "react";
import {
  checkInitiativePhase,
  generateInitiativeBrief,
  generateInitiativeCoreFlows,
  generateInitiativePrd,
  generateInitiativeTechSpec
} from "../../../api.js";
import type { InitiativeArtifactStep, InitiativePlanningStep } from "../../../types.js";
import { useToast } from "../../context/toast.js";

interface PhaseAutoAdvanceConfig {
  initiativeId: string | null;
  navigateToStep: (step: InitiativePlanningStep) => void;
  nextStep: InitiativePlanningStep | null;
  onRefresh: () => Promise<void>;
}

interface AutoAdvanceOptions {
  navigateOnSuccess?: boolean;
  skipCheck?: boolean;
}

type AutoAdvanceState = {
  stage: "check" | "generate";
  step: InitiativeArtifactStep;
} | null;

const runPhaseGeneration = async (initiativeId: string, step: InitiativeArtifactStep): Promise<void> => {
  if (step === "brief") {
    await generateInitiativeBrief(initiativeId);
    return;
  }

  if (step === "core-flows") {
    await generateInitiativeCoreFlows(initiativeId);
    return;
  }

  if (step === "prd") {
    await generateInitiativePrd(initiativeId);
    return;
  }

  await generateInitiativeTechSpec(initiativeId);
};

export const usePhaseAutoAdvance = ({
  initiativeId,
  navigateToStep,
  nextStep,
  onRefresh
}: PhaseAutoAdvanceConfig) => {
  const { showError } = useToast();
  const [autoAdvance, setAutoAdvance] = useState<AutoAdvanceState>(null);
  const [autoAdvanceFailedStep, setAutoAdvanceFailedStep] = useState<InitiativeArtifactStep | null>(null);
  const [autoAdvanceFailedStage, setAutoAdvanceFailedStage] = useState<"check" | "generate" | null>(null);

  const beginAutoAdvance = useCallback(async (step: InitiativeArtifactStep, options: AutoAdvanceOptions = {}) => {
    if (!initiativeId) {
      return;
    }

    const navigateOnSuccess = options.navigateOnSuccess ?? step !== "brief";
    setAutoAdvanceFailedStep(null);
    setAutoAdvanceFailedStage(null);
    let failedStage: "check" | "generate" = options.skipCheck ? "generate" : "check";

    try {
      if (!options.skipCheck) {
        setAutoAdvance({ step, stage: "check" });
        const result = await checkInitiativePhase(initiativeId, step);
        await onRefresh();
        if (result.decision === "ask") {
          return;
        }
      }

      failedStage = "generate";
      setAutoAdvance({ step, stage: "generate" });
      await runPhaseGeneration(initiativeId, step);
      await onRefresh();
      if (navigateOnSuccess && nextStep) {
        navigateToStep(nextStep);
      }
    } catch (error) {
      setAutoAdvanceFailedStep(step);
      setAutoAdvanceFailedStage(failedStage);
      showError((error as Error).message ?? "Failed to continue the phase");
    } finally {
      setAutoAdvance(null);
    }
  }, [initiativeId, navigateToStep, nextStep, onRefresh, showError]);

  return {
    autoAdvanceFailedStage,
    autoAdvanceFailedStep,
    autoAdvanceStep: autoAdvance?.step ?? null,
    beginAutoAdvance,
    isAutoGenerating: autoAdvance?.stage === "generate",
    isAutoPending: autoAdvance !== null
  };
};
