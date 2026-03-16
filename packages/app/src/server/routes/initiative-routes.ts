import type { FastifyInstance, FastifyReply } from "fastify";
import {
  BRIEF_CONSULTATION_REQUIRED_MESSAGE,
  requiresInitialBriefConsultation
} from "../../planner/brief-consultation.js";
import {
  REVIEW_KIND_LABELS,
  getReviewsRequiredBeforeStep,
  isReviewResolved
} from "../../planner/planning-reviews.js";
import {
  PLANNING_STEP_LABELS,
  REVIEW_KINDS
} from "../../planner/workflow-contract.js";
import {
  canEditStep,
  completeWorkflowStep,
  getRefinementAssumptions,
  invalidateWorkflowFromStep,
  updateRefinementState
} from "../../planner/workflow-state.js";
import type { ArtifactStore } from "../../store/artifact-store.js";
import type {
  Initiative,
  InitiativeArtifactStep,
  InitiativePlanningStep,
  PlanningReviewArtifact,
  PlanningReviewKind
} from "../../types/entities.js";
import { startSseSession } from "../sse/session.js";
import { isValidEntityId } from "../validation.js";

type ArtifactStep = InitiativeArtifactStep;

export interface RegisterInitiativeRoutesOptions {
  plannerService: {
    createDraftInitiative: (input: { description: string }) => Promise<Initiative>;
    runPhaseCheckJob: (
      input: { initiativeId: string; step: ArtifactStep },
      onToken?: (chunk: string) => Promise<void>
    ) => Promise<{
      decision: "proceed" | "ask";
      questions: Initiative["workflow"]["refinements"]["brief"]["questions"];
      assumptions: string[];
    }>;
    runClarificationHelpJob: (
      input: { initiativeId: string; questionId: string; note?: string },
      onToken?: (chunk: string) => Promise<void>
    ) => Promise<{ guidance: string }>;
    runBriefJob: (
      input: { initiativeId: string },
      onToken?: (chunk: string) => Promise<void>
    ) => Promise<{ markdown: string; reviews: PlanningReviewArtifact[] }>;
    runCoreFlowsJob: (
      input: { initiativeId: string },
      onToken?: (chunk: string) => Promise<void>
    ) => Promise<{ markdown: string; reviews: PlanningReviewArtifact[] }>;
    runPrdJob: (
      input: { initiativeId: string },
      onToken?: (chunk: string) => Promise<void>
    ) => Promise<{ markdown: string; reviews: PlanningReviewArtifact[] }>;
    runTechSpecJob: (
      input: { initiativeId: string },
      onToken?: (chunk: string) => Promise<void>
    ) => Promise<{ markdown: string; reviews: PlanningReviewArtifact[] }>;
    runPlanningReviewJob: (
      input: { initiativeId: string; kind: PlanningReviewKind },
      onToken?: (chunk: string) => Promise<void>
    ) => Promise<PlanningReviewArtifact>;
    overridePlanningReview: (input: {
      initiativeId: string;
      kind: PlanningReviewKind;
      reason: string;
    }) => Promise<PlanningReviewArtifact>;
    runPlanJob: (
      input: { initiativeId: string },
      onToken?: (chunk: string) => Promise<void>
    ) => Promise<{ phases: unknown[] }>;
    markPlanningArtifactsStale: (initiativeId: string, step: ArtifactStep) => Promise<void>;
    toStructuredError: (error: unknown) => { code: string; message: string; statusCode: number };
  };
  store: ArtifactStore;
}

const SPEC_STEP_TYPES: ArtifactStep[] = ["brief", "core-flows", "prd", "tech-spec"];
const readInitiativeOrReply = async (
  store: ArtifactStore,
  initiativeId: string,
  reply: FastifyReply
): Promise<Initiative | null> => {
  if (!isValidEntityId(initiativeId)) {
    await reply.code(400).send({ error: "Bad Request", message: "Invalid initiative ID format" });
    return null;
  }

  const initiative = store.initiatives.get(initiativeId);
  if (!initiative) {
    await reply.code(404).send({ error: "Not Found", message: `Initiative ${initiativeId} not found` });
    return null;
  }

  return initiative;
};

const stepLabel = (step: InitiativePlanningStep): string => PLANNING_STEP_LABELS[step];

const canReplacePlanningTickets = (initiative: Initiative, store: ArtifactStore): boolean => {
  const initiativeTickets = Array.from(store.tickets.values()).filter((ticket) => ticket.initiativeId === initiative.id);
  return initiativeTickets.every(
    (ticket) => (ticket.status === "backlog" || ticket.status === "ready") && ticket.runId === null
  );
};

const replacePlanningTickets = async (initiative: Initiative, store: ArtifactStore): Promise<void> => {
  const initiativeTickets = Array.from(store.tickets.values()).filter((ticket) => ticket.initiativeId === initiative.id);
  for (const ticket of initiativeTickets) {
    await store.deleteTicket(ticket.id);
  }
};

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

const blocksInitialBriefGeneration = (initiative: Initiative, store: ArtifactStore): boolean =>
  requiresInitialBriefConsultation({
    initiative,
    briefMarkdown: store.specs.get(`${initiative.id}:brief`)?.content ?? ""
  });

const getBlockingReview = (
  initiativeId: string,
  step: InitiativePlanningStep,
  store: ArtifactStore
): PlanningReviewKind | null => {
  for (const kind of getReviewsRequiredBeforeStep(step)) {
    const review = store.planningReviews.get(`${initiativeId}:${kind}`);
    if (!review || !isReviewResolved(review.status)) {
      return kind;
    }
  }

  return null;
};

const requireResolvedReviewsOrReply = async (
  initiative: Initiative,
  step: InitiativePlanningStep,
  store: ArtifactStore,
  reply: FastifyReply
): Promise<boolean> => {
  const blockingReview = getBlockingReview(initiative.id, step, store);
  if (!blockingReview) {
    return true;
  }

  await reply.code(409).send({
    error: "Blocked",
    message: `${stepLabel(step)} is not ready until "${REVIEW_KIND_LABELS[blockingReview]}" is resolved`
  });
  return false;
};

export const registerInitiativeRoutes = (
  app: FastifyInstance,
  options: RegisterInitiativeRoutesOptions
): void => {
  const { plannerService, store } = options;

  app.get("/api/initiatives", async (_request, reply) => {
    await reply.send({ initiatives: Array.from(store.initiatives.values()) });
  });

  app.delete("/api/initiatives/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const initiative = await readInitiativeOrReply(store, id, reply);
    if (!initiative) {
      return;
    }

    await store.deleteInitiative(initiative.id);
    await reply.code(204).send();
  });

  app.patch("/api/initiatives/:id", async (request, reply) => {
    const initiativeId = (request.params as { id: string }).id;
    const initiative = await readInitiativeOrReply(store, initiativeId, reply);
    if (!initiative) {
      return;
    }

    const body = (request.body ?? {}) as Partial<{
      title: string;
      description: string;
      phases: Array<{ id: string; name: string; order: number; status: "active" | "complete" }>;
    }>;

    const nextDescription = body.description ?? initiative.description;
    const descriptionChanged = nextDescription !== initiative.description;
    const nowIso = new Date().toISOString();
    const updated = {
      ...initiative,
      title: body.title ?? initiative.title,
      description: nextDescription,
      phases: body.phases ?? initiative.phases,
      workflow: descriptionChanged ? invalidateWorkflowFromStep(initiative.workflow, "brief") : initiative.workflow,
      updatedAt: nowIso
    };

    await store.upsertInitiative(updated);
    if (descriptionChanged) {
      await plannerService.markPlanningArtifactsStale(initiative.id, "brief");
    }
    await reply.send({ initiative: updated });
  });

  app.patch("/api/initiatives/:id/refinement/:step", async (request, reply) => {
    const params = request.params as { id: string; step: string };
    const initiative = await readInitiativeOrReply(store, params.id, reply);
    if (!initiative) {
      return;
    }

    if (!SPEC_STEP_TYPES.includes(params.step as ArtifactStep)) {
      await reply.code(400).send({ error: "Bad Request", message: "Unsupported refinement step" });
      return;
    }

    const step = params.step as ArtifactStep;
    const body = (request.body ?? {}) as {
      answers?: Record<string, string | string[] | boolean>;
      defaultAnswerQuestionIds?: string[];
    };

    const nowIso = new Date().toISOString();
    const updated = {
      ...initiative,
      workflow: updateRefinementState(initiative.workflow, step, {
        answers: body.answers && typeof body.answers === "object" ? body.answers : {},
        defaultAnswerQuestionIds: Array.isArray(body.defaultAnswerQuestionIds) ? body.defaultAnswerQuestionIds : [],
        checkedAt: initiative.workflow.refinements[step].checkedAt ?? nowIso
      }),
      updatedAt: nowIso
    };

    await store.upsertInitiative(updated);
    await reply.send({
      initiative: updated,
      assumptions: getRefinementAssumptions(updated.workflow, step)
    });
  });

  app.post("/api/initiatives/:id/refinement/help", async (request, reply) => {
    const initiativeId = (request.params as { id: string }).id;
    const initiative = await readInitiativeOrReply(store, initiativeId, reply);
    if (!initiative) {
      return;
    }

    const body = (request.body ?? {}) as { questionId?: string; note?: string };
    if (!body.questionId?.trim()) {
      await reply.code(400).send({ error: "Bad Request", message: "questionId is required" });
      return;
    }

    try {
      const result = await plannerService.runClarificationHelpJob({
        initiativeId: initiative.id,
        questionId: body.questionId.trim(),
        note: body.note
      });
      await reply.send(result);
    } catch (error) {
      const structured = plannerService.toStructuredError(error);
      await reply.code(structured.statusCode).send(structured);
    }
  });

  app.put("/api/initiatives/:id/specs/:type", async (request, reply) => {
    const params = request.params as { id: string; type: string };
    const initiative = await readInitiativeOrReply(store, params.id, reply);
    if (!initiative) {
      return;
    }

    if (!SPEC_STEP_TYPES.includes(params.type as ArtifactStep)) {
      await reply.code(400).send({ error: "Bad Request", message: "Unsupported spec type" });
      return;
    }

    const step = params.type as ArtifactStep;
    if (!canEditStep(initiative.workflow, step)) {
      await reply.code(409).send({
        error: "Blocked",
        message: `${stepLabel(step)} is not ready until the previous phase is done`
      });
      return;
    }

    if (!(await requireResolvedReviewsOrReply(initiative, step, store, reply))) {
      return;
    }

    const body = (request.body ?? {}) as { content?: string };
    const content = body.content?.trim() ?? "";
    if (!content) {
      await reply.code(400).send({ error: "Bad Request", message: "content is required" });
      return;
    }

    const nowIso = new Date().toISOString();
    const updated = {
      ...initiative,
      status: "active" as const,
      specIds: uniqueIds([...initiative.specIds, `${initiative.id}:${step}`]),
      workflow: completeWorkflowStep(initiative.workflow, step, nowIso),
      updatedAt: nowIso
    };

    await store.upsertInitiative(updated, {
      brief: step === "brief" ? content : undefined,
      coreFlows: step === "core-flows" ? content : undefined,
      prd: step === "prd" ? content : undefined,
      techSpec: step === "tech-spec" ? content : undefined
    });
    await plannerService.markPlanningArtifactsStale(initiative.id, step);

    await reply.send({
      initiative: updated,
      spec: {
        type: step,
        content
      }
    });
  });

  app.post("/api/initiatives", async (request, reply) => {
    const body = (request.body ?? {}) as { description?: string };
    if (!body.description?.trim()) {
      await reply.code(400).send({ error: "Bad Request", message: "description is required" });
      return;
    }

    const initiative = await plannerService.createDraftInitiative({ description: body.description.trim() });
    await reply.code(201).send({ initiativeId: initiative.id });
  });

  const registerPhaseCheck = (path: string, step: ArtifactStep): void => {
    app.post(path, async (request, reply) => {
      const initiativeId = (request.params as { id: string }).id;
      const initiative = await readInitiativeOrReply(store, initiativeId, reply);
      if (!initiative) {
        return;
      }

      if (!canEditStep(initiative.workflow, step)) {
        await reply.code(409).send({
          error: "Blocked",
          message: `${stepLabel(step)} is not ready until the previous phase is done`
        });
        return;
      }

      if (!(await requireResolvedReviewsOrReply(initiative, step, store, reply))) {
        return;
      }

      try {
        const result = await plannerService.runPhaseCheckJob({ initiativeId, step });
        await reply.send(result);
      } catch (error) {
        const structured = plannerService.toStructuredError(error);
        await reply.code(structured.statusCode).send(structured);
      }
    });
  };

  registerPhaseCheck("/api/initiatives/:id/brief-check", "brief");
  registerPhaseCheck("/api/initiatives/:id/core-flows-check", "core-flows");
  registerPhaseCheck("/api/initiatives/:id/prd-check", "prd");
  registerPhaseCheck("/api/initiatives/:id/tech-spec-check", "tech-spec");

  const registerPhaseGenerator = (
    path: string,
    step: ArtifactStep,
    run: (
      initiativeId: string,
      onToken?: (chunk: string) => Promise<void>
    ) => Promise<{ markdown: string; reviews: PlanningReviewArtifact[] }>
  ): void => {
    app.post(path, async (request, reply) => {
      const initiativeId = (request.params as { id: string }).id;
      const initiative = await readInitiativeOrReply(store, initiativeId, reply);
      if (!initiative) {
        return;
      }

      if (!canEditStep(initiative.workflow, step)) {
        await reply.code(409).send({
          error: "Blocked",
          message: `${stepLabel(step)} is not ready until the previous phase is done`
        });
        return;
      }

      if (!(await requireResolvedReviewsOrReply(initiative, step, store, reply))) {
        return;
      }

      if (!hasCheckedPhase(initiative, step)) {
        await reply.code(409).send({
          error: "Blocked",
          message: `Run ${stepLabel(step)} checks before creating this artifact`
        });
        return;
      }

      if (step === "brief" && blocksInitialBriefGeneration(initiative, store)) {
        const hasPendingBriefQuestions = initiative.workflow.refinements.brief.questions.length > 0;
        await reply.code(409).send({
          error: "Blocked",
          message: hasPendingBriefQuestions
            ? `Answer or defer all ${stepLabel(step)} questions before continuing`
            : BRIEF_CONSULTATION_REQUIRED_MESSAGE
        });
        return;
      }

      if (!hasResolvedRefinementQuestions(initiative, step)) {
        await reply.code(409).send({
          error: "Blocked",
          message: `Answer or defer all ${stepLabel(step)} questions before continuing`
        });
        return;
      }

      const sse = startSseSession(request, reply, `planner-${step}-ready`);
      try {
        const result = await run(initiativeId, async (chunk) => sse.send("planner-token", { chunk }));
        sse.send("planner-result", result);
        sse.send("planner-complete", { ok: true });
      } catch (error) {
        const structured = plannerService.toStructuredError(error);
        sse.send("planner-error", structured);
      } finally {
        sse.close();
      }
    });
  };

  registerPhaseGenerator("/api/initiatives/:id/generate-brief", "brief", (initiativeId, onToken) =>
    plannerService.runBriefJob({ initiativeId }, onToken)
  );
  registerPhaseGenerator("/api/initiatives/:id/generate-core-flows", "core-flows", (initiativeId, onToken) =>
    plannerService.runCoreFlowsJob({ initiativeId }, onToken)
  );
  registerPhaseGenerator("/api/initiatives/:id/generate-prd", "prd", (initiativeId, onToken) =>
    plannerService.runPrdJob({ initiativeId }, onToken)
  );
  registerPhaseGenerator("/api/initiatives/:id/generate-tech-spec", "tech-spec", (initiativeId, onToken) =>
    plannerService.runTechSpecJob({ initiativeId }, onToken)
  );

  app.post("/api/initiatives/:id/reviews/:kind/run", async (request, reply) => {
    const params = request.params as { id: string; kind: string };
    const initiative = await readInitiativeOrReply(store, params.id, reply);
    if (!initiative) {
      return;
    }

    if (!REVIEW_KINDS.includes(params.kind as PlanningReviewKind)) {
      await reply.code(400).send({ error: "Bad Request", message: "Unsupported review kind" });
      return;
    }

    const kind = params.kind as PlanningReviewKind;
    const sse = startSseSession(request, reply, `planner-review-${kind}-ready`);
    try {
      const result = await plannerService.runPlanningReviewJob(
        { initiativeId: initiative.id, kind },
        async (chunk) => sse.send("planner-token", { chunk })
      );
      sse.send("planner-result", result);
      sse.send("planner-complete", { ok: true });
    } catch (error) {
      const structured = plannerService.toStructuredError(error);
      sse.send("planner-error", structured);
    } finally {
      sse.close();
    }
  });

  app.post("/api/initiatives/:id/reviews/:kind/override", async (request, reply) => {
    const params = request.params as { id: string; kind: string };
    const initiative = await readInitiativeOrReply(store, params.id, reply);
    if (!initiative) {
      return;
    }

    if (!REVIEW_KINDS.includes(params.kind as PlanningReviewKind)) {
      await reply.code(400).send({ error: "Bad Request", message: "Unsupported review kind" });
      return;
    }

    const body = (request.body ?? {}) as { reason?: string };
    const reason = body.reason?.trim() ?? "";
    if (!reason) {
      await reply.code(400).send({ error: "Bad Request", message: "reason is required" });
      return;
    }

    try {
      const review = await plannerService.overridePlanningReview({
        initiativeId: initiative.id,
        kind: params.kind as PlanningReviewKind,
        reason
      });
      await reply.send({ review });
    } catch (error) {
      const structured = plannerService.toStructuredError(error);
      await reply.code(structured.statusCode).send(structured);
    }
  });

  app.post("/api/initiatives/:id/generate-plan", async (request, reply) => {
    const initiativeId = (request.params as { id: string }).id;
    const initiative = await readInitiativeOrReply(store, initiativeId, reply);
    if (!initiative) {
      return;
    }

    if (!canEditStep(initiative.workflow, "tickets")) {
      await reply.code(409).send({
        error: "Blocked",
        message: "Tickets are not ready until the tech spec is done"
      });
      return;
    }

    if (!(await requireResolvedReviewsOrReply(initiative, "tickets", store, reply))) {
      return;
    }

    const ticketsStatus = initiative.workflow.steps.tickets.status;
    if (ticketsStatus === "complete") {
      await reply.code(409).send({
        error: "Blocked",
        message: "Tickets already exist for this initiative"
      });
      return;
    }

    if (ticketsStatus === "stale") {
      if (!canReplacePlanningTickets(initiative, store)) {
        await reply.code(409).send({
          error: "Blocked",
          message: "This initiative needs review before tickets can be replanned because work has already started"
        });
        return;
      }

      await replacePlanningTickets(initiative, store);
      await store.upsertInitiative({
        ...initiative,
        phases: [],
        ticketIds: [],
        updatedAt: new Date().toISOString()
      });
    }

    const sse = startSseSession(request, reply, "planner-plan-ready");
    try {
      const result = await plannerService.runPlanJob({ initiativeId }, async (chunk) =>
        sse.send("planner-token", { chunk })
      );
      sse.send("planner-result", result);
      sse.send("planner-complete", { ok: true });
    } catch (error) {
      const structured = plannerService.toStructuredError(error);
      sse.send("planner-error", structured);
    } finally {
      sse.close();
    }
  });
};
