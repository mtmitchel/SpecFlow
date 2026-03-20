import type { ArtifactsSnapshot, TicketStatus } from "../../types.js";
import { InitiativeView } from "./initiative-view.js";

const noopMoveTicket = async (
  _ticketId: string,
  _status: TicketStatus,
): Promise<void> => undefined;

export const InitiativeRouteView = ({
  snapshot,
  onRefresh,
  onMoveTicket = noopMoveTicket,
}: {
  snapshot: ArtifactsSnapshot;
  onRefresh: () => Promise<void>;
  onMoveTicket?: (ticketId: string, status: TicketStatus) => Promise<void>;
}) => (
  <InitiativeView
    snapshot={snapshot}
    onRefresh={onRefresh}
    onMoveTicket={onMoveTicket}
  />
);
