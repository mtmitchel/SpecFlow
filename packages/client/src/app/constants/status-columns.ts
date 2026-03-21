import type { TicketStatus } from "../../types";

export const statusColumns: Array<{ key: TicketStatus; label: string }> = [
  { key: "backlog", label: "Backlog" },
  { key: "ready", label: "Up next" },
  { key: "in-progress", label: "In progress" },
  { key: "verify", label: "Needs attention" },
  { key: "done", label: "Done" }
];

export const canTransition = (from: TicketStatus, to: TicketStatus): boolean => {
  return from !== to;
};
