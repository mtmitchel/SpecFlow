import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkInitiativePhase,
  generateInitiativeBrief,
  generateInitiativeCoreFlows,
  generateInitiativePrd,
  generateInitiativeTechSpec
} from "../../../api.js";
import { isRequestCancelledError } from "../../../api/transport.js";
import type { InitiativeArtifactStep, InitiativePlanningStep } from "../../../types.js";
import { useToast } from "../../context/toast.js";
import type { InitiativePlanningSurface } from "../../utils/initiative-progress.js";

interface PhaseAutoAdvanceConfig {
  initiativeId: string | null;
  navigateToStep: (step: InitiativePlanningStep, surface?: InitiativePlanningSurface | null) => void;
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

const runPhaseGeneration = async (
  initiativeId: string,
  step: InitiativeArtifactStep,
  signal: AbortSignal,
): Promise<void> => {
  if (step === "brief") {
    await generateInitiativeBrief(initiativeId, { signal });
    return;
  }

  if (step === "core-flows") {
    await generateInitiativeCoreFlows(initiativeId, { signal });
    return;
  }

  if (step === "prd") {
    await generateInitiativePrd(initiativeId, { signal });
    return;
  }

  await generateInitiativeTechSpec(initiativeId, { signal });
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
  const autoAdvanceControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => autoAdvanceControllerRef.current?.abort(), []);

  const cancelAutoAdvance = useCallback(() => {
    autoAdvanceControllerRef.current?.abort();
    autoAdvanceControllerRef.current = null;
    setAutoAdvance(null);
  }, []);

  const beginAutoAdvance = useCallback(async (step: InitiativeArtifactStep, options: AutoAdvanceOptions = {}) => {
    if (!initiativeId) {
      return;
    }

    const controller = new AbortController();
    autoAdvanceControllerRef.current?.abort();
    autoAdvanceControllerRef.current = controller;
    const navigateOnSuccess = options.navigateOnSuccess ?? step !== "brief";
    setAutoAdvanceFailedStep(null);
    setAutoAdvanceFailedStage(null);
    let failedStage: "check" | "generate" = options.skipCheck ? "generate" : "check";

    try {
      if (!options.skipCheck) {
        setAutoAdvance({ step, stage: "check" });
        const result = await checkInitiativePhase(initiativeId, step, { signal: controller.signal });
        await onRefresh();
        if (result.decision === "ask") {
          return;
        }
      }

      failedStage = "generate";
      setAutoAdvance({ step, stage: "generate" });
      await runPhaseGeneration(initiativeId, step, controller.signal);
      await onRefresh();
      if (navigateOnSuccess && nextStep) {
        navigateToStep(nextStep);
      } else {
        navigateToStep(step, "review");
      }
    } catch (error) {
      if (isRequestCancelledError(error)) {
        return;
      }

      setAutoAdvanceFailedStep(step);
      setAutoAdvanceFailedStage(failedStage);
      showError((error as Error).message ?? "Failed to continue the phase");
    } finally {
      if (autoAdvanceControllerRef.current === controller) {
        autoAdvanceControllerRef.current = null;
        setAutoAdvance(null);
      }
    }
  }, [initiativeId, navigateToStep, nextStep, onRefresh, showError]);

  return {
    autoAdvanceFailedStage,
    autoAdvanceFailedStep,
    autoAdvanceStep: autoAdvance?.step ?? null,
    beginAutoAdvance,
    cancelAutoAdvance,
    isAutoGenerating: autoAdvance?.stage === "generate",
    isAutoPending: autoAdvance !== null
  };
};
