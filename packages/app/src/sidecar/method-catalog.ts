import { existsSync, readFileSync } from "node:fs";

interface SidecarMethodCatalog {
  longRunningMethods: string[];
  mutatingMethods: string[];
}

const resolveMethodCatalogUrl = (): URL => {
  const bundledUrl = new URL("./method-catalog.json", import.meta.url);
  if (existsSync(bundledUrl)) {
    return bundledUrl;
  }

  return new URL("../../src/sidecar/method-catalog.json", import.meta.url);
};

const sidecarMethodCatalog = JSON.parse(
  readFileSync(resolveMethodCatalogUrl(), "utf8")
) as SidecarMethodCatalog;

export const SIDECAR_LONG_RUNNING_METHODS = new Set(sidecarMethodCatalog.longRunningMethods);
export const SIDECAR_MUTATING_METHODS = new Set(sidecarMethodCatalog.mutatingMethods);

export const isLongRunningSidecarMethod = (method: string): boolean =>
  SIDECAR_LONG_RUNNING_METHODS.has(method);

export const isMutatingSidecarMethod = (method: string): boolean =>
  SIDECAR_MUTATING_METHODS.has(method);
