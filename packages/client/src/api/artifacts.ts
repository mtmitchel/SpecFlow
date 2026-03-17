import type { ArtifactsSnapshot, SpecDocument } from "../types";
import { parse, requestJson } from "./http";
import { transportRequest } from "./transport";

export const fetchArtifacts = async (): Promise<ArtifactsSnapshot> => {
  return transportRequest("artifacts.snapshot", {}, () =>
    requestJson<ArtifactsSnapshot>("/api/artifacts")
  );
};

export const fetchSpecDetail = async (
  specId: string,
  options?: { signal?: AbortSignal }
): Promise<SpecDocument> => {
  const payload = await transportRequest<{ spec: SpecDocument }>(
    "specs.detail",
    { id: specId },
    async (signal) => {
      const response = await fetch(`/api/specs/${specId}`, { signal });
      return parse<{ spec: SpecDocument }>(response);
    },
    undefined,
    options
  );
  return payload.spec;
};
