import type { FastifyInstance } from "fastify";
import { PlannerService } from "../../planner/planner-service.js";
import type { ArtifactStore } from "../../store/artifact-store.js";
import { startSseSession } from "../sse/session.js";

export interface RegisterInitiativeRoutesOptions {
  plannerService: PlannerService;
  store: ArtifactStore;
}

export const registerInitiativeRoutes = (
  app: FastifyInstance,
  options: RegisterInitiativeRoutesOptions
): void => {
  const { plannerService, store } = options;

  app.get("/api/initiatives", async (_request, reply) => {
    await reply.send({ initiatives: Array.from(store.initiatives.values()) });
  });

  app.patch("/api/initiatives/:id", async (request, reply) => {
    const initiativeId = (request.params as { id: string }).id;
    const initiative = store.initiatives.get(initiativeId);
    if (!initiative) {
      await reply.code(404).send({ error: "Not Found", message: `Initiative ${initiativeId} not found` });
      return;
    }

    const body = (request.body ?? {}) as Partial<{
      title: string;
      description: string;
      phases: Array<{ id: string; name: string; order: number; status: "active" | "complete" }>;
    }>;

    const updated = {
      ...initiative,
      title: body.title ?? initiative.title,
      description: body.description ?? initiative.description,
      phases: body.phases ?? initiative.phases,
      updatedAt: new Date().toISOString()
    };

    await store.upsertInitiative(updated);
    await reply.send({ initiative: updated });
  });

  app.put("/api/initiatives/:id/specs", async (request, reply) => {
    const initiativeId = (request.params as { id: string }).id;
    const initiative = store.initiatives.get(initiativeId);
    if (!initiative) {
      await reply.code(404).send({ error: "Not Found", message: `Initiative ${initiativeId} not found` });
      return;
    }

    const body = (request.body ?? {}) as Partial<{
      briefMarkdown: string;
      prdMarkdown: string;
      techSpecMarkdown: string;
    }>;

    const brief = body.briefMarkdown ?? store.specs.get(`${initiative.id}:brief`)?.content ?? "";
    const prd = body.prdMarkdown ?? store.specs.get(`${initiative.id}:prd`)?.content ?? "";
    const techSpec = body.techSpecMarkdown ?? store.specs.get(`${initiative.id}:tech-spec`)?.content ?? "";

    const updated = {
      ...initiative,
      updatedAt: new Date().toISOString()
    };

    await store.upsertInitiative(updated, {
      brief,
      prd,
      techSpec
    });

    await reply.send({
      initiative: updated,
      specs: {
        briefMarkdown: brief,
        prdMarkdown: prd,
        techSpecMarkdown: techSpec
      }
    });
  });

  app.post("/api/initiatives", async (request, reply) => {
    const body = (request.body ?? {}) as { description?: string };

    if (!body.description?.trim()) {
      await reply.code(400).send({ error: "Bad Request", message: "description is required" });
      return;
    }

    const sse = startSseSession(request, reply, "planner-ready");

    try {
      const result = await plannerService.runClarifyJob(
        { description: body.description },
        async (chunk) => sse.send("planner-token", { chunk })
      );

      sse.send("planner-result", {
        initiativeId: result.initiative.id,
        questions: result.questions
      });
      sse.send("planner-complete", { ok: true });
    } catch (error) {
      const structured = plannerService.toStructuredError(error);
      sse.send("planner-error", structured);
    } finally {
      sse.close();
    }
  });

  app.post("/api/initiatives/:id/generate-specs", async (request, reply) => {
    const initiativeId = (request.params as { id: string }).id;
    const body = (request.body ?? {}) as { answers?: Record<string, string | string[] | boolean> };
    const answers = body.answers ?? {};

    const sse = startSseSession(request, reply, "planner-spec-gen-ready");

    try {
      const result = await plannerService.runSpecGenJob(
        {
          initiativeId,
          answers
        },
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

  app.post("/api/initiatives/:id/generate-plan", async (request, reply) => {
    const initiativeId = (request.params as { id: string }).id;
    const sse = startSseSession(request, reply, "planner-plan-ready");

    try {
      const result = await plannerService.runPlanJob(
        {
          initiativeId
        },
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

  app.get("/api/planner/stream", (request, reply) => {
    startSseSession(request, reply, "planner-ready");
  });
};
