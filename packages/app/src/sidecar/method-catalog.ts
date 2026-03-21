import { readFileSync } from "node:fs";

interface SidecarMethodCatalog {
  longRunningMethods: string[];
  mutatingMethods: string[];
}

const sidecarMethodCatalog = JSON.parse(
  readFileSync(new URL("./method-catalog.json", import.meta.url), "utf8")
) as SidecarMethodCatalog;

export const SIDECAR_LONG_RUNNING_METHODS = new Set(sidecarMethodCatalog.longRunningMethods);
export const SIDECAR_MUTATING_METHODS = new Set(sidecarMethodCatalog.mutatingMethods);

export const isLongRunningSidecarMethod = (method: string): boolean =>
  SIDECAR_LONG_RUNNING_METHODS.has(method);

export const isMutatingSidecarMethod = (method: string): boolean =>
  SIDECAR_MUTATING_METHODS.has(method);
