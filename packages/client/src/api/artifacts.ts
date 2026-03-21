import type { ArtifactsSnapshot, SpecDocument } from "../types";
import { normalizeArtifactsSnapshot } from "../config-normalization";
import { transportJsonRequest, type TransportRequestOptions } from "./transport";

const ARTIFACTS_REFRESH_TIMEOUT_MS = 20_000;
const SPEC_DETAIL_TIMEOUT_MS = 20_000;

export const fetchArtifacts = async (
  options?: TransportRequestOptions
): Promise<ArtifactsSnapshot> => {
  const snapshot = await transportJsonRequest<ArtifactsSnapshot>(
    "artifacts.snapshot",
    {},
    undefined,
    {
      ...options,
      timeoutMs: options?.timeoutMs ?? ARTIFACTS_REFRESH_TIMEOUT_MS,
      timeoutMessage:
        options?.timeoutMessage ?? "Refreshing the workspace took too long. Try again."
    }
  );

  return normalizeArtifactsSnapshot(snapshot);
};

export const fetchSpecDetail = async (
  specId: string,
  options?: TransportRequestOptions
): Promise<SpecDocument> => {
  const payload = await transportJsonRequest<{ spec: SpecDocument }>(
    "specs.detail",
    { id: specId },
    undefined,
    {
      ...options,
      timeoutMs: options?.timeoutMs ?? SPEC_DETAIL_TIMEOUT_MS,
      timeoutMessage:
        options?.timeoutMessage ?? "Loading the draft took too long. Try again."
    }
  );
  return payload.spec;
};
