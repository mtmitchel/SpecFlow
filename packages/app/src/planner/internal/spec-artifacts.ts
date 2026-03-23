import type { LlmTokenHandler } from "../../llm/client.js";
import type {
  ArtifactTraceOutline,
  Initiative,
  InitiativeArtifactStep,
  InitiativePlanningStep,
  SpecDocumentSummary,
  TicketCoverageArtifact,
  TicketCoverageItem
} from "../../types/entities.js";
import {
  buildTicketCoverageArtifact,
  buildTicketCoverageItems,
  getTicketCoverageArtifactId
} from "../ticket-coverage.js";
import {
  extractInitiativeTitleFromBriefMarkdown,
  shouldReplaceInitiativeTitle
} from "./initiative-title-sync.js";
import { normalizeInitiativeTitle } from "./title-style.js";
import { completeWorkflowStep } from "../workflow-state.js";
import type {
  PhaseMarkdownResult,
  PlannerTraceOutlineMap,
  RefinementStep,
  SpecGenInput
} from "../types.js";
import type { PlannerJob } from "../prompt-builder.js";

export const requireTicketCoverageArtifact = (
  initiativeId: string,
  ticketCoverageArtifacts: ReadonlyMap<string, TicketCoverageArtifact>
): TicketCoverageArtifact => {
  const coverage = ticketCoverageArtifacts.get(getTicketCoverageArtifactId(initiativeId));
  if (!coverage) {
    throw new Error(`Ticket coverage is missing for initiative ${initiativeId}`);
  }

  return coverage;
};

export const buildTicketCoverageInput = async (input: {
  initiative: Initiative;
  requireSpecUpdatedAt: (initiativeId: string, step: InitiativeArtifactStep) => string;
  ensureArtifactTrace: (initiative: Initiative, step: InitiativeArtifactStep) => Promise<ArtifactTraceOutline>;
}): Promise<{
  items: TicketCoverageItem[];
  traceOutlines: PlannerTraceOutlineMap;
  sourceUpdatedAts: Partial<Record<InitiativePlanningStep, string>>;
}> => {
  const traces: Partial<Record<InitiativeArtifactStep, ArtifactTraceOutline>> = {};
  const sourceUpdatedAts: Partial<Record<InitiativePlanningStep, string>> = {};

  for (const step of ["brief", "core-flows", "prd", "tech-spec"] as const) {
    traces[step] = await input.ensureArtifactTrace(input.initiative, step);
    sourceUpdatedAts[step] = input.requireSpecUpdatedAt(input.initiative.id, step);
  }

  return {
    items: buildTicketCoverageItems(traces),
    traceOutlines: Object.fromEntries(
      Object.entries(traces).map(([step, trace]) => [
        step,
        { sections: trace?.sections ?? [] },
      ])
    ) as PlannerTraceOutlineMap,
    sourceUpdatedAts
  };
};

export const ensureArtifactTrace = async (input: {
  initiative: Initiative;
  step: InitiativeArtifactStep;
  specs: ReadonlyMap<string, SpecDocumentSummary>;
  artifactTraces: ReadonlyMap<string, ArtifactTraceOutline>;
  nowIso: string;
  validatePhaseMarkdownResult: (result: PhaseMarkdownResult) => void;
  readSpecMarkdown: (specId: string) => Promise<string>;
  buildSpecGenerationInput: (initiative: Initiative, step: RefinementStep) => Promise<SpecGenInput>;
  executePlannerJob: <T>(
    job: PlannerJob,
    payload: SpecGenInput & { artifact: RefinementStep },
    onToken?: LlmTokenHandler
  ) => Promise<T>;
  upsertArtifactTrace: (trace: ArtifactTraceOutline) => Promise<void>;
}): Promise<ArtifactTraceOutline> => {
  const spec = input.specs.get(`${input.initiative.id}:${input.step}`);
  const currentMarkdown = spec ? await input.readSpecMarkdown(spec.id) : "";
  if (!spec || !currentMarkdown.trim()) {
    throw new Error(`Artifact ${input.step} is missing for initiative ${input.initiative.id}`);
  }

  const existing = input.artifactTraces.get(`${input.initiative.id}:${input.step}`);
  if (existing && existing.sourceUpdatedAt === spec.updatedAt) {
    return existing;
  }

  const result = await input.executePlannerJob<PhaseMarkdownResult>(
    "trace-outline",
    {
      ...(await input.buildSpecGenerationInput(input.initiative, input.step)),
      artifact: input.step,
      briefMarkdown:
        input.step === "brief"
          ? currentMarkdown
          : await input.readSpecMarkdown(`${input.initiative.id}:brief`),
      coreFlowsMarkdown:
        input.step === "core-flows"
          ? currentMarkdown
          : await input.readSpecMarkdown(`${input.initiative.id}:core-flows`),
      prdMarkdown:
        input.step === "prd"
          ? currentMarkdown
          : await input.readSpecMarkdown(`${input.initiative.id}:prd`),
      techSpecMarkdown:
        input.step === "tech-spec"
          ? currentMarkdown
          : await input.readSpecMarkdown(`${input.initiative.id}:tech-spec`)
    },
    undefined
  );

  input.validatePhaseMarkdownResult(result);

  const trace: ArtifactTraceOutline = {
    id: `${input.initiative.id}:${input.step}`,
    initiativeId: input.initiative.id,
    step: input.step,
    sections: result.traceOutline.sections,
    sourceUpdatedAt: spec.updatedAt,
    generatedAt: input.nowIso,
    updatedAt: input.nowIso
  };
  await input.upsertArtifactTrace(trace);
  return trace;
};

export const persistPhaseMarkdown = async (input: {
  initiative: Initiative;
  step: RefinementStep;
  result: PhaseMarkdownResult;
  nowIso: string;
  upsertInitiative: (
    initiative: Initiative,
    docs: { brief?: string; coreFlows?: string; prd?: string; techSpec?: string }
  ) => Promise<void>;
  specs: ReadonlyMap<string, SpecDocumentSummary>;
  upsertArtifactTrace: (trace: ArtifactTraceOutline) => Promise<void>;
  markPlanningArtifactsStale: (initiativeId: string, step: InitiativeArtifactStep) => Promise<void>;
}): Promise<void> => {
  const nextInitiativeTitle =
    input.step === "brief" &&
    shouldReplaceInitiativeTitle(input.initiative.title, input.initiative.description)
      ? normalizeInitiativeTitle(
          input.result.initiativeTitle?.trim()
            || extractInitiativeTitleFromBriefMarkdown(input.result.markdown)
            || input.initiative.title
        )
      : input.initiative.title;

  const updatedInitiative: Initiative = {
    ...input.initiative,
    title: nextInitiativeTitle,
    status: "active",
    specIds: Array.from(new Set([...input.initiative.specIds, `${input.initiative.id}:${input.step}`])),
    workflow: completeWorkflowStep(input.initiative.workflow, input.step, input.nowIso),
    updatedAt: input.nowIso
  };

  await input.upsertInitiative(updatedInitiative, {
    brief: input.step === "brief" ? input.result.markdown : undefined,
    coreFlows: input.step === "core-flows" ? input.result.markdown : undefined,
    prd: input.step === "prd" ? input.result.markdown : undefined,
    techSpec: input.step === "tech-spec" ? input.result.markdown : undefined
  });

  await input.markPlanningArtifactsStale(input.initiative.id, input.step);

  const refreshedSpec = input.specs.get(`${input.initiative.id}:${input.step}`);
  if (!refreshedSpec) {
    throw new Error(`Failed to persist ${input.step} for initiative ${input.initiative.id}`);
  }

  const trace: ArtifactTraceOutline = {
    id: `${input.initiative.id}:${input.step}`,
    initiativeId: input.initiative.id,
    step: input.step,
    sections: input.result.traceOutline.sections,
    sourceUpdatedAt: refreshedSpec.updatedAt,
    generatedAt: input.nowIso,
    updatedAt: input.nowIso
  };
  await input.upsertArtifactTrace(trace);
};

export const buildPersistedTicketCoverageArtifact = (input: {
  initiativeId: string;
  items: TicketCoverageItem[];
  uncoveredItemIds: string[];
  sourceUpdatedAts: Partial<Record<InitiativePlanningStep, string>>;
  nowIso: string;
}): TicketCoverageArtifact =>
  buildTicketCoverageArtifact({
    initiativeId: input.initiativeId,
    items: input.items,
    uncoveredItemIds: input.uncoveredItemIds,
    sourceUpdatedAts: input.sourceUpdatedAts,
    nowIso: input.nowIso
  });
