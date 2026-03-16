import { parse, requestJson } from "./http";
import { parseSseResult } from "./sse";
import type {
  InitiativePlanningQuestion,
  InitiativePlanningStep,
  PlanningReviewArtifact,
  PlanningReviewKind
} from "../types";

type RefinementStep = Extract<InitiativePlanningStep, "brief" | "core-flows" | "prd" | "tech-spec">;

export interface InitiativePhaseCheckResult {
  decision: "proceed" | "ask";
  questions: InitiativePlanningQuestion[];
  assumptions: string[];
}

export const createInitiative = async (
  description: string
): Promise<{ initiativeId: string }> =>
  requestJson("/api/initiatives", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ description })
  });

export const checkInitiativePhase = async (
  initiativeId: string,
  step: RefinementStep
): Promise<InitiativePhaseCheckResult> =>
  requestJson(`/api/initiatives/${initiativeId}/${step}-check`, {
    method: "POST"
  });

export const generateInitiativeBrief = async (
  initiativeId: string
): Promise<{ markdown: string; reviews: PlanningReviewArtifact[] }> => {
  const response = await fetch(`/api/initiatives/${initiativeId}/generate-brief`, {
    method: "POST"
  });

  return parseSseResult(response);
};

export const generateInitiativeCoreFlows = async (
  initiativeId: string
): Promise<{ markdown: string; reviews: PlanningReviewArtifact[] }> => {
  const response = await fetch(`/api/initiatives/${initiativeId}/generate-core-flows`, {
    method: "POST"
  });

  return parseSseResult(response);
};

export const generateInitiativePrd = async (
  initiativeId: string
): Promise<{ markdown: string; reviews: PlanningReviewArtifact[] }> => {
  const response = await fetch(`/api/initiatives/${initiativeId}/generate-prd`, {
    method: "POST"
  });

  return parseSseResult(response);
};

export const generateInitiativeTechSpec = async (
  initiativeId: string
): Promise<{ markdown: string; reviews: PlanningReviewArtifact[] }> => {
  const response = await fetch(`/api/initiatives/${initiativeId}/generate-tech-spec`, {
    method: "POST"
  });

  return parseSseResult(response);
};

export const generateInitiativePlan = async (
  initiativeId: string
): Promise<{
  phases: Array<{
    name: string;
    order: number;
    tickets: Array<{
      title: string;
      description: string;
      acceptanceCriteria: string[];
      fileTargets: string[];
    }>;
  }>;
}> => {
  const response = await fetch(`/api/initiatives/${initiativeId}/generate-plan`, {
    method: "POST"
  });

  return parseSseResult(response);
};

export const updateInitiativePhases = async (
  initiativeId: string,
  phases: Array<{ id: string; name: string; order: number; status: "active" | "complete" }>
): Promise<void> => {
  await parse(
    await fetch(`/api/initiatives/${initiativeId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ phases })
    })
  );
};

export const saveInitiativeRefinement = async (
  initiativeId: string,
  step: RefinementStep,
  answers: Record<string, string | string[] | boolean>,
  defaultAnswerQuestionIds: string[]
): Promise<{ assumptions: string[] }> =>
  requestJson(`/api/initiatives/${initiativeId}/refinement/${step}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ answers, defaultAnswerQuestionIds })
  });

export const requestInitiativeClarificationHelp = async (
  initiativeId: string,
  questionId: string,
  note: string
): Promise<{ guidance: string }> =>
  requestJson(`/api/initiatives/${initiativeId}/refinement/help`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ questionId, note })
  });

export const deleteInitiative = async (initiativeId: string): Promise<void> => {
  const response = await fetch(`/api/initiatives/${initiativeId}`, { method: "DELETE" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? "Failed to delete initiative");
  }
};

export const runInitiativeReview = async (
  initiativeId: string,
  kind: PlanningReviewKind
): Promise<PlanningReviewArtifact> => {
  const response = await fetch(`/api/initiatives/${initiativeId}/reviews/${kind}/run`, {
    method: "POST"
  });

  return parseSseResult(response);
};

export const overrideInitiativeReview = async (
  initiativeId: string,
  kind: PlanningReviewKind,
  reason: string
): Promise<{ review: PlanningReviewArtifact }> =>
  requestJson(`/api/initiatives/${initiativeId}/reviews/${kind}/override`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ reason })
  });

export const saveInitiativeSpecs = async (
  initiativeId: string,
  step: RefinementStep,
  content: string
): Promise<void> => {
  await parse(
    await fetch(`/api/initiatives/${initiativeId}/specs/${step}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ content })
    })
  );
};
