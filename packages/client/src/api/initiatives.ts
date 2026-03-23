import {
  transportRequest,
  transportJsonRequest,
  transportSseRequest,
  type TransportEvent,
  type TransportRequestOptions
} from "./transport";
import type {
  Initiative,
  InitiativeArtifactStepContinuePayload,
  InitiativeArtifactStepContinueResult,
  InitiativePhaseCheckResult,
  InitiativePlanningStep,
  InitiativePlanningSurface,
  InitiativeValidationContinuePayload,
  InitiativeValidationContinueResult,
  PlanningReviewArtifact,
  PlanningReviewKind
} from "../types";

type RefinementStep = Extract<InitiativePlanningStep, "brief" | "core-flows" | "prd" | "tech-spec">;

const LLM_PHASE_CHECK_TIMEOUT_MS = 90_000;
const PLANNING_SAVE_TIMEOUT_MS = 20_000;

const REFINEMENT_STEP_LABELS: Record<RefinementStep, string> = {
  brief: "brief",
  "core-flows": "core flows",
  prd: "PRD",
  "tech-spec": "tech spec"
};

const PHASE_CHECK_TIMEOUT_MS: Record<RefinementStep, number> = {
  brief: 20_000,
  "core-flows": LLM_PHASE_CHECK_TIMEOUT_MS,
  prd: LLM_PHASE_CHECK_TIMEOUT_MS,
  "tech-spec": LLM_PHASE_CHECK_TIMEOUT_MS
};

const PHASE_CHECK_TIMEOUT_LABEL: Record<RefinementStep, string> = {
  brief: "brief questions",
  "core-flows": "core flows questions",
  prd: "PRD questions",
  "tech-spec": "tech spec questions"
};

export type { InitiativePhaseCheckResult } from "../types";

const forwardPlannerToken =
  (onPlannerToken: ((chunk: string) => void) | undefined) =>
  (event: TransportEvent): void => {
    if (!onPlannerToken || event.event !== "planner-token") {
      return;
    }

    const chunk =
      typeof (event.payload as { chunk?: unknown } | undefined)?.chunk === "string"
        ? (event.payload as { chunk: string }).chunk
        : null;
    if (!chunk) {
      return;
    }

    onPlannerToken(chunk);
  };

const forwardPlannerStatus =
  (onPlannerStatus: ((message: string) => void) | undefined) =>
  (event: TransportEvent): void => {
    if (!onPlannerStatus || event.event !== "planner-status") {
      return;
    }

    const message =
      typeof (event.payload as { message?: unknown } | undefined)?.message === "string"
        ? (event.payload as { message: string }).message
        : null;
    if (!message) {
      return;
    }

    onPlannerStatus(message);
  };

const forwardPlannerEvents =
  (options: {
    onPlannerToken?: (chunk: string) => void;
    onPlannerStatus?: (message: string) => void;
  }) =>
  (event: TransportEvent): void => {
    forwardPlannerToken(options.onPlannerToken)(event);
    forwardPlannerStatus(options.onPlannerStatus)(event);
  };

export const createInitiative = async (
  description: string,
  projectRootToken?: string
): Promise<{ initiative: Initiative }> =>
  transportRequest(
    "initiatives.create",
    {
      body: { description, projectRootToken }
    },
    undefined,
    { localMutationApplied: true }
  );

export const updateInitiative = async (
  initiativeId: string,
  payload: Partial<{
    title: string;
    description: string;
    phases: Array<{ id: string; name: string; order: number; status: "active" | "complete" }>;
    resumeTicketId: string | null;
  }>
): Promise<Initiative> => {
  const result = await transportJsonRequest<{ initiative: Initiative }>(
    "initiatives.update",
    { id: initiativeId, body: payload },
    undefined,
    { localMutationApplied: true }
  );
  return result.initiative;
};

export const checkInitiativePhase = async (
  initiativeId: string,
  step: RefinementStep,
  options?: TransportRequestOptions & {
    validationFeedback?: string;
  },
): Promise<InitiativePhaseCheckResult> =>
  transportJsonRequest(
    "initiatives.phaseCheck",
    {
      id: initiativeId,
      step,
      body: options?.validationFeedback
        ? { validationFeedback: options.validationFeedback }
        : undefined,
    },
    undefined,
    {
      ...options,
      timeoutMs: options?.timeoutMs ?? PHASE_CHECK_TIMEOUT_MS[step],
      timeoutMessage:
        options?.timeoutMessage ?? `Checking the ${PHASE_CHECK_TIMEOUT_LABEL[step]} took too long. Try again.`,
    },
  );

export const generateInitiativeBrief = async (
  initiativeId: string,
  options?: TransportRequestOptions,
): Promise<{ markdown: string; reviews: PlanningReviewArtifact[] }> => {
  return transportSseRequest(
    "initiatives.generate.brief",
    { id: initiativeId },
    undefined,
    options,
  );
};

export const generateInitiativeCoreFlows = async (
  initiativeId: string,
  options?: TransportRequestOptions,
): Promise<{ markdown: string; reviews: PlanningReviewArtifact[] }> => {
  return transportSseRequest(
    "initiatives.generate.coreFlows",
    { id: initiativeId },
    undefined,
    options,
  );
};

export const generateInitiativePrd = async (
  initiativeId: string,
  options?: TransportRequestOptions,
): Promise<{ markdown: string; reviews: PlanningReviewArtifact[] }> => {
  return transportSseRequest(
    "initiatives.generate.prd",
    { id: initiativeId },
    undefined,
    options,
  );
};

export const generateInitiativeTechSpec = async (
  initiativeId: string,
  options?: TransportRequestOptions,
): Promise<{ markdown: string; reviews: PlanningReviewArtifact[] }> => {
  return transportSseRequest(
    "initiatives.generate.techSpec",
    { id: initiativeId },
    undefined,
    options,
  );
};

export const generateInitiativePlan = async (
  initiativeId: string,
  options?: TransportRequestOptions & {
    onPlannerToken?: (chunk: string) => void;
    onPlannerStatus?: (message: string) => void;
  },
): Promise<{
  phases: Array<{
    name: string;
    order: number;
    tickets: Array<{
      title: string;
      description: string;
      acceptanceCriteria: string[];
      fileTargets: string[];
      coverageItemIds: string[];
    }>;
  }>;
  uncoveredCoverageItemIds: string[];
}> => {
  return transportSseRequest(
    "initiatives.generatePlan",
    { id: initiativeId },
    forwardPlannerEvents(options ?? {}),
    options,
  );
};

export const updateInitiativePhases = async (
  initiativeId: string,
  phases: Array<{ id: string; name: string; order: number; status: "active" | "complete" }>
): Promise<Initiative> => {
  const result = await transportJsonRequest<{ initiative: Initiative }>(
    "initiatives.update",
    { id: initiativeId, body: { phases } },
    undefined,
    { localMutationApplied: true }
  );
  return result.initiative;
};

export const saveInitiativeRefinement = async (
  initiativeId: string,
  step: RefinementStep,
  answers: Record<string, string | string[] | boolean>,
  defaultAnswerQuestionIds: string[],
  preferredSurface?: InitiativePlanningSurface | null,
  options?: TransportRequestOptions,
): Promise<{ assumptions: string[] }> =>
  transportJsonRequest(
    "initiatives.refinement.save",
    { id: initiativeId, step, body: { answers, defaultAnswerQuestionIds, preferredSurface } },
    undefined,
    {
      ...options,
      timeoutMs: PLANNING_SAVE_TIMEOUT_MS,
      timeoutMessage: `Saving your ${REFINEMENT_STEP_LABELS[step]} answers took too long. Try again.`
    }
  );

export const continueInitiativeArtifactStep = async (
  initiativeId: string,
  step: RefinementStep,
  body: InitiativeArtifactStepContinuePayload,
  options?: TransportRequestOptions & {
    onPlannerToken?: (chunk: string) => void;
  },
): Promise<InitiativeArtifactStepContinueResult> =>
  transportSseRequest(
    "initiatives.continueArtifactStep",
    { id: initiativeId, step, body },
    forwardPlannerEvents({ onPlannerToken: options?.onPlannerToken }),
    options,
  );

export const continueInitiativeValidation = async (
  initiativeId: string,
  body: InitiativeValidationContinuePayload,
  options?: TransportRequestOptions & {
    onPlannerToken?: (chunk: string) => void;
    onPlannerStatus?: (message: string) => void;
  },
): Promise<InitiativeValidationContinueResult> =>
  transportSseRequest(
    "initiatives.continueValidation",
    { id: initiativeId, body },
    forwardPlannerEvents({
      onPlannerToken: options?.onPlannerToken,
      onPlannerStatus: options?.onPlannerStatus,
    }),
    options,
  );

export const requestInitiativeClarificationHelp = async (
  initiativeId: string,
  questionId: string,
  note: string,
  options?: TransportRequestOptions,
): Promise<{ guidance: string }> =>
  transportJsonRequest(
    "initiatives.refinement.help",
    { id: initiativeId, body: { questionId, note } },
    undefined,
    options,
  );

export const deleteInitiative = async (initiativeId: string): Promise<void> => {
  await transportRequest(
    "initiatives.delete",
    { id: initiativeId },
    undefined,
    { localMutationApplied: true }
  );
};

export const runInitiativeReview = async (
  initiativeId: string,
  kind: PlanningReviewKind,
  options?: TransportRequestOptions,
): Promise<PlanningReviewArtifact> => {
  return transportSseRequest(
    "initiatives.review.run",
    { id: initiativeId, kind },
    undefined,
    options,
  );
};

export const overrideInitiativeReview = async (
  initiativeId: string,
  kind: PlanningReviewKind,
  reason: string
): Promise<{ review: PlanningReviewArtifact }> =>
  transportJsonRequest(
    "initiatives.review.override",
    { id: initiativeId, kind, body: { reason } }
  );

export const saveInitiativeSpecs = async (
  initiativeId: string,
  step: RefinementStep,
  content: string
): Promise<void> => {
  await transportJsonRequest(
    "initiatives.spec.save",
    { id: initiativeId, type: step, body: { content } },
    undefined,
    {
      timeoutMs: PLANNING_SAVE_TIMEOUT_MS,
      timeoutMessage: `Saving the ${REFINEMENT_STEP_LABELS[step]} draft took too long. Try again.`
    }
  );
};
