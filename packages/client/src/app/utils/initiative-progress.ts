import type {
  ArtifactsSnapshot,
  Initiative,
  InitiativePlanningStep,
  PlanningReviewArtifact,
  PlanningReviewKind,
  Run,
  SpecDocumentSummary,
  Ticket,
  TicketStatus,
} from "../../types.js";
import {
  getInitiativeBlockedStep,
  INITIATIVE_WORKFLOW_LABELS,
  getInitiativeResumeStep,
} from "./initiative-workflow.js";

export type PipelineNodeKey = InitiativePlanningStep | "execute" | "verify" | "done";
export type PipelineNodeZone = "planning" | "execution";
export type PipelineNodeState = "future" | "active" | "checkpoint" | "complete" | "generating";
export type InitiativePlanningSurface = "questions" | "review";

export interface PipelineNodeModel {
  key: PipelineNodeKey;
  label: string;
  zone: PipelineNodeZone;
  state: PipelineNodeState;
}

export interface InitiativeProgressModel {
  currentKey: PipelineNodeKey;
  currentNodeState: PipelineNodeState;
  currentReviewKind: PlanningReviewKind | null;
  nodes: PipelineNodeModel[];
  ticketProgress: {
    done: number;
    total: number;
  };
  initiativeTickets: Ticket[];
  initiativeRuns: Run[];
  nextTicket: Ticket | null;
}

const hasInitiativeArtifactSummary = (
  specSummaries: SpecDocumentSummary[],
  initiativeId: string,
  step: InitiativePlanningStep,
): boolean =>
  step !== "tickets" &&
  specSummaries.some((spec) => spec.initiativeId === initiativeId && spec.type === step);

export const isInitiativePlanningSurface = (value: string | null): value is InitiativePlanningSurface =>
  value === "questions" || value === "review";

export const getInitiativePlanningSurface = (
  initiative: Initiative,
  specSummaries: SpecDocumentSummary[],
  step: Exclude<InitiativePlanningStep, "tickets">,
  preferredSurface?: InitiativePlanningSurface | null,
): InitiativePlanningSurface => {
  const hasArtifact = hasInitiativeArtifactSummary(specSummaries, initiative.id, step);
  const canOpenQuestions = !hasArtifact || initiative.workflow.refinements[step].questions.length > 0;
  const defaultSurface: InitiativePlanningSurface = hasArtifact ? "review" : "questions";

  if (!preferredSurface) {
    return defaultSurface;
  }

  if (preferredSurface === "review" && hasArtifact) {
    return "review";
  }

  if (preferredSurface === "questions" && canOpenQuestions) {
    return "questions";
  }

  return defaultSurface;
};

export const buildInitiativeStepSearchParams = (
  step: InitiativePlanningStep,
  surface?: InitiativePlanningSurface | null,
): URLSearchParams => {
  const params = new URLSearchParams();
  params.set("step", step);

  if (step !== "tickets" && surface) {
    params.set("surface", surface);
  }

  return params;
};

export const buildInitiativeStepHref = (
  initiativeId: string,
  step: InitiativePlanningStep,
  surface?: InitiativePlanningSurface | null,
): string => `/initiative/${initiativeId}?${buildInitiativeStepSearchParams(step, surface).toString()}`;

export const getInitiativeResumeHref = (
  initiative: Initiative,
  progress: InitiativeProgressModel,
  snapshot: ArtifactsSnapshot,
): string => {
  if (progress.currentKey === "execute" || progress.currentKey === "verify") {
    return progress.nextTicket ? `/ticket/${progress.nextTicket.id}` : `/initiative/${initiative.id}?step=tickets`;
  }

  if (progress.currentKey === "done") {
    return `/initiative/${initiative.id}?step=tickets`;
  }

  if (progress.currentKey === "tickets") {
    return buildInitiativeStepHref(initiative.id, progress.currentKey);
  }

  return buildInitiativeStepHref(
    initiative.id,
    progress.currentKey,
    getInitiativePlanningSurface(initiative, snapshot.specs, progress.currentKey),
  );
};

export const PIPELINE_NODE_ORDER: PipelineNodeKey[] = [
  "brief",
  "core-flows",
  "prd",
  "tech-spec",
  "tickets",
  "execute",
  "verify",
  "done",
];

export const PIPELINE_NODE_LABELS: Record<PipelineNodeKey, string> = {
  brief: INITIATIVE_WORKFLOW_LABELS.brief,
  "core-flows": INITIATIVE_WORKFLOW_LABELS["core-flows"],
  prd: INITIATIVE_WORKFLOW_LABELS.prd,
  "tech-spec": INITIATIVE_WORKFLOW_LABELS["tech-spec"],
  tickets: INITIATIVE_WORKFLOW_LABELS.tickets,
  execute: "Execute",
  verify: "Verify",
  done: "Done",
};

const EXECUTION_NODE_KEYS: PipelineNodeKey[] = ["execute", "verify", "done"];
const TICKET_COVERAGE_REVIEW_KIND: PlanningReviewKind = "ticket-coverage-review";

const STATUS_PRIORITY: Record<TicketStatus, number> = {
  verify: 0,
  "in-progress": 1,
  ready: 2,
  backlog: 3,
  done: 4,
};

const isResolvedReview = (review: PlanningReviewArtifact | undefined): boolean =>
  Boolean(review && (review.status === "passed" || review.status === "overridden"));

const getOwnedReviewKinds = (step: InitiativePlanningStep): PlanningReviewKind[] => {
  if (step === "tickets") {
    return [TICKET_COVERAGE_REVIEW_KIND];
  }

  return [];
};

const getOwnedReviews = (
  reviews: PlanningReviewArtifact[],
  initiativeId: string,
  step: InitiativePlanningStep,
): PlanningReviewArtifact[] =>
  getOwnedReviewKinds(step)
    .map((kind) => reviews.find((review) => review.id === `${initiativeId}:${kind}`))
    .filter((review): review is PlanningReviewArtifact => Boolean(review));

const getCheckpointReviewKind = (
  step: InitiativePlanningStep,
  reviews: PlanningReviewArtifact[],
  initiativeId: string,
): PlanningReviewKind | null =>
  getOwnedReviewKinds(step).find((kind) => {
    const review = reviews.find((candidate) => candidate.id === `${initiativeId}:${kind}`);
    return review && !isResolvedReview(review);
  }) ?? null;

const sortTickets = (tickets: Ticket[]): Ticket[] =>
  [...tickets].sort((left, right) => {
    const priority = STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status];
    if (priority !== 0) {
      return priority;
    }

    return new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
  });

const getExecutionCurrentKey = (
  initiativeTickets: Ticket[],
  planningReadyForExecution: boolean,
): PipelineNodeKey | null => {
  if (initiativeTickets.length === 0) {
    return null;
  }

  const everyTicketDone = initiativeTickets.every((ticket) => ticket.status === "done");
  if (everyTicketDone) {
    return "done";
  }

  if (!planningReadyForExecution) {
    return null;
  }

  if (initiativeTickets.some((ticket) => ticket.status === "verify")) {
    return "verify";
  }

  return "execute";
};

export const getInitiativeProgressModel = (
  initiative: Initiative,
  snapshot: ArtifactsSnapshot,
  overrides?: {
    currentKey?: PipelineNodeKey;
    generatingKey?: PipelineNodeKey | null;
  },
): InitiativeProgressModel => {
  const planningReviews = snapshot.planningReviews.filter((review) => review.initiativeId === initiative.id);
  const initiativeTickets = sortTickets(snapshot.tickets.filter((ticket) => ticket.initiativeId === initiative.id));
  const initiativeRuns = snapshot.runs.filter((run) =>
    run.ticketId ? initiativeTickets.some((ticket) => ticket.id === run.ticketId) : false,
  );
  const nextTicket =
    initiativeTickets.find((ticket) => ticket.status === "verify") ??
    initiativeTickets.find((ticket) => ticket.status !== "done") ??
    null;

  const resumePlanningStep = getInitiativeResumeStep(initiative.workflow);
  const blockedPlanningStep = getInitiativeBlockedStep(initiative.workflow, planningReviews);
  const ticketsStepReviews = getOwnedReviews(planningReviews, initiative.id, "tickets");
  const ticketsCheckpoint =
    initiative.workflow.steps.tickets.status === "stale" ||
    ticketsStepReviews.some((review) => !isResolvedReview(review));
  const planningReadyForExecution = initiativeTickets.length > 0 && !ticketsCheckpoint;
  const executionCurrentKey = getExecutionCurrentKey(initiativeTickets, planningReadyForExecution);
  const visibleExecutionKey = blockedPlanningStep ? null : executionCurrentKey;
  const currentKey = overrides?.currentKey ?? blockedPlanningStep ?? visibleExecutionKey ?? resumePlanningStep;

  const nodes = PIPELINE_NODE_ORDER.map<PipelineNodeModel>((key) => {
    const zone: PipelineNodeZone = EXECUTION_NODE_KEYS.includes(key) ? "execution" : "planning";

    if (zone === "execution") {
      let state: PipelineNodeState = "future";

      if (key === "execute") {
        if (visibleExecutionKey === "execute") {
          state = "active";
        } else if (visibleExecutionKey === "verify" || visibleExecutionKey === "done") {
          state = "complete";
        }
      } else if (key === "verify") {
        if (visibleExecutionKey === "verify") {
          state = "active";
        } else if (visibleExecutionKey === "done") {
          state = "complete";
        }
      } else if (visibleExecutionKey === "done") {
        state = "complete";
      }

      if (overrides?.generatingKey === key && state === "active") {
        state = "generating";
      }

      return {
        key,
        label: PIPELINE_NODE_LABELS[key],
        zone,
        state,
      };
    }

    const planningKey = key as InitiativePlanningStep;
    const workflowStep = initiative.workflow.steps[planningKey];
    const ownedReviews = getOwnedReviews(planningReviews, initiative.id, planningKey);
    const hasCheckpoint = ownedReviews.some((review) => !isResolvedReview(review));

    let state: PipelineNodeState = "future";
    if (workflowStep.status === "complete" && !hasCheckpoint) {
      state = "complete";
    } else if (key === currentKey) {
      state = hasCheckpoint ? "checkpoint" : "active";
    } else if (workflowStep.status === "complete" && hasCheckpoint) {
      state = "checkpoint";
    } else if (currentKey === "execute" || currentKey === "verify" || currentKey === "done") {
      if (workflowStep.status === "complete") {
        state = "complete";
      } else if (key === "tickets") {
        state = hasCheckpoint ? "checkpoint" : "active";
      }
    }

    if (overrides?.generatingKey === key && (key === currentKey || workflowStep.status === "ready")) {
      state = "generating";
    }

    return {
      key,
      label: PIPELINE_NODE_LABELS[key],
      zone,
      state,
    };
  });

  const ticketProgress = {
    done: initiativeTickets.filter((ticket) => ticket.status === "done").length,
    total: initiativeTickets.length,
  };

  const currentNode = nodes.find((node) => node.key === currentKey);
  const currentNodeState = currentNode?.state ?? "future";
  const currentReviewKind =
    currentKey === "execute" || currentKey === "verify" || currentKey === "done"
      ? null
      : getCheckpointReviewKind(currentKey, planningReviews, initiative.id);

  return {
    currentKey,
    currentNodeState,
    currentReviewKind,
    nodes,
    ticketProgress,
    initiativeTickets,
    initiativeRuns,
    nextTicket,
  };
};
