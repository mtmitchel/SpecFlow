import type { ClarifyResult, PlanResult, SpecGenResult, TriageResult } from "../types.js";

export const validateClarifyResult = (result: ClarifyResult): void => {
  if (!Array.isArray(result.questions)) {
    throw new Error("Clarify result missing questions array");
  }
};

export const validateSpecGenResult = (result: SpecGenResult): void => {
  if (!result.briefMarkdown || !result.prdMarkdown || !result.techSpecMarkdown) {
    throw new Error("Spec-gen result must include brief, PRD, and tech spec markdown");
  }
};

export const validatePlanResult = (result: PlanResult): void => {
  if (!Array.isArray(result.phases)) {
    throw new Error("Plan result missing phases array");
  }
};

export const validateTriageResult = (result: TriageResult): void => {
  const decision = result.decision?.toLowerCase();
  if (decision !== "ok" && decision !== "too-large") {
    throw new Error(`Triage result decision must be 'ok' or 'too-large', received '${result.decision}'`);
  }

  if (decision === "ok" && !result.ticketDraft) {
    throw new Error("Triage result for decision 'ok' must include ticketDraft");
  }
};
