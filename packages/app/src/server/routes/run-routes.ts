import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { BundleManifest } from "../../bundle/types.js";
import { readYamlFile } from "../../io/yaml.js";
import type { ArtifactStore } from "../../store/artifact-store.js";
import type { Run, Ticket } from "../../types/entities.js";
import { DiffEngine } from "../../verify/diff-engine.js";
import { buildAuditFindings, extractDiffChanges, normalizeScopePaths, readAgentsConventions } from "../audit/findings.js";
import { readAuditReport, writeAuditReport } from "../audit/report-store.js";
import type { AuditReport } from "../audit/types.js";
import { zipDirectory } from "../zip/zip-directory.js";

export interface RegisterRunRoutesOptions {
  rootDir: string;
  store: ArtifactStore;
  diffEngine: DiffEngine;
}

export const registerRunRoutes = (app: FastifyInstance, options: RegisterRunRoutesOptions): void => {
  const { rootDir, store, diffEngine } = options;

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
      ? path.join(rootDir, "specflow", "runs", run.id, "attempts", run.committedAttemptId)
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
    const bundleDir = path.join(rootDir, "specflow", "runs", params.runId, "attempts", params.attemptId, "bundle");

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
    const agentsConventions = await readAgentsConventions(rootDir);
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
    await writeAuditReport(rootDir, report);

    await reply.send(report);
  });

  app.post("/api/runs/:id/findings/:findingId/create-ticket", async (request, reply) => {
    const params = request.params as { id: string; findingId: string };
    const report = await readAuditReport(rootDir, params.id);

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

    const report = await readAuditReport(rootDir, params.id);
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
    await writeAuditReport(rootDir, nextReport);
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
};

const readTextIfExists = async (filePath: string): Promise<string | null> => {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
};
