import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readYamlFile } from "../io/yaml.js";
import { ArtifactStore } from "../store/artifact-store.js";
import type { Run, Ticket } from "../types/entities.js";
import { renderBundleForAgent } from "./renderers.js";
import type {
  BundleContextFile,
  BundleManifest,
  ExportBundleRequest,
  ExportBundleResult
} from "./types.js";

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
      const existing = await this.resolveExistingOperation(input.operationId);
      if (existing) {
        return existing;
      }
    }

    const ticket = this.store.tickets.get(input.ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${input.ticketId} not found`);
    }

    const run = await this.ensureRunForTicket(ticket, input.agentTarget);
    const attemptId = `attempt-${this.idGenerator()}`;
    const operationId = input.operationId ?? `op-${this.idGenerator()}`;

    const agentsMd = await this.readAgentsMd();
    const contextFiles = await this.collectContextFiles(ticket);

    const rendered = renderBundleForAgent({
      agentTarget: input.agentTarget,
      ticket,
      exportMode: input.exportMode,
      sourceRunId: input.sourceRunId ?? null,
      sourceFindingId: input.sourceFindingId ?? null,
      agentsMd,
      contextFiles
    });

    const digest = createHash("sha256").update(rendered.flatString, "utf8").digest("hex");
    const manifest: BundleManifest = {
      bundleSchemaVersion: "1.0.0",
      rendererVersion,
      agentTarget: input.agentTarget,
      exportMode: input.exportMode,
      ticketId: ticket.id,
      runId: run.id,
      attemptId,
      sourceRunId: input.sourceRunId ?? null,
      sourceFindingId: input.sourceFindingId ?? null,
      contextFiles: contextFiles.map((file) => `bundle/${file.relativePath}`),
      requiredFiles: [
        "bundle/PROMPT.md",
        "bundle/AGENTS.md",
        ...rendered.rendererFiles.map((file) => file.relativePath)
      ],
      contentDigest: digest,
      generatedAt: this.now().toISOString()
    };

    const snapshotFiles = await this.captureSnapshotFiles(ticket.fileTargets);

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

  private async resolveExistingOperation(operationId: string): Promise<ExportBundleResult | null> {
    const existing = await this.store.getOperationStatus(operationId);
    if (!existing) {
      return null;
    }

    if (existing.state !== "committed") {
      throw new Error(`Operation ${operationId} is currently ${existing.state}`);
    }

    const attemptDir = path.join(
      this.rootDir,
      "specflow",
      "runs",
      existing.runId,
      "attempts",
      existing.targetAttemptId
    );

    const flatPath = path.join(attemptDir, "bundle-flat.md");
    const manifestPath = path.join(attemptDir, "bundle-manifest.yaml");
    const flatString = await readFile(flatPath, "utf8");
    const manifest = await readYamlFile<BundleManifest>(manifestPath);

    if (!manifest) {
      throw new Error(`Committed operation ${operationId} is missing bundle-manifest.yaml`);
    }

    return {
      runId: existing.runId,
      attemptId: existing.targetAttemptId,
      operationId,
      bundlePath: path.join(attemptDir, "bundle"),
      flatString,
      manifest
    };
  }

  private async ensureRunForTicket(ticket: Ticket, agentTarget: Run["agentType"]): Promise<Run> {
    if (ticket.runId && this.store.runs.has(ticket.runId)) {
      const existing = this.store.runs.get(ticket.runId);
      if (existing) {
        return existing;
      }
    }

    const runId = `run-${this.idGenerator()}`;
    const run: Run = {
      id: runId,
      ticketId: ticket.id,
      type: "execution",
      agentType: agentTarget,
      status: "pending",
      attempts: [],
      committedAttemptId: null,
      activeOperationId: null,
      operationLeaseExpiresAt: null,
      lastCommittedAt: null,
      createdAt: this.now().toISOString()
    };

    await this.store.upsertRun(run);
    return run;
  }

  private async readAgentsMd(): Promise<string> {
    const configuredPath = this.store.config?.repoInstructionFile || "specflow/AGENTS.md";
    const absolutePath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(this.rootDir, configuredPath);

    try {
      return await readFile(absolutePath, "utf8");
    } catch {
      return "";
    }
  }

  private async collectContextFiles(ticket: Ticket): Promise<BundleContextFile[]> {
    const files: BundleContextFile[] = [];

    if (!ticket.initiativeId) {
      return files;
    }

    const specs = Array.from(this.store.specs.values()).filter(
      (spec) => spec.initiativeId === ticket.initiativeId && spec.type !== "decision"
    );

    for (const spec of specs) {
      const fileName = path.basename(spec.sourcePath);
      files.push({
        relativePath: `specs/${fileName}`,
        content: spec.content
      });
    }

    return files;
  }

  private async captureSnapshotFiles(
    fileTargets: string[]
  ): Promise<Array<{ relativePath: string; content: string }>> {
    const files: Array<{ relativePath: string; content: string }> = [];

    for (const target of fileTargets) {
      const normalized = path.posix.normalize(target.replaceAll("\\", "/"));
      if (normalized.startsWith("../") || path.isAbsolute(normalized)) {
        continue;
      }

      const absolutePath = path.join(this.rootDir, normalized);

      try {
        const content = await readFile(absolutePath, "utf8");
        files.push({
          relativePath: `snapshot-before/${normalized}`,
          content
        });
      } catch {
        files.push({
          relativePath: `snapshot-before/${normalized}.missing`,
          content: "File did not exist at export time."
        });
      }
    }

    if (files.length === 0) {
      files.push({
        relativePath: "snapshot-before/.snapshot",
        content: "No file targets were available for baseline capture."
      });
    }

    return files;
  }
}
