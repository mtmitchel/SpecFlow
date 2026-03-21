import { randomUUID } from "node:crypto";
import type { LlmClient } from "../../packages/app/src/llm/client.js";
import { DiffEngine } from "../../packages/app/src/verify/diff-engine.js";
import { VerifierService } from "../../packages/app/src/verify/verifier-service.js";
import type { RunAttempt } from "../../packages/app/src/types/entities.js";
import { ArtifactStore } from "../../packages/app/src/store/artifact-store.js";

const UNUSED_LLM_CLIENT: LlmClient = {
  complete: async () => {
    throw new Error("The E2E fake runtime must not call the live LLM.");
  },
};

const createEntityId = (prefix: "attempt" | "op"): string => `${prefix}-${randomUUID().slice(0, 8)}`;

export class E2eVerifierService extends VerifierService {
  private readonly storeRef: ArtifactStore;
  private readonly diffEngineRef: DiffEngine;

  public constructor(rootDir: string, store: ArtifactStore) {
    super({
      rootDir,
      store,
      llmClient: UNUSED_LLM_CLIENT,
      diffEngine: new DiffEngine({ rootDir }),
    });
    this.storeRef = store;
    this.diffEngineRef = new DiffEngine({ rootDir });
  }

  public override async captureAndVerify(
    input: {
      ticketId: string;
      agentSummary?: string;
      scopePaths?: string[];
      widenedScopePaths?: string[];
      operationId?: string;
    },
    onToken?: (chunk: string) => Promise<void> | void,
  ): Promise<{ runId: string; attempt: RunAttempt; overallPass: boolean }> {
    const ticket = this.storeRef.tickets.get(input.ticketId);
    if (!ticket?.runId) {
      throw new Error(`Ticket ${input.ticketId} has no active run`);
    }

    const run = this.storeRef.runs.get(ticket.runId);
    if (!run) {
      throw new Error(`Run ${ticket.runId} not found`);
    }

    await onToken?.("Comparing the captured changes against the ticket plan.\n");

    const diffResult = await this.diffEngineRef.computeDiff({
      ticket,
      runId: run.id,
      baselineAttemptId: run.committedAttemptId,
      scopePaths: input.scopePaths,
      widenedScopePaths: input.widenedScopePaths ?? [],
    });
    const nowIso = new Date().toISOString();
    const attemptId = createEntityId("attempt");
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
      criteriaResults: ticket.acceptanceCriteria.map((criterion) => ({
        criterionId: criterion.id,
        pass: true,
        evidence: `Verified the change for: ${criterion.text}`,
        severity: "minor",
      })),
      driftFlags: diffResult.driftFlags,
      overallPass: true,
      createdAt: nowIso,
    };

    const operationId = input.operationId ?? createEntityId("op");
    await this.storeRef.prepareRunOperation({
      runId: run.id,
      operationId,
      attemptId,
      leaseMs: 60_000,
      artifacts: {
        primaryDiff: diffResult.primaryDiff,
        driftDiff: diffResult.driftDiff ?? undefined,
        verification: attempt,
      },
    });
    await this.storeRef.commitRunOperation({ runId: run.id, operationId });
    await this.storeRef.upsertTicket({
      ...ticket,
      status: "verify",
      updatedAt: nowIso,
    });

    await onToken?.("Verification complete.\n");

    return {
      runId: run.id,
      attempt,
      overallPass: true,
    };
  }
}
