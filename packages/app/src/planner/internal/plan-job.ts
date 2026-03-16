import type {
  Initiative,
  PlanningReviewArtifact,
  Ticket,
  TicketCoverageItem
} from "../../types/entities.js";
import { createTicketFromDraft } from "./ticket-factory.js";
import { completeWorkflowStep } from "../workflow-state.js";
import type { PlanResult } from "../types.js";

const uniqueIds = (values: string[]): string[] => Array.from(new Set(values));

export const persistPlanArtifacts = async (input: {
  initiative: Initiative;
  result: PlanResult;
  nowIso: string;
  idGenerator: () => string;
  upsertTicket: (ticket: Ticket) => Promise<void>;
  getTicket: (ticketId: string) => Ticket | undefined;
  upsertInitiative: (initiative: Initiative) => Promise<void>;
  upsertTicketCoverageArtifact: (artifact: {
    id: string;
    initiativeId: string;
    items: TicketCoverageItem[];
    uncoveredItemIds: string[];
    sourceUpdatedAts: Partial<Record<keyof Initiative["workflow"]["steps"], string>>;
    generatedAt: string;
    updatedAt: string;
  }) => Promise<void>;
  buildTicketCoverageArtifact: (input: {
    initiativeId: string;
    items: TicketCoverageItem[];
    uncoveredItemIds: string[];
    sourceUpdatedAts: Partial<Record<keyof Initiative["workflow"]["steps"], string>>;
    nowIso: string;
  }) => {
    id: string;
    initiativeId: string;
    items: TicketCoverageItem[];
    uncoveredItemIds: string[];
    sourceUpdatedAts: Partial<Record<keyof Initiative["workflow"]["steps"], string>>;
    generatedAt: string;
    updatedAt: string;
  };
  coverageItems: TicketCoverageItem[];
  coverageSourceUpdatedAts: Partial<Record<keyof Initiative["workflow"]["steps"], string>>;
  executeCoverageReview: (initiative: Initiative) => Promise<PlanningReviewArtifact>;
  upsertPlanningReview: (review: PlanningReviewArtifact) => Promise<void>;
}): Promise<void> => {
  const phaseIds: Initiative["phases"] = [];
  const createdTicketIds: string[] = [];
  const phaseTicketIds: string[][] = [];

  for (const [phaseIndex, phase] of input.result.phases.entries()) {
    const phaseId = `phase-${phaseIndex + 1}-${input.idGenerator()}`;
    phaseIds.push({
      id: phaseId,
      name: phase.name,
      order: phase.order,
      status: "active"
    });

    const idsInPhase: string[] = [];
    for (const draft of phase.tickets) {
      const ticket = createTicketFromDraft({
        initiativeId: input.initiative.id,
        phaseId,
        status: "backlog",
        draft,
        nowIso: input.nowIso,
        idGenerator: input.idGenerator
      });

      await input.upsertTicket(ticket);
      createdTicketIds.push(ticket.id);
      idsInPhase.push(ticket.id);
    }

    phaseTicketIds.push(idsInPhase);
  }

  for (let index = 1; index < phaseTicketIds.length; index += 1) {
    const previousIds = phaseTicketIds[index - 1];
    const currentIds = phaseTicketIds[index];

    for (const id of currentIds) {
      const ticket = input.getTicket(id);
      if (ticket) {
        await input.upsertTicket({ ...ticket, blockedBy: previousIds });
      }
    }

    for (const id of previousIds) {
      const ticket = input.getTicket(id);
      if (ticket) {
        await input.upsertTicket({ ...ticket, blocks: uniqueIds([...ticket.blocks, ...currentIds]) });
      }
    }
  }

  const updatedInitiative: Initiative = {
    ...input.initiative,
    status: "active",
    workflow: completeWorkflowStep(input.initiative.workflow, "tickets", input.nowIso),
    phases: phaseIds,
    ticketIds: uniqueIds([...input.initiative.ticketIds, ...createdTicketIds]),
    updatedAt: input.nowIso
  };

  await input.upsertInitiative(updatedInitiative);
  await input.upsertTicketCoverageArtifact(
    input.buildTicketCoverageArtifact({
      initiativeId: input.initiative.id,
      items: input.coverageItems,
      uncoveredItemIds: input.result.uncoveredCoverageItemIds,
      sourceUpdatedAts: {
        ...input.coverageSourceUpdatedAts,
        tickets: updatedInitiative.workflow.steps.tickets.updatedAt ?? input.nowIso
      },
      nowIso: input.nowIso
    })
  );
  await input.upsertPlanningReview(await input.executeCoverageReview(updatedInitiative));
};
