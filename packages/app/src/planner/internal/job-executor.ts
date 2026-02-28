import type { LlmClient, LlmTokenHandler } from "../../llm/client.js";
import { parseJsonEnvelope } from "../json-parser.js";
import { buildPlannerPrompt, type PlannerJob } from "../prompt-builder.js";
import type { ClarifyInput, PlanInput, SpecGenInput, TriageInput } from "../types.js";
import type { ResolvedPlannerConfig } from "./config.js";

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
      userPrompt: prompts.userPrompt
    },
    input.onToken
  );

  return parseJsonEnvelope<T>(responseText);
};
