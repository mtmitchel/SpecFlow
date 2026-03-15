import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { HttpLlmClient } from "../../llm/client.js";
import type { ArtifactStore } from "../../store/artifact-store.js";
import type { Ticket } from "../../types/entities.js";
import { getResolvedVerifierConfig } from "../../verify/internal/config.js";
import { DiffEngine } from "../../verify/diff-engine.js";
import { buildAuditFindings, extractDiffChanges, normalizeScopePaths, readAgentsConventions } from "../audit/findings.js";
import { buildAuditFindingsWithLlm } from "../audit/llm-audit.js";
import { readAuditReport, writeAuditReport } from "../audit/report-store.js";
import type { AuditReport } from "../audit/types.js";
import { isValidEntityId, isValidFindingId, isValidGitRef } from "../validation.js";

export interface RegisterRunAuditRoutesOptions {
  rootDir: string;
  store: ArtifactStore;
  diffEngine: DiffEngine;
}

export const registerRunAuditRoutes = (app: FastifyInstance, options: RegisterRunAuditRoutesOptions): void => {
  const { rootDir, store, diffEngine } = options;

  app.post("/api/runs/:id/audit", async (request, reply) => {
    const runId = (request.params as { id: string }).id;
    if (!isValidEntityId(runId)) {
      await reply.code(400).send({ error: "Bad Request", message: "Invalid run ID format" });
      return;
    }
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

    if (body.diffSource?.mode === "branch" && !isValidGitRef(body.diffSource.branch)) {
      await reply.code(400).send({ error: "Bad Request", message: "Invalid branch name" });
      return;
    }
    if (body.diffSource?.mode === "commit-range") {
      if (!isValidGitRef(body.diffSource.from) || !isValidGitRef(body.diffSource.to)) {
        await reply.code(400).send({ error: "Bad Request", message: "Invalid commit ref" });
        return;
      }
    }

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

    const agentsConventions = await readAgentsConventions(rootDir);

    const llmConfig = getResolvedVerifierConfig(store);
    const useLlm = llmConfig.apiKey.trim().length > 0;

    const findings = useLlm
      ? await buildAuditFindingsWithLlm({
          ticket,
          primaryDiff: diffResult.primaryDiff,
          driftDiff: diffResult.driftDiff,
          agentsConventions,
          llmClient: new HttpLlmClient(),
          provider: llmConfig.provider,
          model: llmConfig.model,
          apiKey: llmConfig.apiKey
        })
      : buildAuditFindings(ticket, diffResult.driftFlags, extractDiffChanges(diffResult.primaryDiff), agentsConventions);

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
    if (!isValidEntityId(params.id)) {
      await reply.code(400).send({ error: "Bad Request", message: "Invalid run ID format" });
      return;
    }
    if (!isValidFindingId(params.findingId)) {
      await reply.code(400).send({ error: "Bad Request", message: "Invalid finding ID format" });
      return;
    }
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
      blockedBy: [],
      blocks: [],
      runId: null,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await store.upsertTicket(created);
    await reply.code(201).send({ ticket: created });
  });

  app.post("/api/runs/:id/findings/:findingId/dismiss", async (request, reply) => {
    const params = request.params as { id: string; findingId: string };
    if (!isValidEntityId(params.id)) {
      await reply.code(400).send({ error: "Bad Request", message: "Invalid run ID format" });
      return;
    }
    if (!isValidFindingId(params.findingId)) {
      await reply.code(400).send({ error: "Bad Request", message: "Invalid finding ID format" });
      return;
    }
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
};
