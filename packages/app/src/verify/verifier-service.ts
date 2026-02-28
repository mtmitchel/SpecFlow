import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvironment, resolveProviderApiKey } from "../config/env.js";
import { verificationPath } from "../io/paths.js";
import { HttpLlmClient, type LlmClient, type LlmTokenHandler } from "../llm/client.js";
import { LlmProviderError } from "../llm/errors.js";
import { parseJsonEnvelope } from "../planner/json-parser.js";
import { ArtifactStore } from "../store/artifact-store.js";
import type { DriftFlag, RunAttempt, RunCriterionResult, Ticket } from "../types/entities.js";
import { DiffEngine, type DiffComputationResult } from "./diff-engine.js";

export interface VerifierServiceOptions {
  rootDir: string;
  store: ArtifactStore;
  llmClient?: LlmClient;
  diffEngine?: DiffEngine;
  now?: () => Date;
  idGenerator?: () => string;
}

export interface CaptureResultsInput {
  ticketId: string;
  agentSummary?: string;
  scopePaths?: string[];
  widenedScopePaths?: string[];
  operationId?: string;
}

interface ParsedVerifierResult {
  criteriaResults: Array<{ criterionId: string; pass: boolean; evidence: string }>;
  driftFlags: DriftFlag[];
  overallPass: boolean;
}

export class VerifierService {
  private readonly rootDir: string;
  private readonly store: ArtifactStore;
  private readonly llmClient: LlmClient;
  private readonly diffEngine: DiffEngine;
  private readonly now: () => Date;
  private readonly idGenerator: () => string;

  public constructor(options: VerifierServiceOptions) {
    this.rootDir = options.rootDir;
    loadEnvironment(this.rootDir);
    this.store = options.store;
    this.llmClient = options.llmClient ?? new HttpLlmClient();
    this.diffEngine = options.diffEngine ?? new DiffEngine({ rootDir: this.rootDir });
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => randomUUID().slice(0, 8));
  }

  public async captureAndVerify(
    input: CaptureResultsInput,
    onToken?: LlmTokenHandler
  ): Promise<{ runId: string; attempt: RunAttempt; overallPass: boolean }> {
    if (input.operationId) {
      const existing = await this.resolveExistingVerificationOperation(input.operationId);
      if (existing) {
        return {
          runId: existing.runId,
          attempt: existing.attempt,
          overallPass: existing.attempt.overallPass
        };
      }
    }

    const ticket = this.store.tickets.get(input.ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${input.ticketId} not found`);
    }

    if (!ticket.runId) {
      throw new Error(`Ticket ${input.ticketId} has no active run`);
    }

    const run = this.store.runs.get(ticket.runId);
    if (!run) {
      throw new Error(`Run ${ticket.runId} not found`);
    }

    const diffResult = await this.diffEngine.computeDiff({
      ticket,
      runId: run.id,
      baselineAttemptId: run.committedAttemptId,
      scopePaths: input.scopePaths,
      widenedScopePaths: input.widenedScopePaths ?? []
    });

    const parsed = await this.runVerifierPrompt(ticket, diffResult, onToken);
    const criteriaResults = this.mergeCriteria(ticket, parsed.criteriaResults);

    const missingFlags: DriftFlag[] = criteriaResults
      .filter((criterion) => !criterion.pass)
      .map((criterion) => ({
        type: "missing-requirement",
        file: "(n/a)",
        description: `Failed criterion ${criterion.criterionId}: ${criterion.evidence}`
      }));

    const driftFlags = [...diffResult.driftFlags, ...parsed.driftFlags, ...missingFlags];
    const overallPass = criteriaResults.every((criterion) => criterion.pass) && parsed.overallPass;

    const attemptId = `attempt-${this.idGenerator()}`;
    const attempt: RunAttempt = {
      attemptId,
      agentSummary: input.agentSummary ?? "",
      diffSource: diffResult.diffSource,
      initialScopePaths: diffResult.initialScopePaths,
      widenedScopePaths: diffResult.widenedScopePaths,
      primaryDiffPath: "diff-primary.patch",
      driftDiffPath: diffResult.driftDiff ? "diff-drift.patch" : null,
      overrideReason: null,
      overrideAccepted: false,
      criteriaResults,
      driftFlags,
      overallPass,
      createdAt: this.now().toISOString()
    };

    const operationId = input.operationId ?? `op-${this.idGenerator()}`;

    await this.store.prepareRunOperation({
      runId: run.id,
      operationId,
      attemptId,
      leaseMs: 60_000,
      artifacts: {
        primaryDiff: diffResult.primaryDiff,
        driftDiff: diffResult.driftDiff ?? undefined,
        verification: attempt
      }
    });

    await this.store.commitRunOperation({ runId: run.id, operationId });

    await this.store.upsertTicket({
      ...ticket,
      status: overallPass ? "done" : "verify",
      updatedAt: this.now().toISOString()
    });

    return {
      runId: run.id,
      attempt,
      overallPass
    };
  }

  public async overrideDone(input: {
    ticketId: string;
    reason: string;
    overrideAccepted: boolean;
    operationId?: string;
  }): Promise<{ runId: string; attempt: RunAttempt }> {
    if (input.operationId) {
      const existing = await this.resolveExistingVerificationOperation(input.operationId);
      if (existing) {
        return {
          runId: existing.runId,
          attempt: existing.attempt
        };
      }
    }

    if (!input.reason.trim()) {
      throw new Error("Override reason is required");
    }

    if (!input.overrideAccepted) {
      throw new Error("overrideAccepted must be true");
    }

    const ticket = this.store.tickets.get(input.ticketId);
    if (!ticket?.runId) {
      throw new Error(`Ticket ${input.ticketId} has no active run`);
    }

    const run = this.store.runs.get(ticket.runId);
    if (!run?.committedAttemptId) {
      throw new Error(`Run ${ticket.runId} has no committed attempt to override`);
    }

    const previousAttempt = this.store.runAttempts.get(`${run.id}:${run.committedAttemptId}`);
    if (!previousAttempt) {
      throw new Error(`Attempt ${run.committedAttemptId} not found for run ${run.id}`);
    }

    const primaryDiff = await this.readAttemptArtifact(run.id, run.committedAttemptId, "diff-primary.patch");
    const driftDiff = await this.readAttemptArtifact(run.id, run.committedAttemptId, "diff-drift.patch");

    const updatedAttempt: RunAttempt = {
      ...previousAttempt,
      attemptId: `attempt-${this.idGenerator()}`,
      overrideReason: input.reason,
      overrideAccepted: true,
      overallPass: true,
      createdAt: this.now().toISOString()
    };

    const operationId = input.operationId ?? `op-${this.idGenerator()}`;

    await this.store.prepareRunOperation({
      runId: run.id,
      operationId,
      attemptId: updatedAttempt.attemptId,
      leaseMs: 60_000,
      artifacts: {
        primaryDiff: primaryDiff ?? "",
        driftDiff: driftDiff ?? undefined,
        verification: updatedAttempt
      }
    });

    await this.store.commitRunOperation({ runId: run.id, operationId });

    await this.store.upsertTicket({
      ...ticket,
      status: "done",
      updatedAt: this.now().toISOString()
    });

    return {
      runId: run.id,
      attempt: updatedAttempt
    };
  }

  public toStructuredError(error: unknown): { code: string; message: string; statusCode: number } {
    if (error instanceof LlmProviderError) {
      const statusCode =
        error.code === "invalid_api_key"
          ? 401
          : error.code === "rate_limit"
            ? 429
            : error.code === "timeout"
              ? 504
              : error.statusCode ?? 502;

      return {
        code: error.code,
        message: error.message,
        statusCode
      };
    }

    return {
      code: "verification_error",
      message: (error as Error).message,
      statusCode: 400
    };
  }

  private async runVerifierPrompt(
    ticket: Ticket,
    diffResult: DiffComputationResult,
    onToken?: LlmTokenHandler
  ): Promise<ParsedVerifierResult> {
    const config = this.getResolvedConfig();
    const agentsMd = await this.readAgentsMd(config.repoInstructionFile);

    const systemPrompt = [
      "You are SpecFlow verifier.",
      "Return ONLY JSON with fields: criteriaResults, driftFlags, overallPass.",
      "criteriaResults must include criterionId, pass, evidence.",
      "driftFlags entries must include type, file, description.",
      "AGENTS.md:",
      agentsMd
    ].join("\n\n");

    const userPrompt = [
      `Ticket ID: ${ticket.id}`,
      `Criteria: ${JSON.stringify(ticket.acceptanceCriteria, null, 2)}`,
      `Diff Source: ${diffResult.diffSource}`,
      `Primary Diff:\n${diffResult.primaryDiff || "(empty)"}`,
      `Drift Diff:\n${diffResult.driftDiff || "(empty)"}`
    ].join("\n\n");

    const response = await this.llmClient.complete(
      {
        provider: config.provider,
        model: config.model,
        apiKey: config.apiKey,
        systemPrompt,
        userPrompt
      },
      onToken
    );

    const parsed = parseJsonEnvelope<ParsedVerifierResult>(response);

    return {
      criteriaResults: Array.isArray(parsed.criteriaResults) ? parsed.criteriaResults : [],
      driftFlags: Array.isArray(parsed.driftFlags) ? parsed.driftFlags : [],
      overallPass: Boolean(parsed.overallPass)
    };
  }

  private getResolvedConfig(): {
    provider: "anthropic" | "openai" | "openrouter";
    model: string;
    apiKey: string;
    repoInstructionFile: string;
  } {
    const existing = this.store.config;

    if (!existing) {
      const provider = "anthropic" as const;
      return {
        provider,
        model: "claude-opus-4-5",
        apiKey: resolveProviderApiKey(provider),
        repoInstructionFile: "specflow/AGENTS.md"
      };
    }

    return {
      provider: existing.provider,
      model: existing.model,
      apiKey: resolveProviderApiKey(existing.provider, existing.apiKey),
      repoInstructionFile: existing.repoInstructionFile || "specflow/AGENTS.md"
    };
  }

  private async readAgentsMd(repoInstructionFile: string): Promise<string> {
    const configuredPath = path.isAbsolute(repoInstructionFile)
      ? repoInstructionFile
      : path.join(this.rootDir, repoInstructionFile);

    try {
      return await readFile(configuredPath, "utf8");
    } catch {
      return "";
    }
  }

  private mergeCriteria(ticket: Ticket, raw: RunCriterionResult[]): RunCriterionResult[] {
    const byId = new Map(raw.map((criterion) => [criterion.criterionId, criterion]));

    return ticket.acceptanceCriteria.map((criterion) => {
      const existing = byId.get(criterion.id);
      if (existing) {
        return existing;
      }

      return {
        criterionId: criterion.id,
        pass: false,
        evidence: "No verifier output for this criterion"
      };
    });
  }

  private async readAttemptArtifact(
    runId: string,
    attemptId: string,
    artifactFile: "diff-primary.patch" | "diff-drift.patch"
  ): Promise<string | null> {
    const artifactPath = path.join(this.rootDir, "specflow", "runs", runId, "attempts", attemptId, artifactFile);

    try {
      return await readFile(artifactPath, "utf8");
    } catch {
      return null;
    }
  }

  private async resolveExistingVerificationOperation(
    operationId: string
  ): Promise<{ runId: string; attempt: RunAttempt } | null> {
    const existing = await this.store.getOperationStatus(operationId);
    if (!existing) {
      return null;
    }

    if (existing.state !== "committed") {
      throw new Error(`Operation ${operationId} is currently ${existing.state}`);
    }

    const mapKey = `${existing.runId}:${existing.targetAttemptId}`;
    const inMemory = this.store.runAttempts.get(mapKey);
    if (inMemory) {
      return { runId: existing.runId, attempt: inMemory };
    }

    const file = await readFile(
      verificationPath(this.rootDir, existing.runId, existing.targetAttemptId),
      "utf8"
    );
    const parsed = JSON.parse(file) as RunAttempt;
    return { runId: existing.runId, attempt: parsed };
  }
}
