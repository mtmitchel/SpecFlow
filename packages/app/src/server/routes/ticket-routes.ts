import type { FastifyInstance } from "fastify";
import { BundleGenerator } from "../../bundle/bundle-generator.js";
import { PlannerService } from "../../planner/planner-service.js";
import type { ArtifactStore } from "../../store/artifact-store.js";
import { DiffEngine } from "../../verify/diff-engine.js";
import { VerifierService } from "../../verify/verifier-service.js";
import { startSseSession, type SseSession } from "../sse/session.js";

export interface RegisterTicketRoutesOptions {
  bundleGenerator: BundleGenerator;
  diffEngine: DiffEngine;
  plannerService: PlannerService;
  store: ArtifactStore;
  verifierService: VerifierService;
  broadcastVerificationEvent: (ticketId: string, event: string, payload: unknown) => void;
  verificationSubscribers: Map<string, Set<SseSession>>;
}

export const registerTicketRoutes = (app: FastifyInstance, options: RegisterTicketRoutesOptions): void => {
  const {
    bundleGenerator,
    diffEngine,
    plannerService,
    store,
    verifierService,
    broadcastVerificationEvent,
    verificationSubscribers
  } = options;

  app.get("/api/tickets", async (_request, reply) => {
    await reply.send({ tickets: Array.from(store.tickets.values()) });
  });

  app.patch("/api/tickets/:id", async (request, reply) => {
    const ticketId = (request.params as { id: string }).id;
    const ticket = store.tickets.get(ticketId);
    if (!ticket) {
      await reply.code(404).send({ error: "Not Found", message: `Ticket ${ticketId} not found` });
      return;
    }

    const body = (request.body ?? {}) as {
      status?: "backlog" | "ready" | "in-progress" | "verify" | "done";
      title?: string;
      description?: string;
    };

    const updated = {
      ...ticket,
      status: body.status ?? ticket.status,
      title: body.title ?? ticket.title,
      description: body.description ?? ticket.description,
      updatedAt: new Date().toISOString()
    };

    await store.upsertTicket(updated);
    await reply.send({ ticket: updated });
  });

  app.post("/api/tickets", async (request, reply) => {
    const body = (request.body ?? {}) as { description?: string };

    if (!body.description?.trim()) {
      await reply.code(400).send({ error: "Bad Request", message: "description is required" });
      return;
    }

    try {
      const triage = await plannerService.runTriageJob({ description: body.description });
      if (triage.decision === "too-large") {
        await reply.code(201).send({
          decision: triage.decision,
          reason: triage.reason,
          initiativeId: triage.initiative.id,
          initiativeTitle: triage.initiative.title
        });
        return;
      }

      await reply.code(201).send({
        decision: triage.decision,
        reason: triage.reason,
        ticketId: triage.ticket.id,
        ticketTitle: triage.ticket.title,
        acceptanceCriteria: triage.ticket.acceptanceCriteria,
        implementationPlan: triage.ticket.implementationPlan,
        fileTargets: triage.ticket.fileTargets
      });
    } catch (error) {
      const structured = plannerService.toStructuredError(error);
      await reply.code(structured.statusCode).send(structured);
    }
  });

  app.post("/api/tickets/:id/export-bundle", async (request, reply) => {
    const ticketId = (request.params as { id: string }).id;
    const body = (request.body ?? {}) as {
      agent?: "claude-code" | "codex-cli" | "opencode" | "generic";
      operationId?: string;
    };
    const agentTarget = body.agent ?? "codex-cli";

    try {
      const result = await bundleGenerator.exportBundle({
        ticketId,
        agentTarget,
        exportMode: "standard",
        operationId: body.operationId
      });

      await reply.code(201).send({
        runId: result.runId,
        attemptId: result.attemptId,
        bundlePath: result.bundlePath,
        flatString: result.flatString,
        manifest: result.manifest
      });
    } catch (error) {
      await reply.code(400).send({
        error: "Export Failed",
        message: (error as Error).message
      });
    }
  });

  app.post("/api/runs/:id/findings/:findingId/export-fix-bundle", async (request, reply) => {
    const params = request.params as { id: string; findingId: string };
    const run = store.runs.get(params.id);

    if (!run) {
      await reply.code(404).send({ error: "Not Found", message: `Run ${params.id} not found` });
      return;
    }

    if (!run.ticketId) {
      await reply.code(400).send({ error: "Bad Request", message: "Run is not linked to a ticket" });
      return;
    }

    const body = (request.body ?? {}) as {
      agent?: "claude-code" | "codex-cli" | "opencode" | "generic";
      operationId?: string;
    };
    const agentTarget = body.agent ?? "codex-cli";

    try {
      const result = await bundleGenerator.exportBundle({
        ticketId: run.ticketId,
        agentTarget,
        exportMode: "quick-fix",
        sourceRunId: run.id,
        sourceFindingId: params.findingId,
        operationId: body.operationId
      });

      await reply.code(201).send({
        runId: result.runId,
        attemptId: result.attemptId,
        bundlePath: result.bundlePath,
        flatString: result.flatString,
        manifest: result.manifest
      });
    } catch (error) {
      await reply.code(400).send({
        error: "Export Failed",
        message: (error as Error).message
      });
    }
  });

  app.post("/api/tickets/:id/capture-results", async (request, reply) => {
    const ticketId = (request.params as { id: string }).id;
    const body = (request.body ?? {}) as {
      agentSummary?: string;
      scopePaths?: string[];
      widenedScopePaths?: string[];
      operationId?: string;
    };

    try {
      broadcastVerificationEvent(ticketId, "verify-started", { ticketId });

      const result = await verifierService.captureAndVerify(
        {
          ticketId,
          agentSummary: body.agentSummary,
          scopePaths: body.scopePaths ?? [],
          widenedScopePaths: body.widenedScopePaths ?? [],
          operationId: body.operationId
        },
        async (chunk) => {
          broadcastVerificationEvent(ticketId, "verify-token", { chunk });
        }
      );

      broadcastVerificationEvent(ticketId, "verify-complete", {
        ticketId,
        runId: result.runId,
        attemptId: result.attempt.attemptId,
        overallPass: result.overallPass
      });

      await reply.code(201).send({
        runId: result.runId,
        attemptId: result.attempt.attemptId,
        overallPass: result.overallPass,
        criteriaResults: result.attempt.criteriaResults,
        driftFlags: result.attempt.driftFlags
      });
    } catch (error) {
      const structured = verifierService.toStructuredError(error);
      broadcastVerificationEvent(ticketId, "verify-error", structured);
      await reply.code(structured.statusCode).send(structured);
    }
  });

  app.post("/api/tickets/:id/capture-preview", async (request, reply) => {
    const ticketId = (request.params as { id: string }).id;
    const body = (request.body ?? {}) as {
      scopePaths?: string[];
      widenedScopePaths?: string[];
      diffSource?: { mode: "auto" | "snapshot" };
    };

    const ticket = store.tickets.get(ticketId);
    if (!ticket?.runId) {
      await reply.code(400).send({ error: "Bad Request", message: `Ticket ${ticketId} has no active run for preview` });
      return;
    }

    const run = store.runs.get(ticket.runId);
    if (!run) {
      await reply.code(404).send({ error: "Not Found", message: `Run ${ticket.runId} not found` });
      return;
    }

    const diffResult = await diffEngine.computeDiff({
      ticket,
      runId: run.id,
      baselineAttemptId: run.committedAttemptId,
      scopePaths: body.scopePaths ?? [],
      widenedScopePaths: body.widenedScopePaths ?? [],
      diffSource: body.diffSource ?? { mode: "auto" }
    });

    const defaultScope = Array.from(new Set([...ticket.fileTargets, ...diffResult.changedFiles]));

    await reply.send({
      source: diffResult.diffSource,
      defaultScope,
      changedPaths: diffResult.changedFiles,
      primaryDiff: diffResult.primaryDiff,
      driftDiff: diffResult.driftDiff
    });
  });

  app.post("/api/tickets/:id/override-done", async (request, reply) => {
    const ticketId = (request.params as { id: string }).id;
    const body = (request.body ?? {}) as {
      reason?: string;
      overrideAccepted?: boolean;
      operationId?: string;
    };

    try {
      const result = await verifierService.overrideDone({
        ticketId,
        reason: body.reason ?? "",
        overrideAccepted: body.overrideAccepted === true,
        operationId: body.operationId
      });

      await reply.code(201).send({
        runId: result.runId,
        attemptId: result.attempt.attemptId,
        overrideReason: result.attempt.overrideReason,
        overrideAccepted: result.attempt.overrideAccepted
      });
    } catch (error) {
      const structured = verifierService.toStructuredError(error);
      await reply.code(structured.statusCode).send(structured);
    }
  });

  app.get("/api/tickets/:id/verify/stream", (request, reply) => {
    const ticketId = (request.params as { id: string }).id;
    const session = startSseSession(request, reply, "verify-ready");
    const subscribers = verificationSubscribers.get(ticketId) ?? new Set<SseSession>();
    subscribers.add(session);
    verificationSubscribers.set(ticketId, subscribers);

    request.raw.on("close", () => {
      const active = verificationSubscribers.get(ticketId);
      if (!active) {
        return;
      }

      active.delete(session);
      if (active.size === 0) {
        verificationSubscribers.delete(ticketId);
      }
    });
  });
};
