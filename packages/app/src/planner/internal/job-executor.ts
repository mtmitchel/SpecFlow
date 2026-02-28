import type { LlmClient, LlmTokenHandler } from "../../llm/client.js";
import { parseJsonEnvelope } from "../json-parser.js";
import { buildPlannerPrompt, type PlannerJob } from "../prompt-builder.js";
import type { ClarifyInput, PlanInput, SpecGenInput, TriageInput } from "../types.js";
import type { ResolvedPlannerConfig } from "./config.js";

const MAX_TOKENS_BY_JOB: Record<PlannerJob, number> = {
  plan: 8192,
  "spec-gen": 8192,
  clarify: 4096,
  triage: 4096
};

export const executePlannerJob = async <T>(input: {
  llmClient: LlmClient;
  config: ResolvedPlannerConfig;
  job: PlannerJob;
  payload: ClarifyInput | SpecGenInput | PlanInput | TriageInput;
  agentsMd: string;
  onToken?: LlmTokenHandler;
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
      timeoutMs: input.job === "plan" || input.job === "spec-gen" ? 180_000 : 90_000
    },
    input.onToken
  );

  return parseJsonEnvelope<T>(responseText);
};
