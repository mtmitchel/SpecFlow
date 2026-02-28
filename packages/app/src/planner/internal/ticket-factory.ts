import type { Ticket } from "../../types/entities.js";
import type { TriageTicketDraft } from "../types.js";

export type PlannerTicketDraft =
  | TriageTicketDraft
  | { title: string; description: string; acceptanceCriteria: string[]; fileTargets: string[] };

export const deriveInitiativeTitle = (description: string): string => {
  const compact = description.trim().replace(/\s+/g, " ");
  if (!compact) {
    return "Untitled Initiative";
  }

  return compact.length > 64 ? `${compact.slice(0, 61)}...` : compact;
};

const hasImplementationPlan = (draft: PlannerTicketDraft): draft is TriageTicketDraft => {
  return "implementationPlan" in draft && typeof draft.implementationPlan === "string";
};

export const createTicketFromDraft = (input: {
  initiativeId: string | null;
  phaseId: string | null;
  status: Ticket["status"];
  draft?: PlannerTicketDraft;
  nowIso: string;
  idGenerator: () => string;
}): Ticket => {
  const title = input.draft?.title?.trim() || "Quick Task";
  const description = input.draft?.description?.trim() || title;
  const acceptanceCriteria =
    input.draft?.acceptanceCriteria?.map((text, index) => ({
      id: `criterion-${index + 1}`,
      text
    })) ?? [];

  const implementationPlan =
    input.draft && hasImplementationPlan(input.draft) ? input.draft.implementationPlan : "";

  return {
    id: `ticket-${input.idGenerator()}`,
    initiativeId: input.initiativeId,
    phaseId: input.phaseId,
    title,
    description,
    status: input.status,
    acceptanceCriteria,
    implementationPlan,
    fileTargets: input.draft?.fileTargets ?? [],
    runId: null,
    createdAt: input.nowIso,
    updatedAt: input.nowIso
  };
};
