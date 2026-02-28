export type InitiativeStatus = "draft" | "active" | "done";
export type PhaseStatus = "active" | "complete";

export interface InitiativePhase {
  id: string;
  name: string;
  order: number;
  status: PhaseStatus;
}

export interface Initiative {
  id: string;
  title: string;
  description: string;
  status: InitiativeStatus;
  phases: InitiativePhase[];
  specIds: string[];
  ticketIds: string[];
  mermaidDiagram?: string;
  createdAt: string;
  updatedAt: string;
}

export type TicketStatus = "backlog" | "ready" | "in-progress" | "verify" | "done";

export interface TicketCriterion {
  id: string;
  text: string;
}

export interface Ticket {
  id: string;
  initiativeId: string | null;
  phaseId: string | null;
  title: string;
  description: string;
  status: TicketStatus;
  acceptanceCriteria: TicketCriterion[];
  implementationPlan: string;
  fileTargets: string[];
  blockedBy: string[];
  blocks: string[];
  runId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RunType = "execution" | "audit";
export type AgentType = "claude-code" | "codex-cli" | "opencode" | "generic";
export type RunStatus = "pending" | "complete";

export interface Run {
  id: string;
  ticketId: string | null;
  type: RunType;
  agentType: AgentType;
  status: RunStatus;
  attempts: string[];
  committedAttemptId: string | null;
  activeOperationId: string | null;
  operationLeaseExpiresAt: string | null;
  lastCommittedAt: string | null;
  createdAt: string;
}

export type VerificationSeverity = "critical" | "major" | "minor" | "outdated";

export interface DriftFlag {
  type: "unexpected-file" | "missing-requirement" | "pre-capture-drift" | "widened-scope-drift";
  file: string;
  description: string;
  severity?: VerificationSeverity;
}

export interface RunCriterionResult {
  criterionId: string;
  pass: boolean;
  evidence: string;
  severity?: VerificationSeverity;
  remediationHint?: string;
}

export interface RunAttempt {
  attemptId: string;
  agentSummary: string;
  diffSource: "git" | "snapshot";
  initialScopePaths: string[];
  widenedScopePaths: string[];
  primaryDiffPath: string;
  driftDiffPath: string | null;
  overrideReason: string | null;
  overrideAccepted: boolean;
  criteriaResults: RunCriterionResult[];
  driftFlags: DriftFlag[];
  overallPass: boolean;
  createdAt: string;
}

export type SpecType = "brief" | "prd" | "tech-spec" | "decision";

export interface SpecDocument {
  id: string;
  initiativeId: string | null;
  type: SpecType;
  title: string;
  content: string;
  sourcePath: string;
  createdAt: string;
  updatedAt: string;
}

export interface Config {
  provider: "anthropic" | "openai" | "openrouter";
  model: string;
  apiKey?: string;
  port: number;
  host: string;
  repoInstructionFile: string;
}

export type OperationState = "prepared" | "committed" | "abandoned" | "superseded" | "failed";

export interface OperationManifest {
  operationId: string;
  runId: string;
  targetAttemptId: string;
  state: OperationState;
  leaseExpiresAt: string;
  validation: {
    passed: boolean;
    details?: string;
  };
  preparedAt: string;
  updatedAt: string;
  committedAt?: string;
}
