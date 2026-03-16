import type {
  ArtifactsSnapshot,
  Initiative,
  InitiativeArtifactStep,
  InitiativePlanningStep,
  PlanningReviewArtifact,
  PlanningReviewKind,
  Run,
  Ticket,
  TicketStatus,
} from "../../types.js";
import {
  INITIATIVE_WORKFLOW_LABELS,
  REVIEW_KIND_LABELS,
  REVIEWS_BY_STEP,
  getInitiativeResumeStep,
} from "./initiative-workflow.js";

export type PipelineNodeKey = InitiativePlanningStep | "execute" | "verify" | "done";
export type PipelineNodeZone = "planning" | "execution";
export type PipelineNodeState = "future" | "active" | "checkpoint" | "complete" | "generating";

export interface PipelineNodeModel {
  key: PipelineNodeKey;
  label: string;
  zone: PipelineNodeZone;
  state: PipelineNodeState;
}

export interface InitiativeProgressModel {
  currentKey: PipelineNodeKey;
  nodes: PipelineNodeModel[];
  statusLabel: string;
  ticketProgress: {
    done: number;
    total: number;
  };
  initiativeTickets: Ticket[];
  initiativeRuns: Run[];
  nextTicket: Ticket | null;
}

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

  return REVIEWS_BY_STEP[step];
};

const getOwnedReviews = (
  reviews: PlanningReviewArtifact[],
  initiativeId: string,
  step: InitiativePlanningStep,
): PlanningReviewArtifact[] =>
  getOwnedReviewKinds(step)
    .map((kind) => reviews.find((review) => review.id === `${initiativeId}:${kind}`))
    .filter((review): review is PlanningReviewArtifact => Boolean(review));

const getCheckpointLabel = (
  step: InitiativePlanningStep,
  reviews: PlanningReviewArtifact[],
  initiativeId: string,
): string => {
  const blockedReview = getOwnedReviewKinds(step).find((kind) => {
    const review = reviews.find((candidate) => candidate.id === `${initiativeId}:${kind}`);
    return review && !isResolvedReview(review);
  });

  if (blockedReview) {
    return REVIEW_KIND_LABELS[blockedReview];
  }

  return step === "tickets" ? "Run coverage check" : `Review ${INITIATIVE_WORKFLOW_LABELS[step].toLowerCase()}`;
};

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
  const ticketsStepReviews = getOwnedReviews(planningReviews, initiative.id, "tickets");
  const ticketsCheckpoint =
    initiative.workflow.steps.tickets.status === "stale" ||
    ticketsStepReviews.some((review) => !isResolvedReview(review));
  const planningReadyForExecution = initiativeTickets.length > 0 && !ticketsCheckpoint;
  const executionCurrentKey = getExecutionCurrentKey(initiativeTickets, planningReadyForExecution);
  const currentKey = overrides?.currentKey ?? executionCurrentKey ?? resumePlanningStep;

  const nodes = PIPELINE_NODE_ORDER.map<PipelineNodeModel>((key) => {
    const zone: PipelineNodeZone = EXECUTION_NODE_KEYS.includes(key) ? "execution" : "planning";

    if (zone === "execution") {
      let state: PipelineNodeState = "future";

      if (key === "execute") {
        if (executionCurrentKey === "execute") {
          state = "active";
        } else if (executionCurrentKey === "verify" || executionCurrentKey === "done") {
          state = "complete";
        }
      } else if (key === "verify") {
        if (executionCurrentKey === "verify") {
          state = "active";
        } else if (executionCurrentKey === "done") {
          state = "complete";
        }
      } else if (executionCurrentKey === "done") {
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
    const hasCheckpoint = workflowStep.status === "stale" || ownedReviews.some((review) => !isResolvedReview(review));

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

  let statusLabel = "Continue planning";
  if (currentKey === "done") {
    statusLabel = "Done";
  } else if (currentKey === "execute") {
    statusLabel =
      nextTicket?.status === "in-progress"
        ? "Continue execution"
        : nextTicket?.status === "ready"
          ? "Ready to run"
          : "Open next ticket";
  } else if (currentKey === "verify") {
    statusLabel = "Needs verification";
  } else {
    const currentNode = nodes.find((node) => node.key === currentKey);
    if (currentNode?.state === "checkpoint") {
      statusLabel = getCheckpointLabel(currentKey as InitiativePlanningStep, planningReviews, initiative.id);
    } else if (currentKey === "brief" && !initiative.workflow.refinements.brief.checkedAt) {
      statusLabel = "Continue to brief intake";
    } else if (currentNode?.state === "active") {
      statusLabel = `Continue to ${INITIATIVE_WORKFLOW_LABELS[currentKey as InitiativePlanningStep].toLowerCase()}`;
    }
  }

  return {
    currentKey,
    nodes,
    statusLabel,
    ticketProgress,
    initiativeTickets,
    initiativeRuns,
    nextTicket,
  };
};
