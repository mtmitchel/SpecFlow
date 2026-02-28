import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import { BundleGenerator } from "../bundle/bundle-generator.js";
import type { BundleManifest } from "../bundle/types.js";
import { loadEnvironment, resolveProviderApiKey } from "../config/env.js";
import { writeFileAtomic } from "../io/atomic-write.js";
import { readYamlFile } from "../io/yaml.js";
import { PlannerService } from "../planner/planner-service.js";
import { ArtifactStore } from "../store/artifact-store.js";
import type { DriftFlag, Run, Ticket } from "../types/entities.js";
import { DiffEngine } from "../verify/diff-engine.js";
import { VerifierService } from "../verify/verifier-service.js";
import { PROTOCOL_VERSION, SERVER_VERSION, runtimeCapabilities } from "./runtime-status.js";
import { ZipFile } from "yazl";

export interface CreateSpecFlowServerOptions {
  rootDir: string;
  host?: string;
  port?: number;
  staticDir?: string;
  fetchImpl?: typeof fetch;
  store?: ArtifactStore;
  plannerService?: PlannerService;
  bundleGenerator?: BundleGenerator;
  verifierService?: VerifierService;
}

export interface SpecFlowServer {
  app: FastifyInstance;
  store: ArtifactStore;
  host: string;
  port: number;
  start: () => Promise<string>;
  close: () => Promise<void>;
}

interface SseSession {
  send: (event: string, payload: unknown) => void;
  close: () => void;
}

const sendNotImplemented = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  await reply.code(501).send({
    error: "Not Implemented",
    message: "This route is scaffolded and will be implemented by a later ticket"
  });
};

const startSseSession = (request: FastifyRequest, reply: FastifyReply, eventName: string): SseSession => {
  reply.hijack();
  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache");
  reply.raw.setHeader("Connection", "keep-alive");

  const send = (event: string, payload: unknown): void => {
    if (reply.raw.writableEnded) {
      return;
    }

    reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  send(eventName, { status: "connected" });

  const heartbeat = setInterval(() => {
    if (!reply.raw.writableEnded) {
      reply.raw.write(":keepalive\n\n");
    }
  }, 15_000);

  const close = (): void => {
    clearInterval(heartbeat);
    if (!reply.raw.writableEnded) {
      reply.raw.end();
    }
  };

  request.raw.on("close", () => {
    clearInterval(heartbeat);
  });

  return { send, close };
};

const registerStubbedApiRoutes = (app: FastifyInstance): void => {
  app.post("/api/runs", sendNotImplemented);
};

export const createSpecFlowServer = async (
  options: CreateSpecFlowServerOptions
): Promise<SpecFlowServer> => {
  loadEnvironment(options.rootDir);

  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3141;
  const staticDir = options.staticDir ?? path.join(options.rootDir, "packages", "client", "dist");
  const store = options.store ?? new ArtifactStore({ rootDir: options.rootDir });

  await store.initialize();

  const plannerService = options.plannerService ??
    new PlannerService({
      rootDir: options.rootDir,
      store
    });
  const bundleGenerator = options.bundleGenerator ??
    new BundleGenerator({
      rootDir: options.rootDir,
      store
    });
  const verifierService = options.verifierService ??
    new VerifierService({
      rootDir: options.rootDir,
      store
    });
  const diffEngine = new DiffEngine({ rootDir: options.rootDir });
  const fetchImpl = options.fetchImpl ?? fetch;

  await mkdir(staticDir, { recursive: true });

  const app = Fastify({
    logger: false
  });
  const verificationSubscribers = new Map<string, Set<SseSession>>();

  const broadcastVerificationEvent = (ticketId: string, event: string, payload: unknown): void => {
    const subscribers = verificationSubscribers.get(ticketId);
    if (!subscribers) {
      return;
    }

    for (const subscriber of subscribers) {
      subscriber.send(event, payload);
    }
  };

  await app.register(fastifyStatic, {
    root: staticDir,
    prefix: "/"
  });

  app.get("/", async (_request, reply) => {
    await reply.sendFile("index.html");
  });

  app.get("/api/runtime/status", async (_request, reply) => {
    await reply.send({
      serverVersion: SERVER_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      capabilities: runtimeCapabilities
    });
  });

  app.get("/api/artifacts", async (_request, reply) => {
    await reply.send({
      config: store.config,
      initiatives: Array.from(store.initiatives.values()),
      tickets: Array.from(store.tickets.values()),
      runs: Array.from(store.runs.values()),
      runAttempts: Array.from(store.runAttempts.entries()).map(([id, value]) => ({ id, ...value })),
      specs: Array.from(store.specs.values())
    });
  });

  app.get("/api/runs", async (request, reply) => {
    const query = (request.query ?? {}) as Partial<{
      ticketId: string;
      agent: Run["agentType"];
      status: Run["status"];
      dateFrom: string;
      dateTo: string;
    }>;

    let runs = Array.from(store.runs.values());

    if (query.ticketId) {
      runs = runs.filter((run) => run.ticketId === query.ticketId);
    }

    if (query.agent) {
      runs = runs.filter((run) => run.agentType === query.agent);
    }

    if (query.status) {
      runs = runs.filter((run) => run.status === query.status);
    }

    const fromMs = query.dateFrom ? Date.parse(query.dateFrom) : null;
    const toMs = query.dateTo ? Date.parse(query.dateTo) : null;

    if ((query.dateFrom && Number.isNaN(fromMs)) || (query.dateTo && Number.isNaN(toMs))) {
      await reply.code(400).send({
        error: "Bad Request",
        message: "dateFrom/dateTo must be valid ISO-8601 timestamps"
      });
      return;
    }

    if (fromMs !== null || toMs !== null) {
      runs = runs.filter((run) => {
        const candidate = Date.parse(run.lastCommittedAt ?? run.createdAt);
        if (Number.isNaN(candidate)) {
          return false;
        }

        if (fromMs !== null && candidate < fromMs) {
          return false;
        }

        if (toMs !== null && candidate > toMs) {
          return false;
        }

        return true;
      });
    }

    runs.sort((left, right) => {
      const leftMs = Date.parse(left.lastCommittedAt ?? left.createdAt);
      const rightMs = Date.parse(right.lastCommittedAt ?? right.createdAt);
      return rightMs - leftMs;
    });

    const payload = await Promise.all(
      runs.map(async (run) => {
        const attempts = run.attempts
          .map((attemptId) => {
            const attempt = store.runAttempts.get(`${run.id}:${attemptId}`);
            if (!attempt) {
              return null;
            }

            return {
              attemptId: attempt.attemptId,
              overallPass: attempt.overallPass,
              createdAt: attempt.createdAt
            };
          })
          .filter((attempt): attempt is NonNullable<typeof attempt> => Boolean(attempt));

        const operationState = run.activeOperationId
          ? (await store.getOperationStatus(run.activeOperationId))?.state ?? null
          : null;

        return {
          run,
          ticket: run.ticketId ? store.tickets.get(run.ticketId) ?? null : null,
          attempts,
          operationState
        };
      })
    );

    await reply.send({ runs: payload });
  });

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

  app.put("/api/config", async (request, reply) => {
    const body = (request.body ?? {}) as Partial<{
      provider: "anthropic" | "openai" | "openrouter";
      model: string;
      apiKey: string;
      port: number;
      host: string;
      repoInstructionFile: string;
    }>;

    const existing = store.config ?? {
      provider: "openrouter" as const,
      model: "openrouter/auto",
      apiKey: "",
      port: 3141,
      host: "127.0.0.1",
      repoInstructionFile: "specflow/AGENTS.md"
    };

    const nextConfig = {
      ...existing,
      ...body
    };

    await store.upsertConfig(nextConfig);
    await reply.send({ config: nextConfig });
  });

  app.get("/api/providers/:provider/models", async (request, reply) => {
    const { provider } = request.params as { provider: string };
    if (provider !== "openrouter") {
      await reply.code(400).send({
        error: "Bad Request",
        message: `Provider '${provider}' is not supported for model discovery`
      });
      return;
    }

    const query = (request.query ?? {}) as Partial<{ q: string }>;
    const searchTerm = (query.q ?? "").trim().toLowerCase();
    const apiKey = resolveProviderApiKey("openrouter", store.config?.apiKey);
    try {
      const response = await fetchImpl("https://openrouter.ai/api/v1/models", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        }
      });

      if (!response.ok) {
        const body = await response.text();
        await reply.code(502).send({
          error: "Provider Error",
          message: `OpenRouter model discovery failed (${response.status})`,
          details: body.slice(0, 200)
        });
        return;
      }

      const payload = (await response.json()) as {
        data?: Array<{
          id?: string;
          name?: string;
          context_length?: number;
        }>;
      };

      const models = (payload.data ?? [])
        .filter((model): model is { id: string; name?: string; context_length?: number } => typeof model.id === "string")
        .map((model) => ({
          id: model.id,
          name: model.name ?? model.id,
          contextLength: typeof model.context_length === "number" ? model.context_length : null
        }))
        .filter((model) => {
          if (!searchTerm) {
            return true;
          }

          return model.id.toLowerCase().includes(searchTerm) || model.name.toLowerCase().includes(searchTerm);
        })
        .sort((left, right) => left.id.localeCompare(right.id));

      await reply.send({
        provider: "openrouter",
        count: models.length,
        models
      });
    } catch (error) {
      await reply.code(502).send({
        error: "Provider Error",
        message: "Failed to reach OpenRouter model registry",
        details: (error as Error).message
      });
    }
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
    const body = (request.body ?? {}) as { agent?: "claude-code" | "codex-cli" | "opencode" | "generic"; operationId?: string };
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

    const body = (request.body ?? {}) as { agent?: "claude-code" | "codex-cli" | "opencode" | "generic"; operationId?: string };
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

  app.get("/api/runs/:id", async (request, reply) => {
    const runId = (request.params as { id: string }).id;
    const run = store.runs.get(runId);

    if (!run) {
      await reply.code(404).send({ error: "Not Found", message: `Run ${runId} not found` });
      return;
    }

    const attempts = run.attempts
      .map((attemptId) => {
        const attempt = store.runAttempts.get(`${run.id}:${attemptId}`);
        if (!attempt) {
          return null;
        }

        return { id: `${run.id}:${attempt.attemptId}`, ...attempt };
      })
      .filter((attempt): attempt is NonNullable<typeof attempt> => Boolean(attempt))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

    const committedAttempt = run.committedAttemptId ? store.runAttempts.get(`${run.id}:${run.committedAttemptId}`) : null;
    const attemptRoot = run.committedAttemptId
      ? path.join(options.rootDir, "specflow", "runs", run.id, "attempts", run.committedAttemptId)
      : null;

    const bundleManifest = attemptRoot
      ? await readYamlFile<BundleManifest>(path.join(attemptRoot, "bundle-manifest.yaml"))
      : null;
    const primaryDiff = attemptRoot ? await readTextIfExists(path.join(attemptRoot, "diff-primary.patch")) : null;
    const driftDiff = attemptRoot ? await readTextIfExists(path.join(attemptRoot, "diff-drift.patch")) : null;
    const operationState = run.activeOperationId
      ? (await store.getOperationStatus(run.activeOperationId))?.state ?? null
      : null;

    await reply.send({
      run,
      ticket: run.ticketId ? store.tickets.get(run.ticketId) ?? null : null,
      attempts,
      operationState,
      committed: run.committedAttemptId
        ? {
            attemptId: run.committedAttemptId,
            attempt: committedAttempt ?? null,
            bundleManifest,
            primaryDiff,
            driftDiff
          }
        : null
    });
  });

  app.get("/api/runs/:runId/attempts/:attemptId/bundle.zip", async (request, reply) => {
    const params = request.params as { runId: string; attemptId: string };
    const bundleDir = path.join(options.rootDir, "specflow", "runs", params.runId, "attempts", params.attemptId, "bundle");

    try {
      const zipStream = await zipDirectory(bundleDir);
      await reply
        .header("Content-Type", "application/zip")
        .header("Content-Disposition", `attachment; filename=\"${params.runId}-${params.attemptId}-bundle.zip\"`)
        .send(zipStream);
    } catch (error) {
      await reply.code(404).send({
        error: "Not Found",
        message: `Bundle directory not found for run ${params.runId} attempt ${params.attemptId}: ${(error as Error).message}`
      });
    }
  });

  app.post("/api/runs/:id/audit", async (request, reply) => {
    const runId = (request.params as { id: string }).id;
    const run = store.runs.get(runId);

    if (!run) {
      await reply.code(404).send({ error: "Not Found", message: `Run ${runId} not found` });
      return;
    }

    const ticket = run.ticketId ? store.tickets.get(run.ticketId) ?? null : null;
    if (!ticket) {
      await reply.code(400).send({ error: "Bad Request", message: "Audit requires a run linked to a ticket" });
      return;
    }

    const body = (request.body ?? {}) as Partial<{
      scopePaths: string[];
      widenedScopePaths: string[];
      diffSource:
        | { mode: "auto" }
        | { mode: "branch"; branch: string }
        | { mode: "commit-range"; from: string; to: string }
        | { mode: "snapshot" };
    }>;

    const widenedScopePaths = normalizeScopePaths(body.widenedScopePaths ?? []);
    const requestedScope = normalizeScopePaths(body.scopePaths ?? []);
    const requestedDiffSource = body.diffSource ?? { mode: "branch", branch: "main" };

    const initialDiff = await diffEngine.computeDiff({
      ticket,
      runId,
      baselineAttemptId: run.committedAttemptId,
      scopePaths: requestedScope.length > 0 ? requestedScope : ticket.fileTargets,
      widenedScopePaths,
      diffSource: requestedDiffSource
    });

    const defaultScope = Array.from(new Set([...ticket.fileTargets, ...initialDiff.changedFiles]));
    const finalScope = requestedScope.length > 0 ? requestedScope : defaultScope;

    const diffResult = await diffEngine.computeDiff({
      ticket,
      runId,
      baselineAttemptId: run.committedAttemptId,
      scopePaths: finalScope,
      widenedScopePaths,
      diffSource: requestedDiffSource
    });

    const changes = extractDiffChanges(diffResult.primaryDiff);
    const agentsConventions = await readAgentsConventions(options.rootDir);
    const findings = buildAuditFindings(ticket, diffResult.driftFlags, changes, agentsConventions);

    const report: AuditReport = {
      runId,
      generatedAt: new Date().toISOString(),
      diffSourceMode:
        requestedDiffSource.mode === "auto"
          ? diffResult.diffSource === "git"
            ? "branch"
            : "snapshot"
          : requestedDiffSource.mode,
      defaultScope,
      primaryDiff: diffResult.primaryDiff,
      driftDiff: diffResult.driftDiff,
      findings
    };
    await writeAuditReport(options.rootDir, report);

    await reply.send(report);
  });

  app.post("/api/runs/:id/findings/:findingId/create-ticket", async (request, reply) => {
    const params = request.params as { id: string; findingId: string };
    const report = await readAuditReport(options.rootDir, params.id);

    if (!report) {
      await reply.code(404).send({ error: "Not Found", message: `No audit report for run ${params.id}` });
      return;
    }

    const finding = report.findings.find((item) => item.id === params.findingId);
    if (!finding) {
      await reply.code(404).send({ error: "Not Found", message: `Finding ${params.findingId} not found` });
      return;
    }

    const nowIso = new Date().toISOString();
    const ticketId = `ticket-${randomUUID().slice(0, 8)}`;
    const created: Ticket = {
      id: ticketId,
      initiativeId: null,
      phaseId: null,
      title: `[Audit] ${finding.category}: ${finding.file}`,
      description: finding.description,
      status: "ready",
      acceptanceCriteria: [
        { id: "criterion-1", text: "Resolve audit finding without introducing regressions." },
        { id: "criterion-2", text: "Update tests/docs if behavior changes." }
      ],
      implementationPlan: "Use the linked finding and diff context to create a focused fix.",
      fileTargets: finding.file ? [finding.file] : [],
      runId: null,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await store.upsertTicket(created);
    await reply.code(201).send({ ticket: created });
  });

  app.post("/api/runs/:id/findings/:findingId/dismiss", async (request, reply) => {
    const params = request.params as { id: string; findingId: string };
    const body = (request.body ?? {}) as { note?: string };
    const note = body.note?.trim() ?? "";

    if (!note) {
      await reply.code(400).send({ error: "Bad Request", message: "Dismiss note is required" });
      return;
    }

    const report = await readAuditReport(options.rootDir, params.id);
    if (!report) {
      await reply.code(404).send({ error: "Not Found", message: `No audit report for run ${params.id}` });
      return;
    }

    let found = false;
    const updated = report.findings.map((finding) => {
      if (finding.id !== params.findingId) {
        return finding;
      }

      found = true;
      return {
        ...finding,
        dismissed: true,
        dismissNote: note
      };
    });

    if (!found) {
      await reply.code(404).send({ error: "Not Found", message: `Finding ${params.findingId} not found` });
      return;
    }

    const nextReport: AuditReport = { ...report, findings: updated };
    await writeAuditReport(options.rootDir, nextReport);
    await reply.send({ findingId: params.findingId, dismissed: true, dismissNote: note });
  });

  app.get("/api/runs/:id/state", async (request, reply) => {
    const runId = (request.params as { id: string }).id;
    const run = store.runs.get(runId);

    if (!run) {
      await reply.code(404).send({ error: "Not Found", message: `Run ${runId} not found` });
      return;
    }

    const attempts = run.attempts
      .map((attemptId) => store.runAttempts.get(`${runId}:${attemptId}`))
      .filter((attempt): attempt is NonNullable<typeof attempt> => Boolean(attempt));

    await reply.send({ run, attempts });
  });

  app.get("/api/operations/:id", async (request, reply) => {
    const operationId = (request.params as { id: string }).id;
    const status = await store.getOperationStatus(operationId);

    if (!status) {
      await reply.code(404).send({ error: "Not Found", message: `Operation ${operationId} not found` });
      return;
    }

    await reply.send(status);
  });

  app.get("/api/planner/stream", (request, reply) => {
    startSseSession(request, reply, "planner-ready");
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

  registerStubbedApiRoutes(app);

  return {
    app,
    store,
    host,
    port,
    start: async () => {
      await app.listen({ host, port });
      return `http://${host}:${port}`;
    },
    close: async () => {
      await app.close();
      await store.close();
    }
  };
};

const readTextIfExists = async (filePath: string): Promise<string | null> => {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
};

interface DiffChange {
  file: string;
  line: number;
  content: string;
}

interface AuditFinding {
  id: string;
  severity: "error" | "warning" | "info";
  category: "drift" | "acceptance" | "convention";
  file: string;
  line: number | null;
  description: string;
  dismissed: boolean;
  dismissNote: string | null;
}

interface AuditReport {
  runId: string;
  generatedAt: string;
  diffSourceMode: "branch" | "commit-range" | "snapshot";
  defaultScope: string[];
  primaryDiff: string;
  driftDiff: string | null;
  findings: AuditFinding[];
}

const auditReportPath = (rootDir: string, runId: string): string =>
  path.join(rootDir, "specflow", "runs", runId, "audit-findings.json");

const readAuditReport = async (rootDir: string, runId: string): Promise<AuditReport | null> => {
  const content = await readTextIfExists(auditReportPath(rootDir, runId));
  if (!content) {
    return null;
  }

  try {
    return JSON.parse(content) as AuditReport;
  } catch {
    return null;
  }
};

const writeAuditReport = async (rootDir: string, report: AuditReport): Promise<void> => {
  await writeFileAtomic(auditReportPath(rootDir, report.runId), JSON.stringify(report, null, 2));
};

const extractDiffChanges = (diffText: string): DiffChange[] => {
  const changes: DiffChange[] = [];
  const lines = diffText.split("\n");
  let currentFile = "(unknown)";
  let currentLine = 0;

  for (const line of lines) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6).trim();
      continue;
    }

    const hunkMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunkMatch) {
      currentLine = Number.parseInt(hunkMatch[1], 10);
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      changes.push({
        file: currentFile,
        line: currentLine,
        content: line.slice(1)
      });
      currentLine += 1;
      continue;
    }

    if (!line.startsWith("-")) {
      currentLine += 1;
    }
  }

  return changes;
};

const buildAuditFindings = (
  ticket: Ticket,
  driftFlags: DriftFlag[],
  changes: DiffChange[],
  agentsConventions: string
): AuditFinding[] => {
  const findings: AuditFinding[] = [];
  let counter = 1;

  for (const flag of driftFlags) {
    const match = changes.find((change) => change.file === flag.file);
    findings.push({
      id: `finding-${counter++}`,
      severity: flag.type === "missing-requirement" ? "error" : flag.type === "unexpected-file" ? "warning" : "info",
      category: "drift",
      file: flag.file,
      line: match?.line ?? null,
      description: flag.description,
      dismissed: false,
      dismissNote: null
    });
  }

  const diffCorpus = changes.map((change) => change.content.toLowerCase()).join("\n");
  for (const criterion of ticket.acceptanceCriteria) {
    const keywords = criterion.text
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((word) => word.length >= 4);

    if (keywords.length === 0) {
      continue;
    }

    const matched = keywords.some((keyword) => diffCorpus.includes(keyword));
    if (!matched) {
      findings.push({
        id: `finding-${counter++}`,
        severity: "warning",
        category: "acceptance",
        file: ticket.fileTargets[0] ?? "(n/a)",
        line: null,
        description: `No direct diff evidence found for criterion '${criterion.id}': ${criterion.text}`,
        dismissed: false,
        dismissNote: null
      });
    }
  }

  const requiresTests = /test/i.test(agentsConventions);
  if (requiresTests) {
    const hasTestChange = changes.some(
      (change) =>
        /(^|\/)(test|tests)\//i.test(change.file) || /\.test\./i.test(change.file) || /\.spec\./i.test(change.file)
    );

    if (!hasTestChange) {
      findings.push({
        id: `finding-${counter++}`,
        severity: "info",
        category: "convention",
        file: "(n/a)",
        line: null,
        description: "AGENTS.md mentions testing conventions, but no test file changes were detected in the audit scope.",
        dismissed: false,
        dismissNote: null
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      id: "finding-1",
      severity: "info",
      category: "drift",
      file: "(n/a)",
      line: null,
      description: "No audit findings were detected for the selected scope.",
      dismissed: false,
      dismissNote: null
    });
  }

  return findings;
};

const readAgentsConventions = async (rootDir: string): Promise<string> => {
  const preferred = await readTextIfExists(path.join(rootDir, "specflow", "AGENTS.md"));
  if (preferred) {
    return preferred;
  }

  return (await readTextIfExists(path.join(rootDir, "AGENTS.md"))) ?? "";
};

const normalizeScopePaths = (raw: string[]): string[] =>
  Array.from(
    new Set(
      raw
        .map((entry) => path.posix.normalize(entry.replaceAll("\\", "/")).trim())
        .filter((entry) => entry.length > 0 && !entry.startsWith("../") && !path.isAbsolute(entry))
    )
  );

const zipDirectory = async (directory: string): Promise<NodeJS.ReadableStream> => {
  const zip = new ZipFile();
  await addDirectoryToZip(zip, directory, "");
  zip.end();
  return zip.outputStream;
};

const addDirectoryToZip = async (zip: ZipFile, absoluteDir: string, relativeBase: string): Promise<void> => {
  const entries = await readdir(absoluteDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(absoluteDir, entry.name);
    const relativePath = path.posix.join(relativeBase, entry.name);

    if (entry.isDirectory()) {
      await addDirectoryToZip(zip, absolutePath, relativePath);
      continue;
    }

    const meta = await stat(absolutePath);
    if (meta.isFile()) {
      zip.addFile(absolutePath, relativePath);
    }
  }
};
