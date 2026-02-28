import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadEnvironment, resolveProviderApiKey } from "../config/env.js";
import { specflowDir } from "../io/paths.js";
import { HttpLlmClient, type LlmClient, type LlmTokenHandler } from "../llm/client.js";
import { LlmProviderError } from "../llm/errors.js";
import { ArtifactStore } from "../store/artifact-store.js";
import type { Initiative, Ticket } from "../types/entities.js";
import { parseJsonEnvelope } from "./json-parser.js";
import { buildPlannerPrompt, type PlannerJob } from "./prompt-builder.js";
import type {
  ClarifyInput,
  ClarifyResult,
  PlanInput,
  PlanResult,
  PlannerQuestion,
  SpecGenInput,
  SpecGenResult,
  TriageInput,
  TriageResult,
  TriageTicketDraft
} from "./types.js";

export interface PlannerServiceOptions {
  rootDir: string;
  store: ArtifactStore;
  llmClient?: LlmClient;
  now?: () => Date;
  idGenerator?: () => string;
}

export class PlannerService {
  private readonly rootDir: string;
  private readonly store: ArtifactStore;
  private readonly llmClient: LlmClient;
  private readonly now: () => Date;
  private readonly idGenerator: () => string;

  public constructor(options: PlannerServiceOptions) {
    this.rootDir = options.rootDir;
    loadEnvironment(this.rootDir);
    this.store = options.store;
    this.llmClient = options.llmClient ?? new HttpLlmClient();
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => randomUUID().slice(0, 8));
  }

  public async runClarifyJob(
    input: { description: string },
    onToken?: LlmTokenHandler
  ): Promise<{ initiative: Initiative; questions: PlannerQuestion[] }> {
    const result = await this.executePlannerJob<ClarifyResult>("clarify", input, onToken);
    this.validateClarifyResult(result);

    const nowIso = this.now().toISOString();
    const initiativeId = `initiative-${this.idGenerator()}`;
    const initiative: Initiative = {
      id: initiativeId,
      title: this.deriveInitiativeTitle(input.description),
      description: input.description,
      status: "draft",
      phases: [],
      specIds: [],
      ticketIds: [],
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await this.store.upsertInitiative(initiative);
    return { initiative, questions: result.questions };
  }

  public async runSpecGenJob(
    input: {
      initiativeId: string;
      answers: Record<string, string | string[] | boolean>;
    },
    onToken?: LlmTokenHandler
  ): Promise<SpecGenResult> {
    const initiative = this.store.initiatives.get(input.initiativeId);
    if (!initiative) {
      throw new Error(`Initiative ${input.initiativeId} not found`);
    }

    const result = await this.executePlannerJob<SpecGenResult>(
      "spec-gen",
      {
        initiativeDescription: initiative.description,
        answers: input.answers
      },
      onToken
    );

    this.validateSpecGenResult(result);

    const nowIso = this.now().toISOString();
    const updatedInitiative: Initiative = {
      ...initiative,
      status: "active",
      specIds: [
        `${initiative.id}:brief`,
        `${initiative.id}:prd`,
        `${initiative.id}:tech-spec`
      ],
      updatedAt: nowIso
    };

    await this.store.upsertInitiative(updatedInitiative, {
      brief: result.briefMarkdown,
      prd: result.prdMarkdown,
      techSpec: result.techSpecMarkdown
    });

    return result;
  }

  public async runPlanJob(
    input: {
      initiativeId: string;
    },
    onToken?: LlmTokenHandler
  ): Promise<PlanResult> {
    const initiative = this.store.initiatives.get(input.initiativeId);
    if (!initiative) {
      throw new Error(`Initiative ${input.initiativeId} not found`);
    }

    const brief = this.store.specs.get(`${initiative.id}:brief`)?.content ?? "";
    const prd = this.store.specs.get(`${initiative.id}:prd`)?.content ?? "";
    const techSpec = this.store.specs.get(`${initiative.id}:tech-spec`)?.content ?? "";

    const result = await this.executePlannerJob<PlanResult>(
      "plan",
      {
        initiativeDescription: initiative.description,
        briefMarkdown: brief,
        prdMarkdown: prd,
        techSpecMarkdown: techSpec
      },
      onToken
    );

    this.validatePlanResult(result);

    const nowIso = this.now().toISOString();
    const phaseIds: Initiative["phases"] = [];
    const createdTicketIds: string[] = [];

    for (const [phaseIndex, phase] of result.phases.entries()) {
      const phaseId = `phase-${phaseIndex + 1}-${this.idGenerator()}`;
      phaseIds.push({
        id: phaseId,
        name: phase.name,
        order: phase.order,
        status: "active"
      });

      for (const draft of phase.tickets) {
        const ticket = this.createTicketFromDraft({
          initiativeId: initiative.id,
          phaseId,
          status: "backlog",
          draft,
          nowIso
        });

        await this.store.upsertTicket(ticket);
        createdTicketIds.push(ticket.id);
      }
    }

    const updatedInitiative: Initiative = {
      ...initiative,
      status: "active",
      phases: phaseIds,
      ticketIds: Array.from(new Set([...initiative.ticketIds, ...createdTicketIds])),
      updatedAt: nowIso
    };

    await this.store.upsertInitiative(updatedInitiative);
    return result;
  }

  public async runTriageJob(
    input: { description: string },
    onToken?: LlmTokenHandler
  ): Promise<
    | { decision: "too-large"; reason: string; initiative: Initiative }
    | { decision: "ok"; reason: string; ticket: Ticket }
  > {
    const result = await this.executePlannerJob<TriageResult>("triage", input, onToken);
    this.validateTriageResult(result);

    const normalizedDecision = result.decision.toLowerCase();
    const nowIso = this.now().toISOString();

    if (normalizedDecision === "too-large") {
      const initiative: Initiative = {
        id: `initiative-${this.idGenerator()}`,
        title: result.initiativeTitle?.trim() || this.deriveInitiativeTitle(input.description),
        description: input.description,
        status: "draft",
        phases: [],
        specIds: [],
        ticketIds: [],
        createdAt: nowIso,
        updatedAt: nowIso
      };

      await this.store.upsertInitiative(initiative);
      return {
        decision: "too-large",
        reason: result.reason,
        initiative
      };
    }

    const ticket = this.createTicketFromDraft({
      initiativeId: null,
      phaseId: null,
      status: "ready",
      draft: result.ticketDraft,
      nowIso
    });

    await this.store.upsertTicket(ticket);

    return {
      decision: "ok",
      reason: result.reason,
      ticket
    };
  }

  public toStructuredError(error: unknown): {
    code: string;
    message: string;
    statusCode: number;
  } {
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
      code: "planner_error",
      message: (error as Error).message ?? "Planner execution failed",
      statusCode: 500
    };
  }

  private async executePlannerJob<T>(
    job: PlannerJob,
    input: ClarifyInput | SpecGenInput | PlanInput | TriageInput,
    onToken?: LlmTokenHandler
  ): Promise<T> {
    const agentsMd = await this.loadAgentsMd();
    const prompts = buildPlannerPrompt(job, input, agentsMd);
    const config = this.getResolvedConfig();

    const responseText = await this.llmClient.complete(
      {
        provider: config.provider,
        model: config.model,
        apiKey: config.apiKey,
        systemPrompt: prompts.systemPrompt,
        userPrompt: prompts.userPrompt
      },
      onToken
    );

    return parseJsonEnvelope<T>(responseText);
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

  private async loadAgentsMd(): Promise<string> {
    const config = this.getResolvedConfig();
    const configuredPath = config.repoInstructionFile || "specflow/AGENTS.md";
    const absolutePath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(this.rootDir, configuredPath);

    try {
      return await readFile(absolutePath, "utf8");
    } catch {
      const fallbackPath = path.join(specflowDir(this.rootDir), "AGENTS.md");
      try {
        return await readFile(fallbackPath, "utf8");
      } catch {
        return "";
      }
    }
  }

  private deriveInitiativeTitle(description: string): string {
    const compact = description.trim().replace(/\s+/g, " ");
    if (!compact) {
      return "Untitled Initiative";
    }

    return compact.length > 64 ? `${compact.slice(0, 61)}...` : compact;
  }

  private createTicketFromDraft(input: {
    initiativeId: string | null;
    phaseId: string | null;
    status: Ticket["status"];
    draft?: TriageTicketDraft | { title: string; description: string; acceptanceCriteria: string[]; fileTargets: string[] };
    nowIso: string;
  }): Ticket {
    const title = input.draft?.title?.trim() || "Quick Task";
    const description = input.draft?.description?.trim() || title;
    const acceptanceCriteria =
      input.draft?.acceptanceCriteria?.map((text, index) => ({
        id: `criterion-${index + 1}`,
        text
      })) ?? [];

    const implementationPlan =
      input.draft && this.hasImplementationPlan(input.draft) ? input.draft.implementationPlan : "";

    return {
      id: `ticket-${this.idGenerator()}`,
      initiativeId: input.initiativeId,
      phaseId: input.phaseId,
      title,
      description,
      status: input.status,
      acceptanceCriteria,
      implementationPlan,
      fileTargets: input.draft?.fileTargets ?? [],
      runId: null,
      createdAt: input.nowIso,
      updatedAt: input.nowIso
    };
  }

  private validateClarifyResult(result: ClarifyResult): void {
    if (!Array.isArray(result.questions)) {
      throw new Error("Clarify result missing questions array");
    }
  }

  private validateSpecGenResult(result: SpecGenResult): void {
    if (!result.briefMarkdown || !result.prdMarkdown || !result.techSpecMarkdown) {
      throw new Error("Spec-gen result must include brief, PRD, and tech spec markdown");
    }
  }

  private validatePlanResult(result: PlanResult): void {
    if (!Array.isArray(result.phases)) {
      throw new Error("Plan result missing phases array");
    }
  }

  private validateTriageResult(result: TriageResult): void {
    const decision = result.decision?.toLowerCase();
    if (decision !== "ok" && decision !== "too-large") {
      throw new Error(`Triage result decision must be 'ok' or 'too-large', received '${result.decision}'`);
    }

    if (decision === "ok" && !result.ticketDraft) {
      throw new Error("Triage result for decision 'ok' must include ticketDraft");
    }
  }

  private hasImplementationPlan(
    draft: TriageTicketDraft | { title: string; description: string; acceptanceCriteria: string[]; fileTargets: string[] }
  ): draft is TriageTicketDraft {
    return "implementationPlan" in draft && typeof draft.implementationPlan === "string";
  }
}
