import type { RunCriterionResult, Ticket } from "../../types/entities.js";

export const mergeCriteria = (ticket: Ticket, raw: RunCriterionResult[]): RunCriterionResult[] => {
  const byId = new Map(raw.map((criterion) => [criterion.criterionId, criterion]));

  return ticket.acceptanceCriteria.map((criterion) => {
    const existing = byId.get(criterion.id);
    if (existing) {
      return existing;
    }

    return {
      criterionId: criterion.id,
      pass: false,
      evidence: "No verifier output for this criterion"
    };
  });
};
