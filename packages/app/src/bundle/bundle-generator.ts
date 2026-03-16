import { randomUUID } from "node:crypto";
import path from "node:path";
import { ArtifactStore } from "../store/artifact-store.js";
import type { Ticket } from "../types/entities.js";
import { getTicketExecutionGate } from "../planner/execution-gates.js";
import { readAgentsMd } from "./internal/agents-md.js";
import { collectContextFiles } from "./internal/context-files.js";
import { buildBundleManifest } from "./internal/manifest.js";
import { ensureRunForTicket, resolveExistingOperation } from "./internal/operations.js";
import { captureSnapshotFiles } from "./internal/snapshot.js";
import { renderBundleForAgent } from "./renderers.js";
import type { ExportBundleRequest, ExportBundleResult } from "./types.js";
import { getTicketCoverageArtifactId } from "../planner/ticket-coverage.js";

const rendererVersion = "0.1.0";

export interface BundleGeneratorOptions {
  rootDir: string;
  store: ArtifactStore;
  now?: () => Date;
  idGenerator?: () => string;
}

export class BundleGenerator {
  private readonly rootDir: string;
  private readonly store: ArtifactStore;
  private readonly now: () => Date;
  private readonly idGenerator: () => string;

  public constructor(options: BundleGeneratorOptions) {
    this.rootDir = options.rootDir;
    this.store = options.store;
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => randomUUID().slice(0, 8));
  }

  public async exportBundle(input: ExportBundleRequest): Promise<ExportBundleResult> {
    if (input.operationId) {
      const existing = await resolveExistingOperation({
        rootDir: this.rootDir,
        store: this.store,
        operationId: input.operationId
      });
      if (existing) {
        return existing;
      }
    }

    const ticket = this.store.tickets.get(input.ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${input.ticketId} not found`);
    }

    const executionGate = getTicketExecutionGate(ticket, this.store.planningReviews);
    if (!executionGate.allowed) {
      throw new Error(executionGate.message);
    }

    const run = await ensureRunForTicket({
      store: this.store,
      ticket,
      agentTarget: input.agentTarget,
      idGenerator: this.idGenerator,
      now: this.now
    });

    const attemptId = `attempt-${this.idGenerator()}`;
    const operationId = input.operationId ?? `op-${this.idGenerator()}`;

    const agentsMd = await readAgentsMd(this.rootDir, this.store.config?.repoInstructionFile);
    const contextFiles = collectContextFiles({
      initiativeId: ticket.initiativeId,
      specs: this.store.specs.values()
    });
    const coveredItems = ticket.initiativeId
      ? this.store.ticketCoverageArtifacts
          .get(getTicketCoverageArtifactId(ticket.initiativeId))
          ?.items.filter((item) => ticket.coverageItemIds.includes(item.id)) ?? []
      : [];

    const rendered = renderBundleForAgent({
      agentTarget: input.agentTarget,
      ticket,
      coveredItems,
      exportMode: input.exportMode,
      sourceRunId: input.sourceRunId ?? null,
      sourceFindingId: input.sourceFindingId ?? null,
      agentsMd,
      contextFiles
    });

    const manifest = buildBundleManifest({
      rendererVersion,
      agentTarget: input.agentTarget,
      exportMode: input.exportMode,
      ticketId: ticket.id,
      runId: run.id,
      attemptId,
      sourceRunId: input.sourceRunId ?? null,
      sourceFindingId: input.sourceFindingId ?? null,
      contextFiles,
      rendererFiles: rendered.rendererFiles,
      flatString: rendered.flatString,
      generatedAt: this.now().toISOString()
    });

    const snapshotFiles = await captureSnapshotFiles(this.rootDir, ticket.fileTargets);

    const stagedFiles: Array<{ relativePath: string; content: string }> = [
      {
        relativePath: "bundle/PROMPT.md",
        content: rendered.prompt
      },
      {
        relativePath: "bundle/AGENTS.md",
        content: agentsMd
      },
      ...contextFiles.map((file) => ({
        relativePath: `bundle/${file.relativePath}`,
        content: file.content
      })),
      ...rendered.rendererFiles,
      ...snapshotFiles
    ];

    await this.store.prepareRunOperation({
      runId: run.id,
      operationId,
      attemptId,
      leaseMs: 60_000,
      artifacts: {
        bundleFlat: rendered.flatString,
        bundleManifest: manifest,
        additionalFiles: stagedFiles
      }
    });

    await this.store.commitRunOperation({
      runId: run.id,
      operationId
    });

    const updatedTicket: Ticket = {
      ...ticket,
      status: "in-progress",
      runId: run.id,
      updatedAt: this.now().toISOString()
    };
    await this.store.upsertTicket(updatedTicket);

    const bundlePath = path.join(this.rootDir, "specflow", "runs", run.id, "attempts", attemptId, "bundle");

    return {
      runId: run.id,
      attemptId,
      operationId,
      bundlePath,
      flatString: rendered.flatString,
      manifest
    };
  }
}
