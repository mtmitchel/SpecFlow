import type { ArtifactsSnapshot } from "../types";
import { requestJson } from "./http";

export const fetchArtifacts = async (): Promise<ArtifactsSnapshot> => {
  return requestJson<ArtifactsSnapshot>("/api/artifacts");
};
