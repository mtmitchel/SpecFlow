import { parse, requestJson } from "./http";
import { parseSseResult } from "./sse";
import { transportRequest, type TransportRequestOptions } from "./transport";
import type {
  InitiativePlanningQuestion,
  InitiativePlanningStep,
  InitiativePlanningSurface,
  PlanningReviewArtifact,
  PlanningReviewKind
} from "../types";

type RefinementStep = Extract<InitiativePlanningStep, "brief" | "core-flows" | "prd" | "tech-spec">;

const LLM_PHASE_CHECK_TIMEOUT_MS = 90_000;

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

export interface InitiativePhaseCheckResult {
  decision: "proceed" | "ask";
  questions: InitiativePlanningQuestion[];
  assumptions: string[];
}

export const createInitiative = async (
  description: string
): Promise<{ initiativeId: string }> =>
  transportRequest(
    "initiatives.create",
    { body: { description } },
    () =>
      requestJson("/api/initiatives", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ description })
      })
  );

export const updateInitiative = async (
  initiativeId: string,
  payload: Partial<{
    title: string;
    description: string;
    phases: Array<{ id: string; name: string; order: number; status: "active" | "complete" }>;
    resumeTicketId: string | null;
  }>
): Promise<void> => {
  await transportRequest(
    "initiatives.update",
    { id: initiativeId, body: payload },
    async () =>
      parse(
        await fetch(`/api/initiatives/${initiativeId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        })
      )
  );
};

export const checkInitiativePhase = async (
  initiativeId: string,
  step: RefinementStep,
  options?: TransportRequestOptions,
): Promise<InitiativePhaseCheckResult> =>
  transportRequest(
    "initiatives.phaseCheck",
    { id: initiativeId, step },
    (signal) =>
      requestJson(`/api/initiatives/${initiativeId}/${step}-check`, {
        method: "POST",
        signal,
      }),
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
  return transportRequest(
    "initiatives.generate.brief",
    { id: initiativeId },
    async (signal) => {
      const response = await fetch(`/api/initiatives/${initiativeId}/generate-brief`, {
        method: "POST",
        signal,
      });

      return parseSseResult(response);
    },
    undefined,
    options,
  );
};

export const generateInitiativeCoreFlows = async (
  initiativeId: string,
  options?: TransportRequestOptions,
): Promise<{ markdown: string; reviews: PlanningReviewArtifact[] }> => {
  return transportRequest(
    "initiatives.generate.coreFlows",
    { id: initiativeId },
    async (signal) => {
      const response = await fetch(`/api/initiatives/${initiativeId}/generate-core-flows`, {
        method: "POST",
        signal,
      });

      return parseSseResult(response);
    },
    undefined,
    options,
  );
};

export const generateInitiativePrd = async (
  initiativeId: string,
  options?: TransportRequestOptions,
): Promise<{ markdown: string; reviews: PlanningReviewArtifact[] }> => {
  return transportRequest(
    "initiatives.generate.prd",
    { id: initiativeId },
    async (signal) => {
      const response = await fetch(`/api/initiatives/${initiativeId}/generate-prd`, {
        method: "POST",
        signal,
      });

      return parseSseResult(response);
    },
    undefined,
    options,
  );
};

export const generateInitiativeTechSpec = async (
  initiativeId: string,
  options?: TransportRequestOptions,
): Promise<{ markdown: string; reviews: PlanningReviewArtifact[] }> => {
  return transportRequest(
    "initiatives.generate.techSpec",
    { id: initiativeId },
    async (signal) => {
      const response = await fetch(`/api/initiatives/${initiativeId}/generate-tech-spec`, {
        method: "POST",
        signal,
      });

      return parseSseResult(response);
    },
    undefined,
    options,
  );
};

export const generateInitiativePlan = async (
  initiativeId: string,
  options?: TransportRequestOptions,
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
  return transportRequest(
    "initiatives.generatePlan",
    { id: initiativeId },
    async (signal) => {
      const response = await fetch(`/api/initiatives/${initiativeId}/generate-plan`, {
        method: "POST",
        signal,
      });

      return parseSseResult(response);
    },
    undefined,
    options,
  );
};

export const updateInitiativePhases = async (
  initiativeId: string,
  phases: Array<{ id: string; name: string; order: number; status: "active" | "complete" }>
): Promise<void> => {
  await transportRequest(
    "initiatives.update",
    { id: initiativeId, body: { phases } },
    async () =>
      parse(
        await fetch(`/api/initiatives/${initiativeId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ phases })
        })
      )
  );
};

export const saveInitiativeRefinement = async (
  initiativeId: string,
  step: RefinementStep,
  answers: Record<string, string | string[] | boolean>,
  defaultAnswerQuestionIds: string[],
  preferredSurface?: InitiativePlanningSurface | null,
): Promise<{ assumptions: string[] }> =>
  transportRequest(
    "initiatives.refinement.save",
    { id: initiativeId, step, body: { answers, defaultAnswerQuestionIds, preferredSurface } },
    () =>
      requestJson(`/api/initiatives/${initiativeId}/refinement/${step}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ answers, defaultAnswerQuestionIds, preferredSurface })
      })
  );

export const requestInitiativeClarificationHelp = async (
  initiativeId: string,
  questionId: string,
  note: string,
  options?: TransportRequestOptions,
): Promise<{ guidance: string }> =>
  transportRequest(
    "initiatives.refinement.help",
    { id: initiativeId, body: { questionId, note } },
    (signal) =>
      requestJson(`/api/initiatives/${initiativeId}/refinement/help`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ questionId, note }),
        signal,
      }),
    undefined,
    options,
  );

export const deleteInitiative = async (initiativeId: string): Promise<void> => {
  await transportRequest(
    "initiatives.delete",
    { id: initiativeId },
    async () => {
      const response = await fetch(`/api/initiatives/${initiativeId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? "Failed to delete initiative");
      }
    }
  );
};

export const runInitiativeReview = async (
  initiativeId: string,
  kind: PlanningReviewKind,
  options?: TransportRequestOptions,
): Promise<PlanningReviewArtifact> => {
  return transportRequest(
    "initiatives.review.run",
    { id: initiativeId, kind },
    async (signal) => {
      const response = await fetch(`/api/initiatives/${initiativeId}/reviews/${kind}/run`, {
        method: "POST",
        signal,
      });

      return parseSseResult(response);
    },
    undefined,
    options,
  );
};

export const overrideInitiativeReview = async (
  initiativeId: string,
  kind: PlanningReviewKind,
  reason: string
): Promise<{ review: PlanningReviewArtifact }> =>
  transportRequest(
    "initiatives.review.override",
    { id: initiativeId, kind, body: { reason } },
    () =>
      requestJson(`/api/initiatives/${initiativeId}/reviews/${kind}/override`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ reason })
      })
  );

export const saveInitiativeSpecs = async (
  initiativeId: string,
  step: RefinementStep,
  content: string
): Promise<void> => {
  await transportRequest(
    "initiatives.spec.save",
    { id: initiativeId, type: step, body: { content } },
    async () =>
      parse(
        await fetch(`/api/initiatives/${initiativeId}/specs/${step}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ content })
        })
      )
  );
};
