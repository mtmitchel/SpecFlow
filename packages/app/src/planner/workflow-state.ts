import type {
  Initiative,
  InitiativeArtifactStep,
  InitiativePlanningStep,
  InitiativePlanningStepStatus,
  InitiativeRefinementState,
  InitiativeWorkflow,
  InitiativeWorkflowStep
} from "../types/entities.js";
import { PLANNING_STEPS, REFINEMENT_STEPS, getPrerequisitePlanningStep } from "./workflow-contract.js";

type RefinementStep = (typeof REFINEMENT_STEPS)[number];

const VALID_STEP_STATUS = new Set<InitiativePlanningStepStatus>(["locked", "ready", "complete", "stale"]);

const createStepState = (status: InitiativePlanningStepStatus): InitiativeWorkflowStep => ({
  status,
  updatedAt: null
});

const createRefinementState = (): InitiativeRefinementState => ({
  questions: [],
  history: [],
  answers: {},
  defaultAnswerQuestionIds: [],
  baseAssumptions: [],
  preferredSurface: null,
  checkedAt: null
});

const isRefinementStep = (step: InitiativePlanningStep): step is RefinementStep =>
  REFINEMENT_STEPS.includes(step as RefinementStep);

export const createInitiativeWorkflow = (): InitiativeWorkflow => ({
  activeStep: "brief",
  resumeTicketId: null,
  steps: {
    brief: createStepState("ready"),
    "core-flows": createStepState("locked"),
    prd: createStepState("locked"),
    "tech-spec": createStepState("locked"),
    validation: createStepState("locked"),
    tickets: createStepState("locked")
  },
  refinements: {
    brief: createRefinementState(),
    "core-flows": createRefinementState(),
    prd: createRefinementState(),
    "tech-spec": createRefinementState()
  }
});

export const getResumeStep = (workflow: InitiativeWorkflow): InitiativePlanningStep => {
  for (const step of PLANNING_STEPS) {
    const status = workflow.steps[step].status;
    if (status === "ready" || status === "stale") {
      return step;
    }
  }

  for (const step of [...PLANNING_STEPS].reverse()) {
    if (workflow.steps[step].status === "complete") {
      return step;
    }
  }

  return "brief";
};

const normalizeRefinement = (
  current: Partial<InitiativeRefinementState> | undefined,
  legacyQuestions: Initiative["workflow"] extends { clarificationQuestions?: infer Q } ? Q : unknown,
  legacyAnswers: Initiative["workflow"] extends { clarificationAnswers?: infer A } ? A : unknown
): InitiativeRefinementState => ({
  questions: Array.isArray(current?.questions)
    ? current.questions
    : Array.isArray(legacyQuestions)
      ? legacyQuestions
      : [],
  history:
    current?.history && Array.isArray(current.history)
      ? current.history
      : Array.isArray(current?.questions)
        ? current.questions
        : Array.isArray(legacyQuestions)
          ? legacyQuestions
          : [],
  answers:
    current?.answers && typeof current.answers === "object"
      ? current.answers
      : legacyAnswers && typeof legacyAnswers === "object"
        ? (legacyAnswers as Record<string, string | string[] | boolean>)
        : {},
  defaultAnswerQuestionIds: Array.isArray(current?.defaultAnswerQuestionIds)
    ? current.defaultAnswerQuestionIds
    : [],
  baseAssumptions: Array.isArray(current?.baseAssumptions) ? current.baseAssumptions : [],
  preferredSurface: current?.preferredSurface === "questions" || current?.preferredSurface === "review"
    ? current.preferredSurface
    : null,
  checkedAt: current?.checkedAt ?? null
});

export const normalizeInitiativeWorkflow = (
  workflow: (Initiative["workflow"] & {
    clarificationQuestions?: unknown;
    clarificationAnswers?: unknown;
  }) | undefined,
  inferredCompletion: {
    hasBrief: boolean;
    hasCoreFlows: boolean;
    hasPrd: boolean;
    hasTechSpec: boolean;
    hasValidation: boolean;
    hasTickets: boolean;
  }
): InitiativeWorkflow => {
  const inferredWorkflow = inferWorkflowFromArtifacts(inferredCompletion);
  if (!workflow) {
    return inferredWorkflow;
  }

  const normalized = inferredWorkflow;
  const legacyQuestions = workflow.clarificationQuestions;
  const legacyAnswers = workflow.clarificationAnswers;

  for (const step of PLANNING_STEPS) {
    const current = workflow.steps?.[step];
    const fallback = normalized.steps[step];
    normalized.steps[step] = {
      status:
        current && VALID_STEP_STATUS.has(current.status)
          ? current.status
          : fallback.status,
      updatedAt: current?.updatedAt ?? fallback.updatedAt
    };
  }

  for (const step of REFINEMENT_STEPS) {
    normalized.refinements[step] = normalizeRefinement(
      workflow.refinements?.[step],
      step === "brief" ? legacyQuestions : undefined,
      step === "brief" ? legacyAnswers : undefined
    );
  }

  normalized.activeStep = getResumeStep(normalized);
  normalized.resumeTicketId = typeof workflow.resumeTicketId === "string" && workflow.resumeTicketId.trim().length > 0
    ? workflow.resumeTicketId
    : null;
  return normalized;
};

export const inferWorkflowFromArtifacts = (input: {
  hasBrief: boolean;
  hasCoreFlows: boolean;
  hasPrd: boolean;
  hasTechSpec: boolean;
  hasValidation: boolean;
  hasTickets: boolean;
}): InitiativeWorkflow => {
  const workflow = createInitiativeWorkflow();

  if (input.hasBrief) {
    workflow.steps.brief.status = "complete";
  }

  if (input.hasCoreFlows) {
    workflow.steps["core-flows"].status = "complete";
  } else if (input.hasBrief) {
    workflow.steps["core-flows"].status = "ready";
  }

  const requiresCoreFlowsBackfill =
    !input.hasCoreFlows &&
    (input.hasPrd || input.hasTechSpec || input.hasValidation || input.hasTickets);
  if (requiresCoreFlowsBackfill) {
    workflow.steps["core-flows"].status = "stale";
    if (input.hasPrd) {
      workflow.steps.prd.status = "stale";
    }
    if (input.hasTechSpec) {
      workflow.steps["tech-spec"].status = "stale";
    }
    if (input.hasValidation) {
      workflow.steps.validation.status = "stale";
    }
    if (input.hasTickets) {
      workflow.steps.tickets.status = "stale";
    }
    workflow.activeStep = getResumeStep(workflow);
    return workflow;
  }

  if (input.hasPrd) {
    workflow.steps.prd.status = "complete";
  } else if (input.hasCoreFlows) {
    workflow.steps.prd.status = "ready";
  }

  const requiresPrdBackfill = !input.hasPrd && (input.hasTechSpec || input.hasValidation || input.hasTickets);
  if (requiresPrdBackfill) {
    workflow.steps.prd.status = "stale";
    if (input.hasTechSpec) {
      workflow.steps["tech-spec"].status = "stale";
    }
    if (input.hasValidation) {
      workflow.steps.validation.status = "stale";
    }
    if (input.hasTickets) {
      workflow.steps.tickets.status = "stale";
    }
    workflow.activeStep = getResumeStep(workflow);
    return workflow;
  }

  if (input.hasTechSpec) {
    workflow.steps["tech-spec"].status = "complete";
  } else if (input.hasPrd) {
    workflow.steps["tech-spec"].status = "ready";
  }

  const requiresTechSpecBackfill = !input.hasTechSpec && (input.hasValidation || input.hasTickets);
  if (requiresTechSpecBackfill) {
    workflow.steps["tech-spec"].status = "stale";
    if (input.hasValidation) {
      workflow.steps.validation.status = "stale";
    }
    if (input.hasTickets) {
      workflow.steps.tickets.status = "stale";
    }
    workflow.activeStep = getResumeStep(workflow);
    return workflow;
  }

  if (input.hasValidation) {
    workflow.steps.validation.status = "complete";
  } else if (input.hasTechSpec) {
    workflow.steps.validation.status = "ready";
  }

  if (input.hasTickets) {
    workflow.steps.tickets.status = "complete";
  } else if (input.hasValidation) {
    workflow.steps.tickets.status = "ready";
  }

  workflow.activeStep = getResumeStep(workflow);
  return workflow;
};

export const getPrerequisiteStep = (step: InitiativePlanningStep): InitiativePlanningStep | null => {
  return getPrerequisitePlanningStep(step);
};

export const canEditStep = (workflow: InitiativeWorkflow, step: InitiativePlanningStep): boolean => {
  const prerequisite = getPrerequisiteStep(step);
  return prerequisite ? workflow.steps[prerequisite].status === "complete" : true;
};

const cloneRefinements = (workflow: InitiativeWorkflow): InitiativeWorkflow["refinements"] => ({
  brief: {
    ...workflow.refinements.brief,
    questions: [...workflow.refinements.brief.questions],
    history: [...(workflow.refinements.brief.history ?? [])],
    answers: { ...workflow.refinements.brief.answers },
    defaultAnswerQuestionIds: [...workflow.refinements.brief.defaultAnswerQuestionIds],
    baseAssumptions: [...workflow.refinements.brief.baseAssumptions]
  },
  "core-flows": {
    ...workflow.refinements["core-flows"],
    questions: [...workflow.refinements["core-flows"].questions],
    history: [...(workflow.refinements["core-flows"].history ?? [])],
    answers: { ...workflow.refinements["core-flows"].answers },
    defaultAnswerQuestionIds: [...workflow.refinements["core-flows"].defaultAnswerQuestionIds],
    baseAssumptions: [...workflow.refinements["core-flows"].baseAssumptions]
  },
  prd: {
    ...workflow.refinements.prd,
    questions: [...workflow.refinements.prd.questions],
    history: [...(workflow.refinements.prd.history ?? [])],
    answers: { ...workflow.refinements.prd.answers },
    defaultAnswerQuestionIds: [...workflow.refinements.prd.defaultAnswerQuestionIds],
    baseAssumptions: [...workflow.refinements.prd.baseAssumptions]
  },
  "tech-spec": {
    ...workflow.refinements["tech-spec"],
    questions: [...workflow.refinements["tech-spec"].questions],
    history: [...(workflow.refinements["tech-spec"].history ?? [])],
    answers: { ...workflow.refinements["tech-spec"].answers },
    defaultAnswerQuestionIds: [...workflow.refinements["tech-spec"].defaultAnswerQuestionIds],
    baseAssumptions: [...workflow.refinements["tech-spec"].baseAssumptions]
  }
});

const createWorkflowDraft = (workflow: InitiativeWorkflow): InitiativeWorkflow => ({
  activeStep: workflow.activeStep,
  resumeTicketId: workflow.resumeTicketId ?? null,
  steps: {
    brief: { ...workflow.steps.brief },
    "core-flows": { ...workflow.steps["core-flows"] },
    prd: { ...workflow.steps.prd },
    "tech-spec": { ...workflow.steps["tech-spec"] },
    validation: { ...workflow.steps.validation },
    tickets: { ...workflow.steps.tickets }
  },
  refinements: cloneRefinements(workflow)
});

export const updateRefinementState = (
  workflow: InitiativeWorkflow,
  step: RefinementStep,
  input: Partial<InitiativeRefinementState>
): InitiativeWorkflow => {
  const next = createWorkflowDraft(workflow);
  const currentRefinement = next.refinements[step];
  const nextQuestions = input.questions ?? currentRefinement.questions;
  const nextHistoryById = new Map((currentRefinement.history ?? []).map((question) => [question.id, question]));
  for (const question of nextQuestions) {
    nextHistoryById.set(question.id, question);
  }

  next.refinements[step] = {
    questions: nextQuestions,
    history: input.history ?? Array.from(nextHistoryById.values()),
    answers: input.answers ?? currentRefinement.answers,
    defaultAnswerQuestionIds: input.defaultAnswerQuestionIds ?? currentRefinement.defaultAnswerQuestionIds,
    baseAssumptions: input.baseAssumptions ?? currentRefinement.baseAssumptions,
    preferredSurface: input.preferredSurface ?? currentRefinement.preferredSurface ?? null,
    checkedAt: input.checkedAt ?? currentRefinement.checkedAt
  };
  next.activeStep = getResumeStep(next);
  return next;
};

export const getRefinementAssumptions = (
  workflow: InitiativeWorkflow,
  step: RefinementStep
): string[] => {
  const refinement = workflow.refinements[step];
  const fallbackAssumptions = refinement.questions
    .filter(
      (question) =>
        refinement.defaultAnswerQuestionIds.includes(question.id) &&
        refinement.answers[question.id] === undefined
    )
    .map((question) => question.assumptionIfUnanswered);

  return Array.from(new Set([...refinement.baseAssumptions, ...fallbackAssumptions]));
};

export const completeWorkflowStep = (
  workflow: InitiativeWorkflow,
  step: InitiativePlanningStep,
  nowIso: string
): InitiativeWorkflow => {
  const next = createWorkflowDraft(workflow);

  next.steps[step] = {
    status: "complete",
    updatedAt: nowIso
  };

  if (isRefinementStep(step)) {
    next.refinements[step].questions = [];
    next.refinements[step].preferredSurface = "review";
    next.refinements[step].checkedAt = nowIso;
  }

  const downstream = PLANNING_STEPS.slice(PLANNING_STEPS.indexOf(step) + 1);
  let openedNextStep = false;

  for (const downstreamStep of downstream) {
    const previousStatus = workflow.steps[downstreamStep].status;
    if (previousStatus === "complete" || previousStatus === "stale") {
      next.steps[downstreamStep] = {
        ...workflow.steps[downstreamStep],
        status: "stale"
      };
      continue;
    }

    next.steps[downstreamStep] = {
      ...workflow.steps[downstreamStep],
      status: openedNextStep ? "locked" : "ready"
    };
    openedNextStep = true;
  }

  next.activeStep = getResumeStep(next);
  return next;
};

export const invalidateWorkflowFromStep = (
  workflow: InitiativeWorkflow,
  step: InitiativePlanningStep
): InitiativeWorkflow => {
  const next = createWorkflowDraft(workflow);
  const downstream = PLANNING_STEPS.slice(PLANNING_STEPS.indexOf(step));

  for (const [index, affectedStep] of downstream.entries()) {
    const previousStatus = workflow.steps[affectedStep].status;
    next.steps[affectedStep] = {
      ...workflow.steps[affectedStep],
      status:
        previousStatus === "complete" || previousStatus === "stale"
          ? "stale"
          : index === 0
            ? "ready"
            : "locked"
    };

    if (isRefinementStep(affectedStep)) {
      next.refinements[affectedStep] = createRefinementState();
    }
  }

  next.activeStep = getResumeStep(next);
  return next;
};

export const blockWorkflowAtStep = (
  workflow: InitiativeWorkflow,
  step: InitiativePlanningStep,
  nowIso: string
): InitiativeWorkflow => {
  const next = createWorkflowDraft(workflow);
  next.steps[step] = {
    ...next.steps[step],
    status: "stale",
    updatedAt: nowIso
  };

  const downstream = PLANNING_STEPS.slice(PLANNING_STEPS.indexOf(step) + 1);
  for (const downstreamStep of downstream) {
    next.steps[downstreamStep] = {
      ...next.steps[downstreamStep],
      status: "locked"
    };
  }

  next.activeStep = getResumeStep(next);
  return next;
};

export const getArtifactStepFromSpecType = (type: InitiativeArtifactStep): InitiativePlanningStep => type;

export const setWorkflowResumeTicket = (
  workflow: InitiativeWorkflow,
  ticketId: string | null,
): InitiativeWorkflow => {
  const next = createWorkflowDraft(workflow);
  next.resumeTicketId = ticketId;
  return next;
};
