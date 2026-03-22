import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkInitiativePhase,
  continueInitiativeArtifactStep,
  generateInitiativeBrief,
  generateInitiativeCoreFlows,
  generateInitiativePrd,
  generateInitiativeTechSpec
} from "../../../api.js";
import type { InitiativePhaseCheckResult } from "../../../api/initiatives.js";
import { isRequestCancelledError, isRequestTimeoutError } from "../../../api/transport.js";
import type {
  InitiativeArtifactStep,
  InitiativePlanningStep,
  InitiativeRefinementDraft,
} from "../../../types.js";
import { useToast } from "../../context/toast.js";
import type { InitiativePlanningSurface } from "../../utils/initiative-progress.js";

interface PhaseAutoAdvanceConfig {
  initiativeId: string | null;
  navigateToStep: (step: InitiativePlanningStep, surface?: InitiativePlanningSurface | null) => void;
  nextStep: InitiativePlanningStep | null;
  onRefresh: () => Promise<void>;
  onPhaseCheckResult?: (step: InitiativeArtifactStep, result: InitiativePhaseCheckResult) => void;
}

interface AutoAdvanceOptions {
  draft?: InitiativeRefinementDraft;
  navigateOnSuccess?: boolean;
  skipCheck?: boolean;
  phaseCheckTimeoutMs?: number;
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

const runPhaseCheck = async (
  initiativeId: string,
  step: InitiativeArtifactStep,
  signal: AbortSignal,
  options?: Pick<AutoAdvanceOptions, "phaseCheckTimeoutMs">,
): Promise<InitiativePhaseCheckResult> => {
  const requestOptions = {
    signal,
    ...(typeof options?.phaseCheckTimeoutMs === "number"
      ? { timeoutMs: options.phaseCheckTimeoutMs }
      : {}),
  };

  try {
    return await checkInitiativePhase(initiativeId, step, requestOptions);
  } catch (error) {
    if (step !== "brief" || !isRequestTimeoutError(error) || signal.aborted) {
      throw error;
    }

    return checkInitiativePhase(initiativeId, step, requestOptions);
  }
};

const runDraftDrivenAdvance = async (
  initiativeId: string,
  step: InitiativeArtifactStep,
  draft: InitiativeRefinementDraft,
  signal: AbortSignal,
  onPlannerToken: () => void,
): Promise<InitiativePhaseCheckResult> =>
  continueInitiativeArtifactStep(
    initiativeId,
    step,
    { draft },
    {
      signal,
      onPlannerToken: () => {
        onPlannerToken();
      },
    },
  );

export const usePhaseAutoAdvance = ({
  initiativeId,
  navigateToStep,
  nextStep,
  onRefresh,
  onPhaseCheckResult,
}: PhaseAutoAdvanceConfig) => {
  const { showError } = useToast();
  const [autoAdvance, setAutoAdvance] = useState<AutoAdvanceState>(null);
  const [autoAdvanceFailedStep, setAutoAdvanceFailedStep] = useState<InitiativeArtifactStep | null>(null);
  const [autoAdvanceFailedStage, setAutoAdvanceFailedStage] = useState<"check" | "generate" | null>(null);
  const autoAdvanceControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => autoAdvanceControllerRef.current?.abort(), []);

  const refreshSnapshotInBackground = useCallback(() => {
    void onRefresh().catch((error) => {
      if (isRequestCancelledError(error)) {
        return;
      }

      showError((error as Error).message ?? "We couldn't refresh planning.");
    });
  }, [onRefresh, showError]);

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
    const navigateOnSuccess = options.navigateOnSuccess ?? false;
    setAutoAdvanceFailedStep(null);
    setAutoAdvanceFailedStage(null);
    let failedStage: "check" | "generate" = options.skipCheck ? "generate" : "check";

      try {
      if (options.draft) {
        setAutoAdvance({ step, stage: "check" });
        const result = await runDraftDrivenAdvance(
          initiativeId,
          step,
          options.draft,
          controller.signal,
          () => {
            setAutoAdvance((current) =>
              current?.step === step ? { step, stage: "generate" } : current
            );
          }
        );
        onPhaseCheckResult?.(step, result);
        if (result.decision === "ask") {
          refreshSnapshotInBackground();
          return;
        }
        await onRefresh();
        if (controller.signal.aborted) {
          return;
        }
        if (navigateOnSuccess && nextStep) {
          navigateToStep(nextStep);
        } else {
          navigateToStep(step, "review");
        }
      } else {
        if (!options.skipCheck) {
          setAutoAdvance({ step, stage: "check" });
          const result = await runPhaseCheck(initiativeId, step, controller.signal, {
            phaseCheckTimeoutMs: options.phaseCheckTimeoutMs,
          });
          onPhaseCheckResult?.(step, result);
          if (result.decision === "ask") {
            refreshSnapshotInBackground();
            return;
          }
        }

        failedStage = "generate";
        setAutoAdvance({ step, stage: "generate" });
        await runPhaseGeneration(initiativeId, step, controller.signal);
        await onRefresh();
        if (controller.signal.aborted) {
          return;
        }
        if (navigateOnSuccess && nextStep) {
          navigateToStep(nextStep);
        } else {
          navigateToStep(step, "review");
        }
      }
    } catch (error) {
      if (isRequestCancelledError(error)) {
        return;
      }

      setAutoAdvanceFailedStep(step);
      setAutoAdvanceFailedStage(failedStage);
      showError((error as Error).message ?? "We couldn't continue this step.");
    } finally {
      if (autoAdvanceControllerRef.current === controller) {
        autoAdvanceControllerRef.current = null;
        setAutoAdvance(null);
      }
    }
  }, [
    initiativeId,
    navigateToStep,
    nextStep,
    onPhaseCheckResult,
    onRefresh,
    refreshSnapshotInBackground,
    showError,
  ]);

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
