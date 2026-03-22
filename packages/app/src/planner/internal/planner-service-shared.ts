import type { LlmTokenHandler } from "../../llm/client.js";
import type { ArtifactStore } from "../../store/artifact-store.js";
import type {
  Initiative,
  InitiativeArtifactStep,
  PlanningReviewArtifact,
  PlanningReviewKind
} from "../../types/entities.js";
import type { PlannerServiceRuntimeContext } from "../planner-service-runtime.js";
import type { PlannerJob } from "../prompt-builder.js";
import type {
  ClarifyHelpInput,
  ClarifyHelpResult,
  PhaseCheckInput,
  PhaseCheckResult,
  PhaseMarkdownResult,
  PlanInput,
  PlanResult,
  RefinementStep,
  ReviewRunInput,
  SpecGenInput,
  TriageInput,
  TriageResult
} from "../types.js";

export type PlannerJobInput =
  | ClarifyHelpInput
  | PhaseCheckInput
  | ReviewRunInput
  | SpecGenInput
  | PlanInput
  | TriageInput;

export interface GeneratedPhaseResult {
  markdown: string;
  reviews: PlanningReviewArtifact[];
}

export interface PlannerServiceDependencies {
  rootDir: string;
  store: ArtifactStore;
  now: () => Date;
  idGenerator: () => string;
  createDraftInitiative: (input: { description: string; projectRoot?: string }) => Promise<Initiative>;
  markPlanningArtifactsStale: (
    initiativeId: string,
    step: InitiativeArtifactStep
  ) => Promise<void>;
  requireInitiative: (initiativeId: string) => Initiative;
  executePlannerJob: <T>(
    job: PlannerJob,
    input: PlannerJobInput,
    onToken?: LlmTokenHandler,
    signal?: AbortSignal,
    projectRoot?: string
  ) => Promise<T>;
  getRuntimeContext: () => PlannerServiceRuntimeContext;
}

export const REFINEMENT_JOB_BY_STEP: Record<
  RefinementStep,
  Extract<PlannerJob, "brief-check" | "core-flows-check" | "prd-check" | "tech-spec-check">
> = {
  brief: "brief-check",
  "core-flows": "core-flows-check",
  prd: "prd-check",
  "tech-spec": "tech-spec-check"
};

export type GenerateArtifactJob = Extract<
  PlannerJob,
  "brief-gen" | "core-flows-gen" | "prd-gen" | "tech-spec-gen"
>;

export type ReviewJobInput = { initiativeId: string; kind: PlanningReviewKind };

export type TriageJobResult =
  | { decision: "too-large"; reason: string; initiative: Initiative }
  | { decision: "ok"; reason: string; ticket: import("../../types/entities.js").Ticket };

export type {
  ClarifyHelpResult,
  PhaseCheckResult,
  PhaseMarkdownResult,
  PlanResult,
  TriageResult
};
