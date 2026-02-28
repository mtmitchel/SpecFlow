export interface DiffChange {
  file: string;
  line: number;
  content: string;
}

export interface AuditFinding {
  id: string;
  severity: "error" | "warning" | "info";
  category: "drift" | "acceptance" | "convention";
  file: string;
  line: number | null;
  description: string;
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
