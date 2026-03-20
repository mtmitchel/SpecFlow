import type { TicketStatus } from "../../types";

export const statusColumns: Array<{ key: TicketStatus; label: string }> = [
  { key: "backlog", label: "Backlog" },
  { key: "ready", label: "Ready" },
  { key: "in-progress", label: "In progress" },
  { key: "verify", label: "Verify" },
  { key: "done", label: "Done" }
];

export const canTransition = (from: TicketStatus, to: TicketStatus): boolean => {
  const transitions: Record<TicketStatus, TicketStatus[]> = {
    backlog: ["ready"],
    ready: ["backlog", "in-progress"],
    "in-progress": ["ready", "verify"],
    verify: ["in-progress", "done"],
    done: ["verify"]
  };

  return transitions[from].includes(to);
};
