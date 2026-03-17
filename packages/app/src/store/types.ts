import type { RunAttempt } from "../types/entities.js";

export interface PreparedOperationArtifacts {
  bundleManifest?: unknown;
  verification?: RunAttempt;
  primaryDiff?: string;
  driftDiff?: string;
  additionalFiles?: Array<{
    relativePath: string;
    content: string;
  }>;
}
