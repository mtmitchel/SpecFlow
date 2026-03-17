import type { ArtifactsSnapshot } from "../types";
import { requestJson } from "./http";
import { transportRequest } from "./transport";

export const fetchArtifacts = async (): Promise<ArtifactsSnapshot> => {
  return transportRequest("artifacts.snapshot", {}, () =>
    requestJson<ArtifactsSnapshot>("/api/artifacts")
  );
};
