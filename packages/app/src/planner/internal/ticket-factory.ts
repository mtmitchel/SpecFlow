import type { Ticket } from "../../types/entities.js";
import type { TriageTicketDraft } from "../types.js";
import {
  normalizeTicketTitle,
} from "./title-style.js";

export type PlannerTicketDraft =
  | TriageTicketDraft
  | { title: string; description: string; acceptanceCriteria: string[]; fileTargets: string[]; coverageItemIds?: string[] };

export { deriveInitiativeTitle } from "./title-style.js";

const hasImplementationPlan = (draft: PlannerTicketDraft): draft is TriageTicketDraft => {
  return "implementationPlan" in draft && typeof draft.implementationPlan === "string";
};

const hasCoverageItemIds = (
  draft: PlannerTicketDraft | undefined
): draft is PlannerTicketDraft & { coverageItemIds: string[] } =>
  Boolean(draft && "coverageItemIds" in draft && Array.isArray(draft.coverageItemIds));

export const createTicketFromDraft = (input: {
  initiativeId: string | null;
  phaseId: string | null;
  status: Ticket["status"];
  draft?: PlannerTicketDraft;
  nowIso: string;
  idGenerator: () => string;
}): Ticket => {
  const title = normalizeTicketTitle(input.draft?.title?.trim() || "Quick task");
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
    coverageItemIds: hasCoverageItemIds(input.draft) ? input.draft.coverageItemIds : [],
    blockedBy: [],
    blocks: [],
    runId: null,
    createdAt: input.nowIso,
    updatedAt: input.nowIso
  };
};
