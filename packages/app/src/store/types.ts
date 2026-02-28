import type { RunAttempt } from "../types/entities.js";

export interface PreparedOperationArtifacts {
  bundleFlat?: string;
  bundleManifest?: unknown;
  verification?: RunAttempt;
  primaryDiff?: string;
  driftDiff?: string;
  additionalFiles?: Array<{
    relativePath: string;
    content: string;
  }>;
}
