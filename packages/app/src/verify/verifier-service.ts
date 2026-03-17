import { randomUUID } from "node:crypto";
import { loadEnvironment } from "../config/env.js";
import { HttpLlmClient, type LlmClient, type LlmTokenHandler } from "../llm/client.js";
import { LlmProviderError } from "../llm/errors.js";
import { ArtifactStore } from "../store/artifact-store.js";
import type { DriftFlag, RunAttempt } from "../types/entities.js";
import { DiffEngine } from "./diff-engine.js";
import { readVerifierAgentsMd } from "./internal/agents-md.js";
import { mergeCriteria } from "./internal/criteria.js";
import { getResolvedVerifierConfig } from "./internal/config.js";
import { readAttemptArtifact, resolveExistingVerificationOperation } from "./internal/operations.js";
import { runVerifierPrompt } from "./internal/prompt.js";
import { throwIfAborted } from "../cancellation.js";

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
    onToken?: LlmTokenHandler,
    signal?: AbortSignal
  ): Promise<{ runId: string; attempt: RunAttempt; overallPass: boolean }> {
    throwIfAborted(signal);
    if (input.operationId) {
      const existing = await resolveExistingVerificationOperation({
        rootDir: this.rootDir,
        store: this.store,
        operationId: input.operationId
      });
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
    throwIfAborted(signal);

    const config = getResolvedVerifierConfig(this.store);
    const agentsMd = await readVerifierAgentsMd(this.rootDir, config.repoInstructionFile);
    const parsed = await runVerifierPrompt({
      llmClient: this.llmClient,
      config,
      ticket,
      diffResult,
      agentsMd,
      onToken,
      signal
    });
    const criteriaResults = mergeCriteria(ticket, parsed.criteriaResults);

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
    throwIfAborted(signal);

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
  }, signal?: AbortSignal): Promise<{ runId: string; attempt: RunAttempt }> {
    throwIfAborted(signal);
    if (input.operationId) {
      const existing = await resolveExistingVerificationOperation({
        rootDir: this.rootDir,
        store: this.store,
        operationId: input.operationId
      });
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

    const previousAttempt = await this.store.readRunAttempt(run.id, run.committedAttemptId);
    if (!previousAttempt) {
      throw new Error(`Attempt ${run.committedAttemptId} not found for run ${run.id}`);
    }

    const primaryDiff = await readAttemptArtifact(this.rootDir, run.id, run.committedAttemptId, "diff-primary.patch");
    const driftDiff = await readAttemptArtifact(this.rootDir, run.id, run.committedAttemptId, "diff-drift.patch");
    throwIfAborted(signal);

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
    throwIfAborted(signal);

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
}
