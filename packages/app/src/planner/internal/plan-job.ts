import type {
  Initiative,
  PendingTicketPlanArtifact,
  Ticket,
  TicketCoverageItem
} from "../../types/entities.js";
import { createTicketFromDraft } from "./ticket-factory.js";
import { completeWorkflowStep } from "../workflow-state.js";
import type { PlanResult } from "../types.js";
import { normalizePhaseName } from "./title-style.js";

const uniqueIds = (values: string[]): string[] => Array.from(new Set(values));

export const getPendingTicketPlanId = (initiativeId: string): string =>
  `${initiativeId}:pending-ticket-plan`;

export const buildPendingTicketPlanArtifact = (input: {
  initiativeId: string;
  result: PlanResult;
  coverageItems: TicketCoverageItem[];
  sourceUpdatedAts: Partial<Record<keyof Initiative["workflow"]["steps"], string>>;
  nowIso: string;
}): PendingTicketPlanArtifact => ({
  id: getPendingTicketPlanId(input.initiativeId),
  initiativeId: input.initiativeId,
  phases: input.result.phases,
  coverageItems: input.coverageItems,
  uncoveredItemIds: input.result.uncoveredCoverageItemIds,
  sourceUpdatedAts: input.sourceUpdatedAts,
  generatedAt: input.nowIso,
  updatedAt: input.nowIso
});

export const commitPendingTicketPlanArtifact = async (input: {
  initiative: Initiative;
  pendingPlan: PendingTicketPlanArtifact;
  nowIso: string;
  idGenerator: () => string;
  upsertTicket: (ticket: Ticket) => Promise<void>;
  deleteTicket: (ticketId: string) => Promise<void>;
  getTicket: (ticketId: string) => Ticket | undefined;
  listInitiativeTickets: (initiativeId: string) => Ticket[];
  upsertInitiative: (initiative: Initiative) => Promise<void>;
  deletePendingTicketPlanArtifact: (initiativeId: string) => Promise<void>;
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
}): Promise<void> => {
  const existingTicketIds = Array.from(
    new Set(
      input.initiative.ticketIds.concat(
        input.listInitiativeTickets(input.initiative.id).map((ticket) => ticket.id)
      )
    )
  );
  const phaseIds: Initiative["phases"] = [];
  const createdTicketIds: string[] = [];
  const phaseTicketIds: string[][] = [];

  for (const ticketId of existingTicketIds) {
    await input.deleteTicket(ticketId);
  }

  for (const [phaseIndex, phase] of input.pendingPlan.phases.entries()) {
    const phaseId = `phase-${phaseIndex + 1}-${input.idGenerator()}`;
    phaseIds.push({
      id: phaseId,
      name: normalizePhaseName(phase.name),
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

  const validatedWorkflow = completeWorkflowStep(input.initiative.workflow, "validation", input.nowIso);
  const completedWorkflow = completeWorkflowStep(validatedWorkflow, "tickets", input.nowIso);
  const updatedInitiative: Initiative = {
    ...input.initiative,
    status: "active",
    workflow: completedWorkflow,
    phases: phaseIds,
    ticketIds: createdTicketIds,
    updatedAt: input.nowIso
  };

  await input.upsertInitiative(updatedInitiative);
  await input.upsertTicketCoverageArtifact(
    input.buildTicketCoverageArtifact({
      initiativeId: input.initiative.id,
      items: input.pendingPlan.coverageItems,
      uncoveredItemIds: input.pendingPlan.uncoveredItemIds,
      sourceUpdatedAts: {
        ...input.pendingPlan.sourceUpdatedAts,
        validation: updatedInitiative.workflow.steps.validation.updatedAt ?? input.nowIso,
        tickets: updatedInitiative.workflow.steps.tickets.updatedAt ?? input.nowIso
      },
      nowIso: input.nowIso
    })
  );
  await input.deletePendingTicketPlanArtifact(input.initiative.id);
};
