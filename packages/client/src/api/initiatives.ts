import { parse } from "./http";
import { parseSseResult } from "./sse";

export const createInitiative = async (
  description: string
): Promise<{ initiativeId: string; questions: Array<{ id: string; label: string; type: string; options?: string[] }> }> => {
  const response = await fetch("/api/initiatives", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ description })
  });

  return parseSseResult(response);
};

export const generateInitiativeSpecs = async (
  initiativeId: string,
  answers: Record<string, string | string[] | boolean>
): Promise<{ briefMarkdown: string; prdMarkdown: string; techSpecMarkdown: string }> => {
  const response = await fetch(`/api/initiatives/${initiativeId}/generate-specs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ answers })
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

export const saveInitiativeSpecs = async (
  initiativeId: string,
  payload: { briefMarkdown: string; prdMarkdown: string; techSpecMarkdown: string }
): Promise<void> => {
  await parse(
    await fetch(`/api/initiatives/${initiativeId}/specs`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })
  );
};
