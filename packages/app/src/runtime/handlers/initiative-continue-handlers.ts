import type {
  InitiativeArtifactStepContinuePayload,
  InitiativeArtifactStepContinueResult,
  InitiativeValidationContinuePayload,
  InitiativeValidationContinueResult,
  ValidationFeedbackByStep,
} from "../../types/contracts.js";
import type { ProgressSink, SpecFlowRuntime } from "../types.js";
import { badRequest } from "../errors.js";
import { readInitiative } from "./shared.js";
import {
  generateInitiativeArtifact,
  generateInitiativePlan,
  runInitiativePhaseCheck,
  saveInitiativeRefinement,
} from "./initiative-handlers.js";

type ArtifactStep = "brief" | "core-flows" | "prd" | "tech-spec";

const SPEC_STEP_TYPES: ArtifactStep[] = ["brief", "core-flows", "prd", "tech-spec"];

const getValidationFeedbackSteps = (
  feedbackByStep: ValidationFeedbackByStep | undefined
): ArtifactStep[] =>
  SPEC_STEP_TYPES.filter((step) => {
    const feedback = feedbackByStep?.[step];
    return typeof feedback === "string" && feedback.trim().length > 0;
  });

const getValidationFeedbackForStep = (
  step: ArtifactStep,
  feedbackByStep: ValidationFeedbackByStep | undefined,
  fallbackFeedback?: string | null
): string | undefined => {
  if (getValidationFeedbackSteps(feedbackByStep).length > 0) {
    const scopedFeedback = feedbackByStep?.[step];
    return typeof scopedFeedback === "string" && scopedFeedback.trim().length > 0
      ? scopedFeedback.trim()
      : undefined;
  }

  const trimmedFallback = fallbackFeedback?.trim();
  return trimmedFallback && trimmedFallback.length > 0 ? trimmedFallback : undefined;
};

export const continueInitiativeArtifactStep = async (
  runtime: SpecFlowRuntime,
  initiativeId: string,
  step: string,
  body: InitiativeArtifactStepContinuePayload,
  onToken?: ProgressSink,
  signal?: AbortSignal
): Promise<InitiativeArtifactStepContinueResult> => {
  if (!SPEC_STEP_TYPES.includes(step as ArtifactStep)) {
    throw badRequest("Unsupported refinement step");
  }

  const artifactStep = step as ArtifactStep;
  await saveInitiativeRefinement(runtime, initiativeId, artifactStep, body.draft);

  const result = await runInitiativePhaseCheck(
    runtime,
    initiativeId,
    artifactStep,
    undefined,
    signal
  );
  if (result.decision === "ask") {
    return {
      ...result,
      generated: false,
    };
  }

  const generated = await generateInitiativeArtifact(
    runtime,
    initiativeId,
    artifactStep,
    onToken,
    signal
  );

  return {
    ...result,
    generated: true,
    markdown: generated.markdown,
    reviews: generated.reviews,
  };
};

export const continueInitiativeValidation = async (
  runtime: SpecFlowRuntime,
  initiativeId: string,
  body: InitiativeValidationContinuePayload,
  onToken?: ProgressSink,
  signal?: AbortSignal,
  onStatus?: (message: string) => Promise<void> | void
): Promise<InitiativeValidationContinueResult> => {
  for (const step of SPEC_STEP_TYPES) {
    const draft = body.draftByStep?.[step];
    if (!draft) {
      continue;
    }

    const initiative = readInitiative(runtime, initiativeId);
    await saveInitiativeRefinement(runtime, initiativeId, step, {
      answers: draft.answers,
      defaultAnswerQuestionIds: draft.defaultAnswerQuestionIds,
      preferredSurface:
        draft.preferredSurface ?? initiative.workflow.refinements[step].preferredSurface ?? null,
    });
  }

  const feedbackByStep = body.validationFeedbackByStep;
  const scopedSteps = getValidationFeedbackSteps(feedbackByStep);
  const stepsToCheck = scopedSteps.length > 0 ? scopedSteps : SPEC_STEP_TYPES;
  const blockedSteps: ArtifactStep[] = [];

  for (const step of stepsToCheck) {
    const result = await runInitiativePhaseCheck(
      runtime,
      initiativeId,
      step,
      {
        validationFeedback: getValidationFeedbackForStep(
          step,
          feedbackByStep,
          body.validationFeedback
        ),
      },
      signal
    );

    if (result.decision === "ask") {
      blockedSteps.push(step);
    }
  }

  if (blockedSteps.length > 0) {
    return {
      decision: "ask",
      generated: false,
      blockedSteps,
    };
  }

  const plan = await generateInitiativePlan(
    runtime,
    initiativeId,
    onToken,
    signal,
    onStatus
  );
  return {
    decision: "proceed",
    generated: true,
    blockedSteps: [],
    phases: plan.phases,
    uncoveredCoverageItemIds: plan.uncoveredCoverageItemIds,
  };
};
