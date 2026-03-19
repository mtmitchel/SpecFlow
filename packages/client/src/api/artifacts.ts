import type { ArtifactsSnapshot, SpecDocument } from "../types";
import { normalizeArtifactsSnapshot } from "../config-normalization";
import { parse, requestJson } from "./http";
import { transportRequest, type TransportRequestOptions } from "./transport";

const ARTIFACTS_REFRESH_TIMEOUT_MS = 20_000;
const SPEC_DETAIL_TIMEOUT_MS = 20_000;

export const fetchArtifacts = async (
  options?: TransportRequestOptions
): Promise<ArtifactsSnapshot> => {
  const snapshot = await transportRequest(
    "artifacts.snapshot",
    {},
    (signal) =>
      requestJson<ArtifactsSnapshot>("/api/artifacts", {
        signal
      }),
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
  const payload = await transportRequest<{ spec: SpecDocument }>(
    "specs.detail",
    { id: specId },
    async (signal) => {
      const response = await fetch(`/api/specs/${specId}`, { signal });
      return parse<{ spec: SpecDocument }>(response);
    },
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
