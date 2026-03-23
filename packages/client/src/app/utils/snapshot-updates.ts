import type { ArtifactsSnapshot, Config, Initiative, Ticket } from "../../types.js";

export type ApplySnapshotUpdate = (
  update: (snapshot: ArtifactsSnapshot) => ArtifactsSnapshot,
) => void;

export const noopApplySnapshotUpdate: ApplySnapshotUpdate = () => undefined;

const nextSnapshotMeta = (snapshot: ArtifactsSnapshot): ArtifactsSnapshot["meta"] => {
  const current = snapshot.meta ?? {
    revision: 0,
    generatedAt: new Date(0).toISOString(),
    generationTimeMs: 0,
    payloadBytes: 0,
    reloadIssues: [],
  };

  return {
    ...current,
    revision: current.revision + 1,
    generatedAt: new Date().toISOString(),
  };
};

const upsertById = <T extends { id: string }>(items: T[], nextItem: T): T[] => {
  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index === -1) {
    return [...items, nextItem];
  }

  return items.map((item, itemIndex) => (itemIndex === index ? nextItem : item));
};

const removeById = <T extends { id: string }>(items: T[], id: string): T[] =>
  items.filter((item) => item.id !== id);

export const applyConfigUpdate = (
  snapshot: ArtifactsSnapshot,
  config: Config | null,
): ArtifactsSnapshot => ({
  ...snapshot,
  meta: nextSnapshotMeta(snapshot),
  config,
});

export const applyInitiativeUpdate = (
  snapshot: ArtifactsSnapshot,
  initiative: Initiative,
): ArtifactsSnapshot => ({
  ...snapshot,
  meta: nextSnapshotMeta(snapshot),
  initiatives: upsertById(snapshot.initiatives, initiative),
});

export const applyTicketUpdate = (
  snapshot: ArtifactsSnapshot,
  ticket: Ticket,
): ArtifactsSnapshot => ({
  ...snapshot,
  meta: nextSnapshotMeta(snapshot),
  tickets: upsertById(snapshot.tickets, ticket),
});

export const applyQuickTaskTicketCreation = (
  snapshot: ArtifactsSnapshot,
  ticket: Ticket,
): ArtifactsSnapshot => applyTicketUpdate(snapshot, ticket);

export const applyInitiativeDeletion = (
  snapshot: ArtifactsSnapshot,
  initiativeId: string,
): ArtifactsSnapshot => {
  const removedTicketIds = new Set(
    snapshot.tickets
      .filter((ticket) => ticket.initiativeId === initiativeId)
      .map((ticket) => ticket.id),
  );
  const removedRunIds = new Set(
    snapshot.runs
      .filter((run) => run.ticketId && removedTicketIds.has(run.ticketId))
      .map((run) => run.id),
  );

  return {
    ...snapshot,
    meta: nextSnapshotMeta(snapshot),
    initiatives: removeById(snapshot.initiatives, initiativeId),
    tickets: snapshot.tickets.filter((ticket) => ticket.initiativeId !== initiativeId),
    runs: snapshot.runs.filter((run) => !removedRunIds.has(run.id)),
    runAttempts: snapshot.runAttempts.filter((attempt) => !removedRunIds.has(attempt.id)),
    specs: snapshot.specs.filter((spec) => spec.initiativeId !== initiativeId),
    planningReviews: snapshot.planningReviews.filter((review) => review.initiativeId !== initiativeId),
    ticketCoverageArtifacts: snapshot.ticketCoverageArtifacts.filter((artifact) => artifact.initiativeId !== initiativeId),
  };
};
