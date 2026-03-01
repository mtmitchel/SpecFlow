import type { ArtifactsSnapshot } from "../../types.js";

export const StatusBar = ({ snapshot }: { snapshot: ArtifactsSnapshot }) => {
  const { initiatives, tickets } = snapshot;

  if (initiatives.length === 0) return null;

  const parts = initiatives.slice(0, 3).map((init) => {
    const initTickets = tickets.filter((t) => t.initiativeId === init.id);
    const done = initTickets.filter((t) => t.status === "done").length;
    const blocked = initTickets.filter(
      (t) => t.status !== "done" && (t.blockedBy ?? []).some((bid) => {
        const blocker = tickets.find((b) => b.id === bid);
        return blocker && blocker.status !== "done";
      })
    ).length;
    const failing = initTickets.filter((t) => t.status === "verify").length;

    let text = `${init.title}: ${done}/${initTickets.length} done`;
    if (blocked > 0) text += ` — ${blocked} blocked`;
    if (failing > 0) text += ` — ${failing} in verify`;
    return text;
  });

  return <>{parts.join("  ·  ")}</>;
};
