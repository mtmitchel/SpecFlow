export interface DiffChange {
  file: string;
  line: number;
  content: string;
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
