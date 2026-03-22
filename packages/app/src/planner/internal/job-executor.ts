import type { LlmClient, LlmTokenHandler } from "../../llm/client.js";
import { parseJsonEnvelope } from "../json-parser.js";
import { buildPlannerPrompt, type PlannerJob } from "../prompt-builder.js";
import type {
  ClarifyHelpInput,
  PhaseCheckInput,
  PlanInput,
  ReviewRunInput,
  SpecGenInput,
  TriageInput
} from "../types.js";
import type { ResolvedPlannerConfig } from "./config.js";

const MAX_TOKENS_BY_JOB: Record<PlannerJob, number> = {
  plan: 8192,
  "plan-repair": 8192,
  "brief-gen": 8192,
  "core-flows-gen": 8192,
  "prd-gen": 8192,
  "tech-spec-gen": 8192,
  "trace-outline": 4096,
  review: 6144,
  "brief-check": 4096,
  "core-flows-check": 4096,
  "prd-check": 4096,
  "tech-spec-check": 4096,
  "clarify-help": 3072,
  triage: 4096
};

export const executePlannerJob = async <T>(input: {
  llmClient: LlmClient;
  config: ResolvedPlannerConfig;
  job: PlannerJob;
  payload: ClarifyHelpInput | PhaseCheckInput | ReviewRunInput | SpecGenInput | PlanInput | TriageInput;
  agentsMd: string;
  onToken?: LlmTokenHandler;
  signal?: AbortSignal;
}): Promise<T> => {
  const prompts = buildPlannerPrompt(input.job, input.payload, input.agentsMd);

  const responseText = await input.llmClient.complete(
    {
      provider: input.config.provider,
      model: input.config.model,
      apiKey: input.config.apiKey,
      systemPrompt: prompts.systemPrompt,
      userPrompt: prompts.userPrompt,
      maxTokens: MAX_TOKENS_BY_JOB[input.job],
      timeoutMs:
        input.job === "plan" || input.job === "plan-repair"
          ? 300_000
          : input.job === "brief-gen" ||
              input.job === "core-flows-gen" ||
              input.job === "prd-gen" ||
              input.job === "tech-spec-gen"
            ? 180_000
            : 90_000
    },
    input.onToken,
    { signal: input.signal }
  );

  return parseJsonEnvelope<T>(responseText);
};
