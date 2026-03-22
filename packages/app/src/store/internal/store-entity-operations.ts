import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { writeFileAtomic } from "../../io/atomic-write.js";
import {
  configPath,
  decisionsDir,
  initiativeDir,
  initiativePendingTicketPlanPath,
  initiativeReviewPath,
  initiativeTicketCoveragePath,
  initiativeTracePath,
  initiativeYamlPath,
  runDir,
  runYamlPath,
  ticketPath,
  verificationPath
} from "../../io/paths.js";
import { writeYamlFile } from "../../io/yaml.js";
import { writeInitiativeWithStaging } from "./store-writer.js";
import { specTypeToFileName } from "./spec-utils.js";
import { runAttemptKey } from "./run-operation-state.js";
import type {
  ArtifactTraceOutline,
  Config,
  Initiative,
  PendingTicketPlanArtifact,
  PlanningReviewArtifact,
  Run,
  RunAttempt,
  RunAttemptSummary,
  SpecDocument,
  SpecDocumentSummary,
  Ticket,
  TicketCoverageArtifact
} from "../../types/entities.js";

interface MapBackedStoreContext {
  rootDir: string;
  bumpRevision: () => void;
}

interface InitiativeWriteContext extends MapBackedStoreContext {
  initiatives: Map<string, Initiative>;
  specs: Map<string, SpecDocumentSummary>;
  planningReviews: Map<string, PlanningReviewArtifact>;
  pendingTicketPlans: Map<string, PendingTicketPlanArtifact>;
  tickets: Map<string, Ticket>;
  normalizeInitiative: (
    initiative: Initiative,
    inferredCompletion: {
      hasBrief: boolean;
      hasCoreFlows: boolean;
      hasPrd: boolean;
      hasTechSpec: boolean;
      hasValidation: boolean;
      hasTickets: boolean;
    }
  ) => Initiative;
  reloadFromDisk: () => Promise<void>;
  suppressWatcher: () => void;
  resumeWatcher: () => void;
}

interface InitiativeDeleteContext extends MapBackedStoreContext {
  initiatives: Map<string, Initiative>;
  tickets: Map<string, Ticket>;
  runs: Map<string, Run>;
  specs: Map<string, SpecDocumentSummary>;
  planningReviews: Map<string, PlanningReviewArtifact>;
  pendingTicketPlans: Map<string, PendingTicketPlanArtifact>;
  ticketCoverageArtifacts: Map<string, TicketCoverageArtifact>;
  artifactTraces: Map<string, ArtifactTraceOutline>;
  deleteRun: (runId: string) => Promise<void>;
  deleteTicket: (ticketId: string) => Promise<void>;
}

export async function upsertConfigRecord(
  context: MapBackedStoreContext,
  config: Config
): Promise<void> {
  await writeYamlFile(configPath(context.rootDir), config);
  context.bumpRevision();
}

export async function upsertInitiativeRecord(
  context: InitiativeWriteContext,
  initiative: Initiative,
  docs: { brief?: string; coreFlows?: string; prd?: string; techSpec?: string } = {}
): Promise<Initiative> {
  const normalized = context.normalizeInitiative(initiative, {
    hasBrief:
      docs.brief !== undefined
        ? docs.brief.trim().length > 0
        : context.specs.has(`${initiative.id}:brief`),
    hasCoreFlows:
      docs.coreFlows !== undefined
        ? docs.coreFlows.trim().length > 0
        : context.specs.has(`${initiative.id}:core-flows`),
    hasPrd:
      docs.prd !== undefined
        ? docs.prd.trim().length > 0
        : context.specs.has(`${initiative.id}:prd`),
    hasTechSpec:
      docs.techSpec !== undefined
        ? docs.techSpec.trim().length > 0
        : context.specs.has(`${initiative.id}:tech-spec`),
    hasValidation:
      context.pendingTicketPlans.has(`${initiative.id}:pending-ticket-plan`) ||
      context.planningReviews.has(`${initiative.id}:ticket-coverage-review`) ||
      initiative.workflow.steps.validation?.status === "complete" ||
      initiative.ticketIds.length > 0 ||
      initiative.phases.length > 0,
    hasTickets:
      initiative.ticketIds.length > 0 ||
      initiative.phases.length > 0 ||
      Array.from(context.tickets.values()).some((ticket) => ticket.initiativeId === initiative.id)
  });

  const hasDocChanges =
    docs.brief !== undefined ||
    docs.coreFlows !== undefined ||
    docs.prd !== undefined ||
    docs.techSpec !== undefined;

  if (hasDocChanges) {
    await writeInitiativeWithStaging({
      rootDir: context.rootDir,
      initiative: normalized,
      docs,
      suppressWatcher: context.suppressWatcher,
      resumeWatcher: context.resumeWatcher
    });
    await context.reloadFromDisk();
  } else {
    const dir = initiativeDir(context.rootDir, normalized.id);
    await mkdir(dir, { recursive: true });
    await writeYamlFile(initiativeYamlPath(context.rootDir, normalized.id), normalized);
    context.initiatives.set(normalized.id, normalized);
    context.bumpRevision();
  }

  return normalized;
}

export async function deleteInitiativeRecord(
  context: InitiativeDeleteContext,
  id: string
): Promise<void> {
  const { rm } = await import("node:fs/promises");
  const relatedTickets = Array.from(context.tickets.values()).filter((ticket) => ticket.initiativeId === id);
  const relatedTicketIds = new Set(relatedTickets.map((ticket) => ticket.id));
  const relatedRuns = Array.from(context.runs.values()).filter(
    (run) => run.ticketId && relatedTicketIds.has(run.ticketId)
  );

  for (const run of relatedRuns) {
    await context.deleteRun(run.id);
  }

  for (const ticket of relatedTickets) {
    await context.deleteTicket(ticket.id);
  }

  await rm(initiativeDir(context.rootDir, id), { recursive: true, force: true });
  context.initiatives.delete(id);
  removeByInitiative(context.specs, id);
  removeByInitiative(context.planningReviews, id);
  removeByInitiative(context.pendingTicketPlans, id);
  removeByInitiative(context.ticketCoverageArtifacts, id);
  removeByInitiative(context.artifactTraces, id);
  context.bumpRevision();
}

export async function upsertTicketRecord(
  context: MapBackedStoreContext & { tickets: Map<string, Ticket> },
  ticket: Ticket
): Promise<void> {
  await writeYamlFile(ticketPath(context.rootDir, ticket.id), ticket);
  context.tickets.set(ticket.id, ticket);
  context.bumpRevision();
}

export async function deleteTicketRecord(
  context: MapBackedStoreContext & { tickets: Map<string, Ticket> },
  id: string
): Promise<void> {
  const { rm } = await import("node:fs/promises");
  await rm(ticketPath(context.rootDir, id), { force: true });
  context.tickets.delete(id);
  context.bumpRevision();
}

export async function deleteRunRecord(
  context: MapBackedStoreContext & {
    runs: Map<string, Run>;
    runAttempts: Map<string, RunAttemptSummary>;
  },
  id: string
): Promise<void> {
  const { rm } = await import("node:fs/promises");
  await rm(runDir(context.rootDir, id), { recursive: true, force: true });
  context.runs.delete(id);
  for (const key of Array.from(context.runAttempts.keys())) {
    if (key.startsWith(`${id}:`)) {
      context.runAttempts.delete(key);
    }
  }
  context.bumpRevision();
}

export async function upsertRunRecord(
  context: MapBackedStoreContext & { runs: Map<string, Run> },
  run: Run
): Promise<void> {
  await writeYamlFile(runYamlPath(context.rootDir, run.id), run);
  context.runs.set(run.id, run);
  context.bumpRevision();
}

export async function upsertRunAttemptRecord(
  context: MapBackedStoreContext & { runAttempts: Map<string, RunAttemptSummary> },
  runId: string,
  attempt: RunAttempt
): Promise<void> {
  const filePath = verificationPath(context.rootDir, runId, attempt.attemptId);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFileAtomic(filePath, JSON.stringify(attempt, null, 2));
  context.runAttempts.set(runAttemptKey(runId, attempt.attemptId), {
    attemptId: attempt.attemptId,
    overallPass: attempt.overallPass,
    overrideReason: attempt.overrideReason,
    overrideAccepted: attempt.overrideAccepted,
    createdAt: attempt.createdAt
  });
  context.bumpRevision();
}

export async function readRunAttemptRecord(
  rootDir: string,
  runId: string,
  attemptId: string
): Promise<RunAttempt | null> {
  try {
    const raw = await readFile(verificationPath(rootDir, runId, attemptId), "utf8");
    return JSON.parse(raw) as RunAttempt;
  } catch {
    return null;
  }
}

export async function readSpecRecord(
  specs: Map<string, SpecDocumentSummary>,
  specId: string
): Promise<SpecDocument | null> {
  const summary = specs.get(specId);
  if (!summary) {
    return null;
  }

  try {
    const content = await readFile(summary.sourcePath, "utf8");
    const fileStat = await stat(summary.sourcePath);
    return {
      ...summary,
      content,
      createdAt: fileStat.birthtime.toISOString(),
      updatedAt: fileStat.mtime.toISOString()
    };
  } catch {
    return null;
  }
}

export async function upsertSpecRecord(
  context: MapBackedStoreContext & { reloadFromDisk: () => Promise<void> },
  spec: SpecDocument
): Promise<void> {
  if (spec.type === "decision") {
    const filePath = path.join(decisionsDir(context.rootDir), `${spec.id}.md`);
    await writeFileAtomic(filePath, spec.content);
  } else {
    if (!spec.initiativeId) {
      throw new Error("initiativeId is required for non-decision specs");
    }

    const fileName = specTypeToFileName(spec.type);
    const filePath = path.join(initiativeDir(context.rootDir, spec.initiativeId), fileName);
    await writeFileAtomic(filePath, spec.content);
  }

  await context.reloadFromDisk();
}

export async function upsertPlanningReviewRecord(
  context: MapBackedStoreContext & { planningReviews: Map<string, PlanningReviewArtifact> },
  review: PlanningReviewArtifact
): Promise<void> {
  await writeYamlFile(initiativeReviewPath(context.rootDir, review.initiativeId, review.kind), review);
  context.planningReviews.set(review.id, review);
  context.bumpRevision();
}

export async function upsertPendingTicketPlanRecord(
  context: MapBackedStoreContext & { pendingTicketPlans: Map<string, PendingTicketPlanArtifact> },
  plan: PendingTicketPlanArtifact
): Promise<void> {
  await writeYamlFile(initiativePendingTicketPlanPath(context.rootDir, plan.initiativeId), plan);
  context.pendingTicketPlans.set(plan.id, plan);
  context.bumpRevision();
}

export async function deletePendingTicketPlanRecord(
  context: MapBackedStoreContext & { pendingTicketPlans: Map<string, PendingTicketPlanArtifact> },
  initiativeId: string
): Promise<void> {
  const { rm } = await import("node:fs/promises");
  await rm(initiativePendingTicketPlanPath(context.rootDir, initiativeId), { force: true });
  context.pendingTicketPlans.delete(`${initiativeId}:pending-ticket-plan`);
  context.bumpRevision();
}

export async function upsertTicketCoverageRecord(
  context: MapBackedStoreContext & { ticketCoverageArtifacts: Map<string, TicketCoverageArtifact> },
  coverage: TicketCoverageArtifact
): Promise<void> {
  await writeYamlFile(initiativeTicketCoveragePath(context.rootDir, coverage.initiativeId), coverage);
  context.ticketCoverageArtifacts.set(coverage.id, coverage);
  context.bumpRevision();
}

export async function upsertArtifactTraceRecord(
  context: MapBackedStoreContext & { artifactTraces: Map<string, ArtifactTraceOutline> },
  trace: ArtifactTraceOutline
): Promise<void> {
  await writeYamlFile(initiativeTracePath(context.rootDir, trace.initiativeId, trace.step), trace);
  context.artifactTraces.set(trace.id, trace);
  context.bumpRevision();
}

function removeByInitiative<T extends { initiativeId: string | null }>(
  collection: Map<string, T>,
  initiativeId: string
): void {
  for (const [key, value] of collection) {
    if (value.initiativeId === initiativeId) {
      collection.delete(key);
    }
  }
}
