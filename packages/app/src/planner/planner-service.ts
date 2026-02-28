import { randomUUID } from "node:crypto";
import { loadEnvironment } from "../config/env.js";
import { HttpLlmClient, type LlmClient, type LlmTokenHandler } from "../llm/client.js";
import { LlmProviderError } from "../llm/errors.js";
import { ArtifactStore } from "../store/artifact-store.js";
import type { Initiative, Ticket } from "../types/entities.js";
import { loadPlannerAgentsMd } from "./internal/agents-md.js";
import { getResolvedPlannerConfig } from "./internal/config.js";
import { executePlannerJob as executePlannerJobInternal } from "./internal/job-executor.js";
import { createTicketFromDraft, deriveInitiativeTitle } from "./internal/ticket-factory.js";
import {
  validateClarifyResult,
  validatePlanResult,
  validateSpecGenResult,
  validateTriageResult
} from "./internal/validators.js";
import { type PlannerJob } from "./prompt-builder.js";
import type {
  ClarifyInput,
  ClarifyResult,
  PlanInput,
  PlanResult,
  PlannerQuestion,
  SpecGenInput,
  SpecGenResult,
  TriageInput,
  TriageResult
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
    validateClarifyResult(result);

    const nowIso = this.now().toISOString();
    const initiativeId = `initiative-${this.idGenerator()}`;
    const initiative: Initiative = {
      id: initiativeId,
      title: deriveInitiativeTitle(input.description),
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

    validateSpecGenResult(result);

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

    validatePlanResult(result);

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
        const ticket = createTicketFromDraft({
          initiativeId: initiative.id,
          phaseId,
          status: "backlog",
          draft,
          nowIso,
          idGenerator: this.idGenerator
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
    validateTriageResult(result);

    const normalizedDecision = result.decision.toLowerCase();
    const nowIso = this.now().toISOString();

    if (normalizedDecision === "too-large") {
      const initiative: Initiative = {
        id: `initiative-${this.idGenerator()}`,
        title: result.initiativeTitle?.trim() || deriveInitiativeTitle(input.description),
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

    const ticket = createTicketFromDraft({
      initiativeId: null,
      phaseId: null,
      status: "ready",
      draft: result.ticketDraft,
      nowIso,
      idGenerator: this.idGenerator
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
    const config = getResolvedPlannerConfig(this.store);
    const agentsMd = await loadPlannerAgentsMd(this.rootDir, config.repoInstructionFile);

    return executePlannerJobInternal<T>({
      llmClient: this.llmClient,
      config,
      job,
      payload: input,
      agentsMd,
      onToken
    });
  }
}
