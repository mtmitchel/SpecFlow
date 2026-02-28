import type { LlmClient, LlmTokenHandler } from "../../llm/client.js";
import { parseJsonEnvelope } from "../../planner/json-parser.js";
import type { DriftFlag, Ticket } from "../../types/entities.js";
import type { DiffComputationResult } from "../diff-engine.js";
import type { ResolvedVerifierConfig } from "./config.js";

export interface ParsedVerifierResult {
  criteriaResults: Array<{ criterionId: string; pass: boolean; evidence: string }>;
  driftFlags: DriftFlag[];
  overallPass: boolean;
}

export const runVerifierPrompt = async (input: {
  llmClient: LlmClient;
  config: ResolvedVerifierConfig;
  ticket: Ticket;
  diffResult: DiffComputationResult;
  agentsMd: string;
  onToken?: LlmTokenHandler;
}): Promise<ParsedVerifierResult> => {
  const systemPrompt = [
    "You are SpecFlow verifier.",
    "Return ONLY JSON with fields: criteriaResults, driftFlags, overallPass.",
    "criteriaResults must include criterionId, pass, evidence.",
    "driftFlags entries must include type, file, description.",
    "AGENTS.md:",
    input.agentsMd
  ].join("\n\n");

  const userPrompt = [
    `Ticket ID: ${input.ticket.id}`,
    `Criteria: ${JSON.stringify(input.ticket.acceptanceCriteria, null, 2)}`,
    `Diff Source: ${input.diffResult.diffSource}`,
    `Primary Diff:\n${input.diffResult.primaryDiff || "(empty)"}`,
    `Drift Diff:\n${input.diffResult.driftDiff || "(empty)"}`
  ].join("\n\n");

  const response = await input.llmClient.complete(
    {
      provider: input.config.provider,
      model: input.config.model,
      apiKey: input.config.apiKey,
      systemPrompt,
      userPrompt
    },
    input.onToken
  );

  const parsed = parseJsonEnvelope<ParsedVerifierResult>(response);

  return {
    criteriaResults: Array.isArray(parsed.criteriaResults) ? parsed.criteriaResults : [],
    driftFlags: Array.isArray(parsed.driftFlags) ? parsed.driftFlags : [],
    overallPass: Boolean(parsed.overallPass)
  };
};
