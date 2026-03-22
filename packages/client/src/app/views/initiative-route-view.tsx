import type { ArtifactsSnapshot, TicketStatus } from "../../types.js";
import { InitiativeView } from "./initiative-view.js";
import { noopApplySnapshotUpdate, type ApplySnapshotUpdate } from "../utils/snapshot-updates.js";

const noopMoveTicket = async (
  _ticketId: string,
  _status: TicketStatus,
): Promise<void> => undefined;

export const InitiativeRouteView = ({
  snapshot,
  onRefresh,
  onApplySnapshotUpdate = noopApplySnapshotUpdate,
  onMoveTicket = noopMoveTicket,
}: {
  snapshot: ArtifactsSnapshot;
  onRefresh: () => Promise<void>;
  onApplySnapshotUpdate?: ApplySnapshotUpdate;
  onMoveTicket?: (ticketId: string, status: TicketStatus) => Promise<void>;
}) => (
  <InitiativeView
    snapshot={snapshot}
    onRefresh={onRefresh}
    onApplySnapshotUpdate={onApplySnapshotUpdate}
    onMoveTicket={onMoveTicket}
  />
);
