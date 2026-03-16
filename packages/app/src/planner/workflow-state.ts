import type {
  Initiative,
  InitiativeArtifactStep,
  InitiativePlanningStep,
  InitiativePlanningStepStatus,
  InitiativeRefinementState,
  InitiativeWorkflow,
  InitiativeWorkflowStep
} from "../types/entities.js";

export const PLANNING_STEPS: InitiativePlanningStep[] = ["brief", "core-flows", "prd", "tech-spec", "tickets"];
export const REFINEMENT_STEPS = ["brief", "core-flows", "prd", "tech-spec"] as const;

type RefinementStep = (typeof REFINEMENT_STEPS)[number];

const VALID_STEP_STATUS = new Set<InitiativePlanningStepStatus>(["locked", "ready", "complete", "stale"]);

const createStepState = (status: InitiativePlanningStepStatus): InitiativeWorkflowStep => ({
  status,
  updatedAt: null
});

const createRefinementState = (): InitiativeRefinementState => ({
  questions: [],
  answers: {},
  defaultAnswerQuestionIds: [],
  baseAssumptions: [],
  checkedAt: null
});

const isRefinementStep = (step: InitiativePlanningStep): step is RefinementStep =>
  REFINEMENT_STEPS.includes(step as RefinementStep);

export const createInitiativeWorkflow = (): InitiativeWorkflow => ({
  activeStep: "brief",
  steps: {
    brief: createStepState("ready"),
    "core-flows": createStepState("locked"),
    prd: createStepState("locked"),
    "tech-spec": createStepState("locked"),
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
  return normalized;
};

export const inferWorkflowFromArtifacts = (input: {
  hasBrief: boolean;
  hasCoreFlows: boolean;
  hasPrd: boolean;
  hasTechSpec: boolean;
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

  const requiresCoreFlowsBackfill = !input.hasCoreFlows && (input.hasPrd || input.hasTechSpec || input.hasTickets);
  if (requiresCoreFlowsBackfill) {
    workflow.steps["core-flows"].status = "stale";
    if (input.hasPrd) {
      workflow.steps.prd.status = "stale";
    }
    if (input.hasTechSpec) {
      workflow.steps["tech-spec"].status = "stale";
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

  if (input.hasTechSpec) {
    workflow.steps["tech-spec"].status = "complete";
  } else if (input.hasPrd) {
    workflow.steps["tech-spec"].status = "ready";
  }

  if (input.hasTickets) {
    workflow.steps.tickets.status = "complete";
  } else if (input.hasTechSpec) {
    workflow.steps.tickets.status = "ready";
  }

  workflow.activeStep = getResumeStep(workflow);
  return workflow;
};

export const getPrerequisiteStep = (step: InitiativePlanningStep): InitiativePlanningStep | null => {
  const index = PLANNING_STEPS.indexOf(step);
  if (index <= 0) {
    return null;
  }
  return PLANNING_STEPS[index - 1];
};

export const canEditStep = (workflow: InitiativeWorkflow, step: InitiativePlanningStep): boolean => {
  const prerequisite = getPrerequisiteStep(step);
  return prerequisite ? workflow.steps[prerequisite].status === "complete" : true;
};

const cloneRefinements = (workflow: InitiativeWorkflow): InitiativeWorkflow["refinements"] => ({
  brief: {
    ...workflow.refinements.brief,
    questions: [...workflow.refinements.brief.questions],
    answers: { ...workflow.refinements.brief.answers },
    defaultAnswerQuestionIds: [...workflow.refinements.brief.defaultAnswerQuestionIds],
    baseAssumptions: [...workflow.refinements.brief.baseAssumptions]
  },
  "core-flows": {
    ...workflow.refinements["core-flows"],
    questions: [...workflow.refinements["core-flows"].questions],
    answers: { ...workflow.refinements["core-flows"].answers },
    defaultAnswerQuestionIds: [...workflow.refinements["core-flows"].defaultAnswerQuestionIds],
    baseAssumptions: [...workflow.refinements["core-flows"].baseAssumptions]
  },
  prd: {
    ...workflow.refinements.prd,
    questions: [...workflow.refinements.prd.questions],
    answers: { ...workflow.refinements.prd.answers },
    defaultAnswerQuestionIds: [...workflow.refinements.prd.defaultAnswerQuestionIds],
    baseAssumptions: [...workflow.refinements.prd.baseAssumptions]
  },
  "tech-spec": {
    ...workflow.refinements["tech-spec"],
    questions: [...workflow.refinements["tech-spec"].questions],
    answers: { ...workflow.refinements["tech-spec"].answers },
    defaultAnswerQuestionIds: [...workflow.refinements["tech-spec"].defaultAnswerQuestionIds],
    baseAssumptions: [...workflow.refinements["tech-spec"].baseAssumptions]
  }
});

const createWorkflowDraft = (workflow: InitiativeWorkflow): InitiativeWorkflow => ({
  activeStep: workflow.activeStep,
  steps: {
    brief: { ...workflow.steps.brief },
    "core-flows": { ...workflow.steps["core-flows"] },
    prd: { ...workflow.steps.prd },
    "tech-spec": { ...workflow.steps["tech-spec"] },
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
  next.refinements[step] = {
    questions: input.questions ?? next.refinements[step].questions,
    answers: input.answers ?? next.refinements[step].answers,
    defaultAnswerQuestionIds: input.defaultAnswerQuestionIds ?? next.refinements[step].defaultAnswerQuestionIds,
    baseAssumptions: input.baseAssumptions ?? next.refinements[step].baseAssumptions,
    checkedAt: input.checkedAt ?? next.refinements[step].checkedAt
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

export const getArtifactStepFromSpecType = (type: InitiativeArtifactStep): InitiativePlanningStep => type;
