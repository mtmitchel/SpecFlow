export type TicketStatus = "backlog" | "ready" | "in-progress" | "verify" | "done";

export type AgentTarget = "claude-code" | "codex-cli" | "opencode" | "generic";

export interface InitiativePhase {
  id: string;
  name: string;
  order: number;
  status: "active" | "complete";
}

export interface Initiative {
  id: string;
  title: string;
  description: string;
  status: "draft" | "active" | "done";
  phases: InitiativePhase[];
  specIds: string[];
  ticketIds: string[];
  mermaidDiagram?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Ticket {
  id: string;
  initiativeId: string | null;
  phaseId: string | null;
  title: string;
  description: string;
  status: TicketStatus;
  acceptanceCriteria: Array<{ id: string; text: string }>;
  implementationPlan: string;
  fileTargets: string[];
  blockedBy: string[];
  blocks: string[];
  runId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Run {
  id: string;
  ticketId: string | null;
  type: "execution" | "audit";
  agentType: "claude-code" | "codex-cli" | "opencode" | "generic";
  status: "pending" | "complete";
  attempts: string[];
  committedAttemptId: string | null;
  activeOperationId: string | null;
  operationLeaseExpiresAt: string | null;
  lastCommittedAt: string | null;
  createdAt: string;
}

export interface RunAttempt {
  id: string;
  attemptId: string;
  overallPass: boolean;
  overrideReason: string | null;
  overrideAccepted: boolean;
  createdAt: string;
}

export interface RunListAttempt {
  attemptId: string;
  overallPass: boolean;
  createdAt: string;
}

export interface RunListItem {
  run: Run;
  ticket: Ticket | null;
  attempts: RunListAttempt[];
  operationState: "prepared" | "committed" | "abandoned" | "superseded" | "failed" | null;
}

export type VerificationSeverity = "critical" | "major" | "minor" | "outdated";

export interface VerificationResult {
  overallPass: boolean;
  criteriaResults: Array<{
    criterionId: string;
    pass: boolean;
    evidence: string;
    severity?: VerificationSeverity;
    remediationHint?: string;
  }>;
  driftFlags: Array<{
    type: string;
    file: string;
    description: string;
    severity?: VerificationSeverity;
  }>;
}

export interface RunDetailAttempt {
  id: string;
  attemptId: string;
  agentSummary: string;
  diffSource: "git" | "snapshot";
  initialScopePaths: string[];
  widenedScopePaths: string[];
  primaryDiffPath: string;
  driftDiffPath: string | null;
  overrideReason: string | null;
  overrideAccepted: boolean;
  criteriaResults: Array<{
    criterionId: string;
    pass: boolean;
    evidence: string;
    severity?: VerificationSeverity;
    remediationHint?: string;
  }>;
  driftFlags: Array<{
    type: string;
    file: string;
    description: string;
    severity?: VerificationSeverity;
  }>;
  overallPass: boolean;
  createdAt: string;
}

export interface RunDetail {
  run: Run;
  ticket: Ticket | null;
  attempts: RunDetailAttempt[];
  operationState: "prepared" | "committed" | "abandoned" | "superseded" | "failed" | null;
  committed: {
    attemptId: string;
    attempt: RunDetailAttempt | null;
    bundleManifest: {
      contextFiles: string[];
      requiredFiles: string[];
      [key: string]: unknown;
    } | null;
    primaryDiff: string | null;
    driftDiff: string | null;
  } | null;
}

export type AuditCategory = "drift" | "acceptance" | "convention" | "bug" | "performance" | "security" | "clarity";

export interface AuditFinding {
  id: string;
  severity: "error" | "warning" | "info";
  category: AuditCategory;
  file: string;
  line: number | null;
  description: string;
  confidence?: number;
  dismissed: boolean;
  dismissNote: string | null;
}

export interface AuditReport {
  runId: string;
  generatedAt: string;
  diffSourceMode: "branch" | "commit-range" | "snapshot";
  defaultScope: string[];
  primaryDiff: string;
  driftDiff: string | null;
  findings: AuditFinding[];
}

export interface SpecDocument {
  id: string;
  initiativeId: string | null;
  type: "brief" | "prd" | "tech-spec" | "decision";
  title: string;
  content: string;
  sourcePath: string;
  createdAt: string;
  updatedAt: string;
}

export interface Config {
  provider: "anthropic" | "openai" | "openrouter";
  model: string;
  hasApiKey?: boolean;
  port: number;
  host: string;
  repoInstructionFile: string;
}

export interface ConfigSavePayload {
  provider: "anthropic" | "openai" | "openrouter";
  model: string;
  apiKey?: string;
  port: number;
  host: string;
  repoInstructionFile: string;
}

export interface ProviderModel {
  id: string;
  name: string;
  contextLength: number | null;
}

export interface ArtifactsSnapshot {
  config: Config | null;
  initiatives: Initiative[];
  tickets: Ticket[];
  runs: Run[];
  runAttempts: RunAttempt[];
  specs: SpecDocument[];
}
