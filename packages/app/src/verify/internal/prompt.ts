import type { LlmClient, LlmTokenHandler } from "../../llm/client.js";
import { parseJsonEnvelope } from "../../planner/json-parser.js";
import type {
  DriftFlag,
  RunCriterionResult,
  Ticket,
  TicketCoverageItem,
  VerificationSeverity,
} from "../../types/entities.js";
import type { DiffComputationResult } from "../diff-engine.js";
import type { ResolvedVerifierConfig } from "./config.js";
import { BUNDLE_ENGINEERING_FOUNDATIONS_SECTION } from "../../prompt-guidance.js";
import { isEngineeringFoundationCoverageItem } from "../../planner/ticket-coverage.js";

export interface ParsedVerifierResult {
  criteriaResults: Array<{
    criterionId: string;
    pass: boolean;
    evidence: string;
    severity?: VerificationSeverity;
    remediationHint?: string;
  }>;
  driftFlags: DriftFlag[];
  overallPass: boolean;
}

const SEVERITY_GUIDE = `
SEVERITY CLASSIFICATION:
- critical: Missing or broken behavior that directly violates a functional requirement (e.g. feature not implemented, data loss, security gap, test suite broken).
- major: Behavior is partially implemented or clearly incomplete in a way that users would notice (e.g. edge case unhandled, missing validation, UI broken in common path).
- minor: Cosmetic issue, style violation, missing documentation, or a gap that only affects edge cases unlikely to occur in production.
- outdated: The criterion was written for an earlier version of the requirements and no longer applies accurately to the current implementation.

When a criterion PASSES, still assign a severity to indicate its importance for future regression tracking.
When a criterion FAILS, severity determines fix priority. Always assign the most accurate severity, not the most severe.`.trim();

const EVIDENCE_GUIDE = `
EVIDENCE QUALITY STANDARDS:
- Quote the specific function names, file paths, or code patterns you observed in the diff that support your determination.
- If you cannot find relevant code in the diff, say so explicitly rather than making assumptions.
- For a PASS: cite the line/function that satisfies the criterion.
- For a FAIL: cite exactly what is absent or incorrect, and explain what would satisfy it.`.trim();

const DRIFT_GUIDE = `
DRIFT FLAG ANALYSIS:
- unexpected-file: A file was modified that is unrelated to the ticket scope and could introduce unintended side effects.
- missing-requirement: A file that the ticket explicitly targets shows no changes in the diff.
- pre-capture-drift: The baseline snapshot diverges from HEAD in ways not attributable to this ticket.
- widened-scope-drift: Changes in the widened drift scope that may affect the primary scope indirectly.

Assign severity to each drift flag:
- critical: Could break existing functionality or introduce regressions in production code.
- major: Unexpected scope change that warrants review but is unlikely to break things.
- minor: Trivial drift (whitespace, comments, formatting) with negligible risk.`.trim();

export const runVerifierPrompt = async (input: {
  llmClient: LlmClient;
  config: ResolvedVerifierConfig;
  ticket: Ticket;
  coveredItems: TicketCoverageItem[];
  diffResult: DiffComputationResult;
  agentsMd: string;
  onToken?: LlmTokenHandler;
  signal?: AbortSignal;
}): Promise<ParsedVerifierResult> => {
  const coveredItems = input.coveredItems.length
    ? JSON.stringify(input.coveredItems, null, 2)
    : "[]";
  const engineeringFoundations = input.coveredItems.filter(
    isEngineeringFoundationCoverageItem
  );

  const systemPrompt = [
    "You are SpecFlow verifier. Your job is to determine whether a code diff satisfies the acceptance criteria of a ticket.",
    "",
    "Return ONLY a JSON object. No prose, no markdown, no explanation outside the JSON.",
    "The JSON must have exactly these top-level fields: criteriaResults, driftFlags, overallPass.",
    "",
    "criteriaResults: array of objects, one per acceptance criterion. Each object must have:",
    "  - criterionId: string (matches the id from the input)",
    "  - pass: boolean",
    "  - evidence: string (specific evidence from the diff; see evidence quality standards below)",
    "  - severity: one of 'critical' | 'major' | 'minor' | 'outdated'",
    "  - remediationHint: string (if pass is false: a concrete, actionable hint on what to fix; if pass is true: empty string)",
    "",
    "driftFlags: array of drift flag objects. Each must have:",
    "  - type: one of 'unexpected-file' | 'missing-requirement' | 'pre-capture-drift' | 'widened-scope-drift'",
    "  - file: string",
    "  - description: string",
    "  - severity: one of 'critical' | 'major' | 'minor'",
    "",
    "overallPass: boolean (true only if ALL criteria pass and no critical drift flags exist)",
    "",
    SEVERITY_GUIDE,
    "",
    EVIDENCE_GUIDE,
    "",
    DRIFT_GUIDE,
    "",
    BUNDLE_ENGINEERING_FOUNDATIONS_SECTION,
    "",
    "AGENTS.md conventions to check against:",
    input.agentsMd
  ].join("\n");

  const userPrompt = [
    `Ticket ID: ${input.ticket.id}`,
    `Ticket Title: ${input.ticket.title}`,
    `Acceptance Criteria:\n${JSON.stringify(input.ticket.acceptanceCriteria, null, 2)}`,
    `Covered spec items:\n${coveredItems}`,
    `Covered engineering foundations:\n${
      engineeringFoundations.length > 0
        ? JSON.stringify(engineeringFoundations, null, 2)
        : "[]"
    }`,
    `Diff Source: ${input.diffResult.diffSource}`,
    `Primary Diff:\n${input.diffResult.primaryDiff || "(empty — no changes in primary scope)"}`,
    `Drift Diff:\n${input.diffResult.driftDiff || "(empty — no drift changes)"}`
  ].join("\n\n");

  const response = await input.llmClient.complete(
    {
      provider: input.config.provider,
      model: input.config.model,
      apiKey: input.config.apiKey,
      systemPrompt,
      userPrompt,
      maxTokens: 4096,
      timeoutMs: 120_000
    },
    input.onToken,
    { signal: input.signal }
  );

  const parsed = parseJsonEnvelope<ParsedVerifierResult>(response);

  return {
    criteriaResults: Array.isArray(parsed.criteriaResults)
      ? parsed.criteriaResults.map((result): RunCriterionResult => ({
          criterionId: String(result.criterionId ?? ""),
          pass: Boolean(result.pass),
          evidence: String(result.evidence ?? ""),
          severity: isValidSeverity(result.severity) ? result.severity : undefined,
          remediationHint: result.pass ? undefined : (String(result.remediationHint ?? "") || undefined)
        }))
      : [],
    driftFlags: Array.isArray(parsed.driftFlags)
      ? parsed.driftFlags.map((flag) => ({
          type: flag.type as DriftFlag["type"],
          file: String(flag.file ?? ""),
          description: String(flag.description ?? ""),
          severity: isValidSeverity(flag.severity) ? flag.severity : undefined
        }))
      : [],
    overallPass: Boolean(parsed.overallPass)
  };
};

const VALID_SEVERITIES = new Set<string>(["critical", "major", "minor", "outdated"]);

const isValidSeverity = (value: unknown): value is VerificationSeverity =>
  typeof value === "string" && VALID_SEVERITIES.has(value);
