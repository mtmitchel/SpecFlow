import type { ArtifactsSnapshot, Initiative, PlanningReviewArtifact, Run, SpecDocumentSummary, Ticket } from "../../types.js";

export interface SnapshotIndex {
  initiativesById: Map<string, Initiative>;
  ticketsById: Map<string, Ticket>;
  runsById: Map<string, Run>;
  ticketsByInitiativeId: Map<string, Ticket[]>;
  runsByInitiativeId: Map<string, Run[]>;
  reviewsByInitiativeId: Map<string, PlanningReviewArtifact[]>;
  specsByInitiativeId: Map<string, SpecDocumentSummary[]>;
}

const snapshotIndexCache = new WeakMap<ArtifactsSnapshot, SnapshotIndex>();

const pushToListMap = <Key, Value>(
  target: Map<Key, Value[]>,
  key: Key,
  value: Value
): void => {
  const existing = target.get(key);
  if (existing) {
    existing.push(value);
    return;
  }

  target.set(key, [value]);
};

export const getSnapshotIndex = (snapshot: ArtifactsSnapshot): SnapshotIndex => {
  const cached = snapshotIndexCache.get(snapshot);
  if (cached) {
    return cached;
  }

  const ticketsById = new Map(snapshot.tickets.map((ticket) => [ticket.id, ticket]));
  const initiativesById = new Map(snapshot.initiatives.map((initiative) => [initiative.id, initiative]));
  const runsById = new Map(snapshot.runs.map((run) => [run.id, run]));
  const ticketsByInitiativeId = new Map<string, Ticket[]>();
  const runsByInitiativeId = new Map<string, Run[]>();
  const reviewsByInitiativeId = new Map<string, PlanningReviewArtifact[]>();
  const specsByInitiativeId = new Map<string, SpecDocumentSummary[]>();

  for (const ticket of snapshot.tickets) {
    if (!ticket.initiativeId) {
      continue;
    }

    pushToListMap(ticketsByInitiativeId, ticket.initiativeId, ticket);
  }

  for (const run of snapshot.runs) {
    if (!run.ticketId) {
      continue;
    }

    const ticket = ticketsById.get(run.ticketId);
    if (!ticket?.initiativeId) {
      continue;
    }

    pushToListMap(runsByInitiativeId, ticket.initiativeId, run);
  }

  for (const review of snapshot.planningReviews) {
    pushToListMap(reviewsByInitiativeId, review.initiativeId, review);
  }

  for (const spec of snapshot.specs) {
    if (!spec.initiativeId) {
      continue;
    }

    pushToListMap(specsByInitiativeId, spec.initiativeId, spec);
  }

  const index: SnapshotIndex = {
    initiativesById,
    ticketsById,
    runsById,
    ticketsByInitiativeId,
    runsByInitiativeId,
    reviewsByInitiativeId,
    specsByInitiativeId
  };

  snapshotIndexCache.set(snapshot, index);
  return index;
};

export const getInitiativeTickets = (snapshot: ArtifactsSnapshot, initiativeId: string): Ticket[] =>
  getSnapshotIndex(snapshot).ticketsByInitiativeId.get(initiativeId) ?? [];

export const getInitiativeRuns = (snapshot: ArtifactsSnapshot, initiativeId: string): Run[] =>
  getSnapshotIndex(snapshot).runsByInitiativeId.get(initiativeId) ?? [];

export const getInitiativeReviews = (
  snapshot: ArtifactsSnapshot,
  initiativeId: string
): PlanningReviewArtifact[] =>
  getSnapshotIndex(snapshot).reviewsByInitiativeId.get(initiativeId) ?? [];

export const getInitiativeSpecs = (
  snapshot: ArtifactsSnapshot,
  initiativeId: string
): SpecDocumentSummary[] =>
  getSnapshotIndex(snapshot).specsByInitiativeId.get(initiativeId) ?? [];

export const getRunTicket = (snapshot: ArtifactsSnapshot, run: Run): Ticket | null =>
  run.ticketId ? getSnapshotIndex(snapshot).ticketsById.get(run.ticketId) ?? null : null;

export const getRunInitiative = (
  snapshot: ArtifactsSnapshot,
  run: Run
): Initiative | null => {
  const ticket = getRunTicket(snapshot, run);
  return ticket?.initiativeId
    ? getSnapshotIndex(snapshot).initiativesById.get(ticket.initiativeId) ?? null
    : null;
};
