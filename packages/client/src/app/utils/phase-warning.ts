import type { Initiative, Ticket } from "../../types";

export const findPhaseWarning = (
  ticket: Ticket,
  initiatives: Initiative[],
  tickets: Ticket[]
): { hasWarning: boolean; message: string } => {
  if (!ticket.initiativeId || !ticket.phaseId) {
    return { hasWarning: false, message: "" };
  }

  const initiative = initiatives.find((item) => item.id === ticket.initiativeId);
  if (!initiative) {
    return { hasWarning: false, message: "" };
  }

  const currentPhase = initiative.phases.find((phase) => phase.id === ticket.phaseId);
  if (!currentPhase) {
    return { hasWarning: false, message: "" };
  }

  const predecessorPhases = initiative.phases.filter((phase) => phase.order < currentPhase.order);
  for (const predecessor of predecessorPhases) {
    const predecessorTickets = tickets.filter(
      (item) => item.initiativeId === initiative.id && item.phaseId === predecessor.id
    );

    if (predecessorTickets.some((item) => item.status !== "done")) {
      return {
        hasWarning: true,
        message: `Phase warning: ${currentPhase.name} started before ${predecessor.name} completed.`
      };
    }
  }

  return { hasWarning: false, message: "" };
};
