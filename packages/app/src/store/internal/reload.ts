import { configPath } from "../../io/paths.js";
import { readYamlFile } from "../../io/yaml.js";
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
import { loadDecisions, loadInitiatives, loadRuns, loadTickets } from "./loaders.js";

export interface StoreReloadSnapshot {
  config: Config | null;
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
  const config = await readYamlFile<Config>(configPath(input.rootDir));

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
      specs
    }),
    loadTickets({
      rootDir: input.rootDir,
      tickets
    }),
    loadRuns({
      rootDir: input.rootDir,
      runs,
      runAttempts,
      runAttemptKey: input.runAttemptKey
    }),
    loadDecisions({
      rootDir: input.rootDir,
      specs
    })
  ]);

  for (const [initiativeId, initiative] of initiatives) {
    const relatedSpecs = Array.from(specs.values()).filter((spec) => spec.initiativeId === initiativeId);
    const relatedTickets = Array.from(tickets.values()).filter((ticket) => ticket.initiativeId === initiativeId);
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
