import { randomUUID } from "node:crypto";
import { HttpLlmClient } from "../../llm/client.js";
import type { Ticket } from "../../types/entities.js";
import { getResolvedVerifierConfig } from "../../verify/internal/config.js";
import { buildAuditFindings, extractDiffChanges, normalizeScopePaths, readAgentsConventions } from "../../audit/findings.js";
import { buildAuditFindingsWithLlm } from "../../audit/llm-audit.js";
import { readAuditReport, writeAuditReport } from "../../audit/report-store.js";
import type { AuditReport } from "../../audit/types.js";
import { isValidFindingId, isValidGitRef } from "../../validation.js";
import type { SpecFlowRuntime } from "../types.js";
import { badRequest, notFound } from "../errors.js";
import { requireValidEntityId } from "./shared.js";
import { resolveTicketProjectRoot } from "../../project-roots.js";

export const runAudit = async (
  runtime: SpecFlowRuntime,
  runId: string,
  body: Partial<{
    scopePaths: string[];
    widenedScopePaths: string[];
    diffSource:
      | { mode: "auto" }
      | { mode: "branch"; branch: string }
      | { mode: "commit-range"; from: string; to: string }
      | { mode: "snapshot" };
  }>
) => {
  requireValidEntityId(runId, "run ID");
  const run = runtime.store.runs.get(runId);
  if (!run) {
    throw notFound(`Run ${runId} not found`);
  }
  if (!run.committedAttemptId) {
    throw badRequest("Audit requires a committed run attempt");
  }

  const ticket = run.ticketId ? runtime.store.tickets.get(run.ticketId) ?? null : null;
  if (!ticket) {
    throw badRequest("Audit requires a run linked to a ticket");
  }

  if (body.diffSource?.mode === "branch" && !isValidGitRef(body.diffSource.branch)) {
    throw badRequest("Invalid branch name");
  }
  if (body.diffSource?.mode === "commit-range") {
    if (!isValidGitRef(body.diffSource.from) || !isValidGitRef(body.diffSource.to)) {
      throw badRequest("Invalid commit ref");
    }
  }

  const widenedScopePaths = normalizeScopePaths(body.widenedScopePaths ?? []);
  const requestedScope = normalizeScopePaths(body.scopePaths ?? []);
  const requestedDiffSource = body.diffSource ?? { mode: "branch", branch: "main" };
  const projectRoot = resolveTicketProjectRoot(runtime.rootDir, runtime.store, ticket);

  const initialDiff = await runtime.diffEngine.computeDiff({
    ticket,
    runId,
    baselineAttemptId: run.committedAttemptId,
    rootDir: projectRoot,
    scopePaths: requestedScope.length > 0 ? requestedScope : ticket.fileTargets,
    widenedScopePaths,
    diffSource: requestedDiffSource
  });

  const defaultScope = Array.from(new Set([...ticket.fileTargets, ...initialDiff.changedFiles]));
  const finalScope = requestedScope.length > 0 ? requestedScope : defaultScope;

  const diffResult = await runtime.diffEngine.computeDiff({
    ticket,
    runId,
    baselineAttemptId: run.committedAttemptId,
    rootDir: projectRoot,
    scopePaths: finalScope,
    widenedScopePaths,
    diffSource: requestedDiffSource
  });

  const agentsConventions = await readAgentsConventions(projectRoot);
  const llmConfig = await getResolvedVerifierConfig(runtime.store, runtime.fetchImpl);
  const useLlm = llmConfig.apiKey.trim().length > 0;

  const findings = useLlm
    ? await buildAuditFindingsWithLlm({
        ticket,
        primaryDiff: diffResult.primaryDiff,
        driftDiff: diffResult.driftDiff,
        agentsConventions,
        llmClient: new HttpLlmClient(runtime.fetchImpl),
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
  await writeAuditReport({
    rootDir: runtime.rootDir,
    store: runtime.store,
    report,
    operationId: `op-${randomUUID().slice(0, 8)}`
  });

  return report;
};

export const createTicketFromAuditFinding = async (
  runtime: SpecFlowRuntime,
  runId: string,
  findingId: string
) => {
  requireValidEntityId(runId, "run ID");
  if (!isValidFindingId(findingId)) {
    throw badRequest("Invalid finding ID format");
  }

  const report = await readAuditReport(runtime.rootDir, runId);
  if (!report) {
    throw notFound(`No audit report for run ${runId}`);
  }

  const finding = report.findings.find((item) => item.id === findingId);
  if (!finding) {
    throw notFound(`Finding ${findingId} not found`);
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
    coverageItemIds: [],
    blockedBy: [],
    blocks: [],
    runId: null,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  await runtime.store.upsertTicket(created);

  return {
    ticket: created
  };
};

export const dismissAuditFinding = async (
  runtime: SpecFlowRuntime,
  runId: string,
  findingId: string,
  note?: string
) => {
  requireValidEntityId(runId, "run ID");
  if (!isValidFindingId(findingId)) {
    throw badRequest("Invalid finding ID format");
  }

  const dismissNote = note?.trim() ?? "";
  if (!dismissNote) {
    throw badRequest("Dismiss note is required");
  }

  const report = await readAuditReport(runtime.rootDir, runId);
  if (!report) {
    throw notFound(`No audit report for run ${runId}`);
  }

  let found = false;
  const updated = report.findings.map((finding) => {
    if (finding.id !== findingId) {
      return finding;
    }

    found = true;
    return {
      ...finding,
      dismissed: true,
      dismissNote
    };
  });

  if (!found) {
    throw notFound(`Finding ${findingId} not found`);
  }

  const nextReport: AuditReport = { ...report, findings: updated };
  await writeAuditReport({
    rootDir: runtime.rootDir,
    store: runtime.store,
    report: nextReport,
    operationId: `op-${randomUUID().slice(0, 8)}`
  });

  return {
    findingId,
    dismissed: true,
    dismissNote
  };
};
