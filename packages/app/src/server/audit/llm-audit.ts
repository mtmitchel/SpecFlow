import type { LlmClient } from "../../llm/client.js";
import { parseJsonEnvelope } from "../../planner/json-parser.js";
import type { Ticket } from "../../types/entities.js";
import type { AuditCategory, AuditFinding } from "./types.js";

interface LlmFinding {
  category: string;
  severity: string;
  file: string;
  line: number | null;
  description: string;
  confidence: number;
}

interface LlmAuditResponse {
  findings: LlmFinding[];
}

const VALID_CATEGORIES = new Set<string>(["drift", "acceptance", "convention", "bug", "performance", "security", "clarity"]);
const VALID_SEVERITIES = new Set<string>(["error", "warning", "info"]);

const SYSTEM_PROMPT = `You are SpecFlow auditor. Analyze a code diff and produce a structured list of findings.

CATEGORIES — classify each finding into exactly one:
- acceptance: A ticket acceptance criterion appears unmet or only partially satisfied by the diff.
- bug: A code change introduces or preserves a defect — off-by-one, null dereference, unhandled error path, incorrect logic.
- security: Potential vulnerability — SQL injection, XSS, path traversal, exposed secret, improper auth check, unsafe deserialization.
- performance: Unnecessary computation, missing index, N+1 query, blocking call in hot path, excessive memory allocation.
- clarity: Hard-to-understand code — missing types, confusing naming, overly complex logic that could be simplified without behavior change.
- convention: Violation of project conventions from AGENTS.md (e.g., missing tests, wrong file location, naming conventions).
- drift: Files changed outside the expected ticket scope that may introduce unintended side effects.

SEVERITY — assign one:
- error: Likely to cause a runtime failure, data loss, or security breach in production.
- warning: Worth fixing before merge but won't cause immediate breakage.
- info: Suggestion for improvement; low urgency.

CONFIDENCE — float 0.0–1.0:
- 1.0: You found the exact code that confirms the finding.
- 0.7–0.9: Strong evidence, minor ambiguity.
- 0.4–0.6: Moderate evidence; may be a false positive.
- Below 0.4: Speculative — omit these findings entirely.

Return ONLY a JSON object with this structure (no prose, no markdown fences):
{
  "findings": [
    {
      "category": "bug|security|performance|clarity|convention|acceptance|drift",
      "severity": "error|warning|info",
      "file": "path/to/file.ts",
      "line": 42,
      "description": "Concise description of the issue and why it matters",
      "confidence": 0.9
    }
  ]
}

Rules:
- Only report findings with confidence >= 0.4.
- Do not invent issues not visible in the diff.
- If the diff is empty or clean, return { "findings": [] }.
- Prefer specificity: reference function names, variable names, or line content.
- Limit to at most 12 findings total, prioritizing by severity then confidence.`;

export const buildAuditFindingsWithLlm = async (input: {
  ticket: Ticket;
  primaryDiff: string;
  driftDiff: string | null;
  agentsConventions: string;
  llmClient: LlmClient;
  provider: "anthropic" | "openai" | "openrouter";
  model: string;
  apiKey: string;
}): Promise<AuditFinding[]> => {
  const userPrompt = [
    `Ticket title: ${input.ticket.title}`,
    `Acceptance criteria:\n${input.ticket.acceptanceCriteria.map((c) => `- [${c.id}] ${c.text}`).join("\n")}`,
    `Expected file targets: ${input.ticket.fileTargets.join(", ") || "(none specified)"}`,
    `AGENTS.md conventions:\n${input.agentsConventions || "(none)"}`,
    `Primary diff:\n${input.primaryDiff || "(empty)"}`,
    input.driftDiff ? `Drift diff (files outside primary scope):\n${input.driftDiff}` : null
  ]
    .filter(Boolean)
    .join("\n\n");

  const responseText = await input.llmClient.complete({
    provider: input.provider,
    model: input.model,
    apiKey: input.apiKey,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 4096,
    timeoutMs: 90_000
  });

  const parsed = parseJsonEnvelope<LlmAuditResponse>(responseText);
  const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];

  const findings: AuditFinding[] = [];
  let counter = 1;

  for (const raw of rawFindings) {
    const confidence = typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.5;
    if (confidence < 0.4) {
      continue;
    }

    const category = VALID_CATEGORIES.has(String(raw.category)) ? (raw.category as AuditCategory) : "clarity";
    const severity = VALID_SEVERITIES.has(String(raw.severity))
      ? (raw.severity as AuditFinding["severity"])
      : "info";

    findings.push({
      id: `finding-${counter++}`,
      severity,
      category,
      file: String(raw.file ?? "(unknown)"),
      line: typeof raw.line === "number" ? raw.line : null,
      description: String(raw.description ?? ""),
      confidence,
      dismissed: false,
      dismissNote: null
    });
  }

  if (findings.length === 0) {
    findings.push({
      id: "finding-1",
      severity: "info",
      category: "drift",
      file: "(n/a)",
      line: null,
      description: "No audit findings were detected for the selected scope.",
      confidence: 1,
      dismissed: false,
      dismissNote: null
    });
  }

  return findings;
};
