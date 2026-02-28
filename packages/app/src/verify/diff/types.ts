import type { DriftFlag, Ticket } from "../../types/entities.js";

export interface DiffComputationInput {
  ticket: Ticket;
  runId: string;
  baselineAttemptId: string | null;
  scopePaths?: string[];
  widenedScopePaths: string[];
  diffSource?: DiffSourceSelection;
}

export type DiffSourceSelection =
  | { mode: "auto" }
  | { mode: "branch"; branch: string }
  | { mode: "commit-range"; from: string; to: string }
  | { mode: "snapshot" };

export interface DiffComputationResult {
  diffSource: "git" | "snapshot";
  primaryDiff: string;
  driftDiff: string | null;
  initialScopePaths: string[];
  widenedScopePaths: string[];
  changedFiles: string[];
  driftFlags: DriftFlag[];
}
