import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createDraftInitiative,
  deleteInitiative,
  generateInitiativeArtifact,
  generateInitiativePlan,
  listInitiatives,
  overrideInitiativeReview,
  requestInitiativeClarificationHelp,
  runInitiativePhaseCheck,
  runInitiativeReview,
  saveInitiativeRefinement,
  saveInitiativeSpec,
  validateInitiativeArtifactGeneration,
  validateInitiativePlanGeneration,
  updateInitiative
} from "../../runtime/handlers/initiative-handlers.js";
import { isHandlerError } from "../../runtime/errors.js";
import { sendHandlerError } from "../../runtime/handlers/shared.js";
import type { ProgressSink, SpecFlowRuntime } from "../../runtime/types.js";
import type { InitiativeArtifactStep, InitiativePlanningSurface, PlanningReviewKind } from "../../types/entities.js";
import { startSseSession } from "../sse/session.js";

export interface RegisterInitiativeRoutesOptions {
  runtime: SpecFlowRuntime;
}

const sendPlannerSse = async <T>(
  request: FastifyRequest,
  reply: FastifyReply,
  readyEvent: string,
  run: (onToken: ProgressSink, signal: AbortSignal) => Promise<T>
): Promise<void> => {
  const sse = startSseSession(request, reply, readyEvent);
  const controller = new AbortController();
  request.raw.once("close", () => controller.abort());
  try {
    const result = await run(async (chunk) => {
      sse.send("planner-token", { chunk });
    }, controller.signal);
    sse.send("planner-result", result);
    sse.send("planner-complete", { ok: true });
  } catch (error) {
    if (isHandlerError(error)) {
      sse.send("planner-error", error.shape.response);
    } else {
      throw error;
    }
  } finally {
    sse.close();
  }
};

export const registerInitiativeRoutes = (
  app: FastifyInstance,
  options: RegisterInitiativeRoutesOptions
): void => {
  const { runtime } = options;
  const getRequestAbortSignal = (request: FastifyRequest): AbortSignal => {
    const controller = new AbortController();
    request.raw.once("close", () => controller.abort());
    return controller.signal;
  };

  app.get("/api/initiatives", async (_request, reply) => {
    await reply.send(listInitiatives(runtime));
  });

  app.delete("/api/initiatives/:id", async (request, reply) => {
    try {
      await deleteInitiative(runtime, (request.params as { id: string }).id);
      await reply.code(204).send();
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });

  app.patch("/api/initiatives/:id", async (request, reply) => {
    try {
      await reply.send(
        await updateInitiative(
          runtime,
          (request.params as { id: string }).id,
          (request.body ?? {}) as Partial<{
            title: string;
            description: string;
            phases: Array<{ id: string; name: string; order: number; status: "active" | "complete" }>;
            resumeTicketId: string | null;
          }>
        )
      );
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });

  app.patch("/api/initiatives/:id/refinement/:step", async (request, reply) => {
    try {
      await reply.send(
        await saveInitiativeRefinement(
          runtime,
          (request.params as { id: string }).id,
          (request.params as { step: string }).step,
          (request.body ?? {}) as {
            answers?: Record<string, string | string[] | boolean>;
            defaultAnswerQuestionIds?: string[];
            preferredSurface?: InitiativePlanningSurface | null;
          }
        )
      );
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });

  app.post("/api/initiatives/:id/refinement/help", async (request, reply) => {
    try {
      await reply.send(
        await requestInitiativeClarificationHelp(
          runtime,
          (request.params as { id: string }).id,
          (request.body ?? {}) as { questionId?: string; note?: string },
          getRequestAbortSignal(request),
        )
      );
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });

  app.put("/api/initiatives/:id/specs/:type", async (request, reply) => {
    try {
      await reply.send(
        await saveInitiativeSpec(
          runtime,
          (request.params as { id: string }).id,
          (request.params as { type: string }).type,
          (request.body ?? {}) as { content?: string }
        )
      );
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });

  app.post("/api/initiatives", async (request, reply) => {
    try {
      await reply.code(201).send(await createDraftInitiative(runtime, (request.body ?? {}) as { description?: string }));
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });

  const registerPhaseCheck = (path: string, step: InitiativeArtifactStep): void => {
    app.post(path, async (request, reply) => {
      try {
        await reply.send(
          await runInitiativePhaseCheck(
            runtime,
            (request.params as { id: string }).id,
            step,
            getRequestAbortSignal(request),
          ),
        );
      } catch (error) {
        if (isHandlerError(error)) {
          await sendHandlerError(reply, error);
          return;
        }

        throw error;
      }
    });
  };

  registerPhaseCheck("/api/initiatives/:id/brief-check", "brief");
  registerPhaseCheck("/api/initiatives/:id/core-flows-check", "core-flows");
  registerPhaseCheck("/api/initiatives/:id/prd-check", "prd");
  registerPhaseCheck("/api/initiatives/:id/tech-spec-check", "tech-spec");

  const registerPhaseGenerator = (path: string, step: InitiativeArtifactStep): void => {
    app.post(path, async (request, reply) => {
      try {
        validateInitiativeArtifactGeneration(runtime, (request.params as { id: string }).id, step);
      } catch (error) {
        if (isHandlerError(error)) {
          await sendHandlerError(reply, error);
          return;
        }

        throw error;
      }

      await sendPlannerSse(request, reply, `planner-${step}-ready`, (onToken, signal) =>
        generateInitiativeArtifact(runtime, (request.params as { id: string }).id, step, onToken, signal)
      );
    });
  };

  registerPhaseGenerator("/api/initiatives/:id/generate-brief", "brief");
  registerPhaseGenerator("/api/initiatives/:id/generate-core-flows", "core-flows");
  registerPhaseGenerator("/api/initiatives/:id/generate-prd", "prd");
  registerPhaseGenerator("/api/initiatives/:id/generate-tech-spec", "tech-spec");

  app.post("/api/initiatives/:id/reviews/:kind/run", async (request, reply) => {
    await sendPlannerSse(request, reply, `planner-review-${(request.params as { kind: string }).kind}-ready`, (onToken, signal) =>
      runInitiativeReview(
        runtime,
        (request.params as { id: string }).id,
        (request.params as { kind: string }).kind,
        onToken,
        signal,
      )
    );
  });

  app.post("/api/initiatives/:id/reviews/:kind/override", async (request, reply) => {
    try {
      await reply.send(
        await overrideInitiativeReview(
          runtime,
          (request.params as { id: string }).id,
          (request.params as { kind: PlanningReviewKind }).kind,
          (request.body ?? {}) as { reason?: string }
        )
      );
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }
  });

  app.post("/api/initiatives/:id/generate-plan", async (request, reply) => {
    try {
      validateInitiativePlanGeneration(runtime, (request.params as { id: string }).id);
    } catch (error) {
      if (isHandlerError(error)) {
        await sendHandlerError(reply, error);
        return;
      }

      throw error;
    }

    await sendPlannerSse(request, reply, "planner-plan-ready", (onToken, signal) =>
      generateInitiativePlan(runtime, (request.params as { id: string }).id, onToken, signal)
    );
  });
};
