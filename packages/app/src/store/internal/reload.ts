import { configPath } from "../../io/paths.js";
import { readYamlFile } from "../../io/yaml.js";
import type { StoreReloadIssue } from "../../types/contracts.js";
import type {
  ArtifactTraceOutline,
  Config,
  Initiative,
  PendingTicketPlanArtifact,
  PlanningReviewArtifact,
  Run,
  RunAttemptSummary,
  SpecDocumentSummary,
  Ticket,
  TicketCoverageArtifact
} from "../../types/entities.js";
import { describeIssue, loadDecisions, loadInitiatives, loadRuns, loadTickets } from "./loaders.js";

export interface StoreReloadSnapshot {
  config: Config | null;
  issues: StoreReloadIssue[];
  initiatives: Map<string, Initiative>;
  tickets: Map<string, Ticket>;
  runs: Map<string, Run>;
  runAttempts: Map<string, RunAttemptSummary>;
  specs: Map<string, SpecDocumentSummary>;
  planningReviews: Map<string, PlanningReviewArtifact>;
  pendingTicketPlans: Map<string, PendingTicketPlanArtifact>;
  ticketCoverageArtifacts: Map<string, TicketCoverageArtifact>;
  artifactTraces: Map<string, ArtifactTraceOutline>;
}

export const loadStoreSnapshot = async (input: {
  rootDir: string;
  runAttemptKey: (runId: string, attemptId: string) => string;
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
}): Promise<StoreReloadSnapshot> => {
  const issues: StoreReloadIssue[] = [];
  let config: Config | null = null;

  try {
    config = await readYamlFile<Config>(configPath(input.rootDir));
  } catch (error) {
    issues.push({
      scope: "config",
      path: configPath(input.rootDir),
      message: describeIssue(error)
    });
  }

  const initiatives = new Map<string, Initiative>();
  const tickets = new Map<string, Ticket>();
  const runs = new Map<string, Run>();
  const runAttempts = new Map<string, RunAttemptSummary>();
  const specs = new Map<string, SpecDocumentSummary>();
  const planningReviews = new Map<string, PlanningReviewArtifact>();
  const pendingTicketPlans = new Map<string, PendingTicketPlanArtifact>();
  const ticketCoverageArtifacts = new Map<string, TicketCoverageArtifact>();
  const artifactTraces = new Map<string, ArtifactTraceOutline>();

  await Promise.all([
    loadInitiatives({
      rootDir: input.rootDir,
      initiatives,
      pendingTicketPlans,
      planningReviews,
      ticketCoverageArtifacts,
      artifactTraces,
      specs,
      issues
    }),
    loadTickets({
      rootDir: input.rootDir,
      tickets,
      issues
    }),
    loadRuns({
      rootDir: input.rootDir,
      runs,
      runAttempts,
      runAttemptKey: input.runAttemptKey,
      issues
    }),
    loadDecisions({
      rootDir: input.rootDir,
      specs,
      issues
    })
  ]);

  const specsByInitiativeId = new Map<string, SpecDocumentSummary[]>();
  for (const spec of specs.values()) {
    if (!spec.initiativeId) {
      continue;
    }

    const initiativeSpecs = specsByInitiativeId.get(spec.initiativeId) ?? [];
    initiativeSpecs.push(spec);
    specsByInitiativeId.set(spec.initiativeId, initiativeSpecs);
  }

  const ticketsByInitiativeId = new Map<string, Ticket[]>();
  for (const ticket of tickets.values()) {
    if (!ticket.initiativeId) {
      continue;
    }

    const initiativeTickets = ticketsByInitiativeId.get(ticket.initiativeId) ?? [];
    initiativeTickets.push(ticket);
    ticketsByInitiativeId.set(ticket.initiativeId, initiativeTickets);
  }

  for (const [initiativeId, initiative] of initiatives) {
    const relatedSpecs = specsByInitiativeId.get(initiativeId) ?? [];
    const relatedTickets = ticketsByInitiativeId.get(initiativeId) ?? [];
    initiatives.set(
      initiativeId,
      input.normalizeInitiative(initiative, {
        hasBrief: relatedSpecs.some((spec) => spec.type === "brief"),
        hasCoreFlows: relatedSpecs.some((spec) => spec.type === "core-flows"),
        hasPrd: relatedSpecs.some((spec) => spec.type === "prd"),
        hasTechSpec: relatedSpecs.some((spec) => spec.type === "tech-spec"),
        hasValidation:
          pendingTicketPlans.has(`${initiativeId}:pending-ticket-plan`) ||
          planningReviews.has(`${initiativeId}:ticket-coverage-review`) ||
          relatedTickets.length > 0 ||
          initiative.workflow?.steps?.validation?.status === "complete",
        hasTickets: relatedTickets.length > 0 || initiative.ticketIds.length > 0 || initiative.phases.length > 0
      })
    );
  }

  return {
    config,
    issues,
    initiatives,
    tickets,
    runs,
    runAttempts,
    specs,
    planningReviews,
    pendingTicketPlans,
    ticketCoverageArtifacts,
    artifactTraces
  };
};

export const replaceMapContents = <Key, Value>(target: Map<Key, Value>, source: Map<Key, Value>): void => {
  target.clear();
  for (const [key, value] of source) {
    target.set(key, value);
  }
};
