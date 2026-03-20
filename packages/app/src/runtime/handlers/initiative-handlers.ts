import {
  BRIEF_CONSULTATION_REQUIRED_MESSAGE,
  requiresInitialBriefConsultation
} from "../../planner/brief-consultation.js";
import {
  canEditStep,
  completeWorkflowStep,
  getRefinementAssumptions,
  invalidateWorkflowFromStep,
  setWorkflowResumeTicket,
  updateRefinementState
} from "../../planner/workflow-state.js";
import type {
  Initiative,
  InitiativeArtifactStep,
  InitiativePlanningSurface,
  PlanningReviewArtifact,
} from "../../types/entities.js";
import type { ProgressSink, SpecFlowRuntime } from "../types.js";
import { badRequest, conflict } from "../errors.js";
import {
  readInitiative,
  requirePlanningReviewKind,
  stepLabel,
  structuredPlannerError
} from "./shared.js";

type ArtifactStep = InitiativeArtifactStep;

const SPEC_STEP_TYPES: ArtifactStep[] = ["brief", "core-flows", "prd", "tech-spec"];

const uniqueIds = (values: string[]): string[] => Array.from(new Set(values));

const hasResolvedRefinementQuestions = (initiative: Initiative, step: ArtifactStep): boolean => {
  const refinement = initiative.workflow.refinements[step];
  return refinement.questions.every((question) => {
    const answer = refinement.answers[question.id];
    const hasAnswer =
      typeof answer === "boolean" ||
      (typeof answer === "string" && answer.trim().length > 0) ||
      (Array.isArray(answer) && answer.some((value) => value.trim().length > 0));

    return hasAnswer || refinement.defaultAnswerQuestionIds.includes(question.id);
  });
};

const hasCheckedPhase = (initiative: Initiative, step: ArtifactStep): boolean =>
  initiative.workflow.refinements[step].checkedAt !== null ||
  Boolean(initiative.specIds.includes(`${initiative.id}:${step}`));

const blocksInitialBriefGeneration = (runtime: SpecFlowRuntime, initiative: Initiative): boolean =>
  requiresInitialBriefConsultation({
    initiative,
    briefMarkdown: runtime.store.specs.has(`${initiative.id}:brief`) ? "(existing brief)" : ""
  });

const canReplacePlanningTickets = (runtime: SpecFlowRuntime, initiative: Initiative): boolean => {
  const initiativeTickets = Array.from(runtime.store.tickets.values()).filter((ticket) => ticket.initiativeId === initiative.id);
  return initiativeTickets.every(
    (ticket) => (ticket.status === "backlog" || ticket.status === "ready") && ticket.runId === null
  );
};

export const listInitiatives = (runtime: SpecFlowRuntime) => ({
  initiatives: Array.from(runtime.store.initiatives.values())
});

export const deleteInitiative = async (runtime: SpecFlowRuntime, initiativeId: string) => {
  const initiative = readInitiative(runtime, initiativeId);
  await runtime.store.deleteInitiative(initiative.id);
};

export const updateInitiative = async (
  runtime: SpecFlowRuntime,
  initiativeId: string,
  body: Partial<{
    title: string;
    description: string;
    phases: Array<{ id: string; name: string; order: number; status: "active" | "complete" }>;
    resumeTicketId: string | null;
  }>
) => {
  const initiative = readInitiative(runtime, initiativeId);
  const nextDescription = body.description ?? initiative.description;
  const descriptionChanged = nextDescription !== initiative.description;
  const nextResumeTicketId =
    body.resumeTicketId === undefined
      ? undefined
      : typeof body.resumeTicketId === "string" && body.resumeTicketId.trim().length > 0
        ? body.resumeTicketId.trim()
        : null;
  if (nextResumeTicketId) {
    const resumeTicket = runtime.store.tickets.get(nextResumeTicketId);
    if (!resumeTicket || resumeTicket.initiativeId !== initiative.id) {
      throw badRequest("resumeTicketId must reference a ticket in this project");
    }
  }
  const nowIso = new Date().toISOString();
  const nextWorkflow = descriptionChanged ? invalidateWorkflowFromStep(initiative.workflow, "brief") : initiative.workflow;

  const updated = {
    ...initiative,
    title: body.title ?? initiative.title,
    description: nextDescription,
    phases: body.phases ?? initiative.phases,
    workflow:
      nextResumeTicketId !== undefined
        ? setWorkflowResumeTicket(nextWorkflow, nextResumeTicketId)
        : nextWorkflow,
    updatedAt: nowIso
  };

  await runtime.store.upsertInitiative(updated);
  if (descriptionChanged) {
    await runtime.plannerService.markPlanningArtifactsStale(initiative.id, "brief");
  }

  return {
    initiative: updated
  };
};

export const saveInitiativeRefinement = async (
  runtime: SpecFlowRuntime,
  initiativeId: string,
  step: string,
  body: {
    answers?: Record<string, string | string[] | boolean>;
    defaultAnswerQuestionIds?: string[];
    preferredSurface?: InitiativePlanningSurface | null;
  }
) => {
  const initiative = readInitiative(runtime, initiativeId);
  if (!SPEC_STEP_TYPES.includes(step as ArtifactStep)) {
    throw badRequest("Unsupported refinement step");
  }

  const artifactStep = step as ArtifactStep;
  const nowIso = new Date().toISOString();
  const updated = {
    ...initiative,
    workflow: updateRefinementState(initiative.workflow, artifactStep, {
      answers: body.answers && typeof body.answers === "object" ? body.answers : {},
      defaultAnswerQuestionIds: Array.isArray(body.defaultAnswerQuestionIds) ? body.defaultAnswerQuestionIds : [],
      preferredSurface: body.preferredSurface === "questions" || body.preferredSurface === "review"
        ? body.preferredSurface
        : null,
      checkedAt: initiative.workflow.refinements[artifactStep].checkedAt ?? nowIso
    }),
    updatedAt: nowIso
  };

  await runtime.store.upsertInitiative(updated);

  return {
    initiative: updated,
    assumptions: getRefinementAssumptions(updated.workflow, artifactStep)
  };
};

export const requestInitiativeClarificationHelp = async (
  runtime: SpecFlowRuntime,
  initiativeId: string,
  body: { questionId?: string; note?: string },
  signal?: AbortSignal
) => {
  const initiative = readInitiative(runtime, initiativeId);
  if (!body.questionId?.trim()) {
    throw badRequest("questionId is required");
  }

  try {
    return await runtime.plannerService.runClarificationHelpJob({
      initiativeId: initiative.id,
      questionId: body.questionId.trim(),
      note: body.note
    }, undefined, signal);
  } catch (error) {
    throw structuredPlannerError(runtime, error);
  }
};

export const saveInitiativeSpec = async (
  runtime: SpecFlowRuntime,
  initiativeId: string,
  type: string,
  body: { content?: string }
) => {
  const initiative = readInitiative(runtime, initiativeId);
  if (!SPEC_STEP_TYPES.includes(type as ArtifactStep)) {
    throw badRequest("Unsupported spec type");
  }

  const step = type as ArtifactStep;
  if (!canEditStep(initiative.workflow, step)) {
    throw conflict(`${stepLabel(step)} is not ready until the previous phase is done`);
  }

  const content = body.content?.trim() ?? "";
  if (!content) {
    throw badRequest("content is required");
  }

  const nowIso = new Date().toISOString();
  const updated = {
    ...initiative,
    status: "active" as const,
    specIds: uniqueIds([...initiative.specIds, `${initiative.id}:${step}`]),
    workflow: completeWorkflowStep(initiative.workflow, step, nowIso),
    updatedAt: nowIso
  };

  await runtime.store.upsertInitiative(updated, {
    brief: step === "brief" ? content : undefined,
    coreFlows: step === "core-flows" ? content : undefined,
    prd: step === "prd" ? content : undefined,
    techSpec: step === "tech-spec" ? content : undefined
  });
  await runtime.plannerService.markPlanningArtifactsStale(initiative.id, step);

  return {
    initiative: updated,
    spec: {
      type: step,
      content
    }
  };
};

export const createDraftInitiative = async (runtime: SpecFlowRuntime, body: { description?: string }) => {
  if (!body.description?.trim()) {
    throw badRequest("description is required");
  }

  const initiative = await runtime.plannerService.createDraftInitiative({ description: body.description.trim() });
  return {
    initiativeId: initiative.id
  };
};

export const runInitiativePhaseCheck = async (
  runtime: SpecFlowRuntime,
  initiativeId: string,
  step: ArtifactStep,
  body?: { validationFeedback?: string },
  signal?: AbortSignal
) => {
  const initiative = readInitiative(runtime, initiativeId);
  if (!canEditStep(initiative.workflow, step)) {
    throw conflict(`${stepLabel(step)} is not ready until the previous phase is done`);
  }

  try {
    return await runtime.plannerService.runPhaseCheckJob(
      {
        initiativeId,
        step,
        validationFeedback: body?.validationFeedback?.trim() || undefined,
      },
      undefined,
      signal
    );
  } catch (error) {
    throw structuredPlannerError(runtime, error);
  }
};

const runGenerator = async (
  runtime: SpecFlowRuntime,
  initiativeId: string,
  step: ArtifactStep,
  onToken: ProgressSink | undefined,
  run: (
    initiativeId: string,
    onToken?: ProgressSink
  ) => Promise<{ markdown: string; reviews: PlanningReviewArtifact[] }>
) => {
  const initiative = readInitiative(runtime, initiativeId);
  if (!canEditStep(initiative.workflow, step)) {
    throw conflict(`${stepLabel(step)} is not ready until the previous phase is done`);
  }

  if (!hasCheckedPhase(initiative, step)) {
    throw conflict(`Run ${stepLabel(step)} checks before creating this artifact`);
  }
  if (step === "brief" && blocksInitialBriefGeneration(runtime, initiative)) {
    const hasPendingBriefQuestions = initiative.workflow.refinements.brief.questions.length > 0;
    throw conflict(
      hasPendingBriefQuestions
        ? `Answer or defer all ${stepLabel(step)} questions before continuing`
        : BRIEF_CONSULTATION_REQUIRED_MESSAGE
    );
  }
  if (!hasResolvedRefinementQuestions(initiative, step)) {
    throw conflict(`Answer or defer all ${stepLabel(step)} questions before continuing`);
  }

  try {
    return await run(initiativeId, onToken);
  } catch (error) {
    throw structuredPlannerError(runtime, error);
  }
};

export const validateInitiativeArtifactGeneration = (
  runtime: SpecFlowRuntime,
  initiativeId: string,
  step: ArtifactStep
): void => {
  const initiative = readInitiative(runtime, initiativeId);
  if (!canEditStep(initiative.workflow, step)) {
    throw conflict(`${stepLabel(step)} is not ready until the previous phase is done`);
  }

  if (!hasCheckedPhase(initiative, step)) {
    throw conflict(`Run ${stepLabel(step)} checks before creating this artifact`);
  }
  if (step === "brief" && blocksInitialBriefGeneration(runtime, initiative)) {
    const hasPendingBriefQuestions = initiative.workflow.refinements.brief.questions.length > 0;
    throw conflict(
      hasPendingBriefQuestions
        ? `Answer or defer all ${stepLabel(step)} questions before continuing`
        : BRIEF_CONSULTATION_REQUIRED_MESSAGE
    );
  }
  if (!hasResolvedRefinementQuestions(initiative, step)) {
    throw conflict(`Answer or defer all ${stepLabel(step)} questions before continuing`);
  }
};

export const generateInitiativeArtifact = async (
  runtime: SpecFlowRuntime,
  initiativeId: string,
  step: ArtifactStep,
  onToken?: ProgressSink,
  signal?: AbortSignal
) => {
  validateInitiativeArtifactGeneration(runtime, initiativeId, step);

  if (step === "brief") {
    return runGenerator(runtime, initiativeId, step, onToken, (id, sink) =>
      runtime.plannerService.runBriefJob({ initiativeId: id }, sink, signal)
    );
  }
  if (step === "core-flows") {
    return runGenerator(runtime, initiativeId, step, onToken, (id, sink) =>
      runtime.plannerService.runCoreFlowsJob({ initiativeId: id }, sink, signal)
    );
  }
  if (step === "prd") {
    return runGenerator(runtime, initiativeId, step, onToken, (id, sink) =>
      runtime.plannerService.runPrdJob({ initiativeId: id }, sink, signal)
    );
  }

  return runGenerator(runtime, initiativeId, step, onToken, (id, sink) =>
    runtime.plannerService.runTechSpecJob({ initiativeId: id }, sink, signal)
  );
};

export const runInitiativeReview = async (
  runtime: SpecFlowRuntime,
  initiativeId: string,
  kind: string,
  onToken?: ProgressSink,
  signal?: AbortSignal
) => {
  const initiative = readInitiative(runtime, initiativeId);
  const reviewKind = requirePlanningReviewKind(kind);

  try {
    return await runtime.plannerService.runPlanningReviewJob(
      { initiativeId: initiative.id, kind: reviewKind },
      onToken,
      signal
    );
  } catch (error) {
    throw structuredPlannerError(runtime, error);
  }
};

export const validateInitiativePlanGeneration = (
  runtime: SpecFlowRuntime,
  initiativeId: string
): void => {
  const initiative = readInitiative(runtime, initiativeId);
  if (!canEditStep(initiative.workflow, "validation")) {
    throw conflict("Validation is not ready until the tech spec is done");
  }

  const validationStatus = initiative.workflow.steps.validation.status;
  const ticketsStatus = initiative.workflow.steps.tickets.status;
  if (validationStatus === "complete" && ticketsStatus === "complete") {
    throw conflict("Tickets already exist for this project");
  }

  if ((validationStatus === "stale" || ticketsStatus === "stale") && !canReplacePlanningTickets(runtime, initiative)) {
    throw conflict("This project needs review before tickets can be replanned because work has already started");
  }
};

export const overrideInitiativeReview = async (
  runtime: SpecFlowRuntime,
  initiativeId: string,
  kind: string,
  body: { reason?: string }
) => {
  const initiative = readInitiative(runtime, initiativeId);
  const reviewKind = requirePlanningReviewKind(kind);
  const reason = body.reason?.trim() ?? "";
  if (!reason) {
    throw badRequest("reason is required");
  }

  try {
    const review = await runtime.plannerService.overridePlanningReview({
      initiativeId: initiative.id,
      kind: reviewKind,
      reason
    });
    if (reviewKind === "ticket-coverage-review") {
      await runtime.plannerService.commitPendingPlan({ initiativeId: initiative.id });
    }

    return { review };
  } catch (error) {
    throw structuredPlannerError(runtime, error);
  }
};

export const generateInitiativePlan = async (
  runtime: SpecFlowRuntime,
  initiativeId: string,
  onToken?: ProgressSink,
  signal?: AbortSignal
) => {
  validateInitiativePlanGeneration(runtime, initiativeId);

  try {
    return await runtime.plannerService.runPlanJob({ initiativeId }, onToken, signal);
  } catch (error) {
    throw structuredPlannerError(runtime, error);
  }
};
