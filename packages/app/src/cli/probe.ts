import { PROTOCOL_VERSION } from "../server/runtime-status.js";
import { configPath } from "../io/paths.js";
import { readYamlFile } from "../io/yaml.js";
import type { Config } from "../types/entities.js";
import { withTimeout } from "./timeout.js";
import type { RuntimeStatusPayload } from "./types.js";

export const normalizeServerBaseUrl = (serverUrl: string): string => serverUrl.replace(/\/$/, "");

export const loadCliConfig = async (rootDir: string): Promise<{ host: string; port: number }> => {
  const config = await readYamlFile<Config>(configPath(rootDir));

  return {
    host: config?.host ?? "127.0.0.1",
    port: config?.port ?? 3141
  };
};

export const probeRuntimeStatus = async (
  baseUrl: string,
  timeoutMs: number
): Promise<{ reachable: boolean; payload: RuntimeStatusPayload | null }> => {
  const result = await withTimeout(timeoutMs, async (signal) => {
    const response = await fetch(`${baseUrl}/api/runtime/status`, { signal });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as RuntimeStatusPayload;
  }).catch(() => ({ timedOut: true } as const));

  if (result.timedOut) {
    return { reachable: false, payload: null };
  }

  return {
    reachable: true,
    payload: result.value
  };
};

export const assertDelegationCompatible = (
  payload: RuntimeStatusPayload | null,
  requiredCapability: "exportBundle" | "verifyCapture"
): void => {
  if (!payload) {
    throw new Error("Server runtime status probe returned an invalid response");
  }

  if (payload.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(
      `Server protocol mismatch (server=${payload.protocolVersion ?? "unknown"}, cli=${PROTOCOL_VERSION}); refusing local fallback`
    );
  }

  if (!payload.capabilities?.[requiredCapability]) {
    throw new Error(`Server capability '${requiredCapability}' is unavailable; refusing local fallback`);
  }
};

export const probeOperationStatus = async (
  baseUrl: string,
  operationId: string,
  timeoutMs: number
): Promise<{ state: string } | null> => {
  const result = await withTimeout(timeoutMs, async (signal) => {
    const response = await fetch(`${baseUrl}/api/operations/${operationId}`, { signal });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as { state?: string } | null;
  });

  if (result.timedOut || !result.value?.state) {
    return null;
  }

  return {
    state: result.value.state
  };
};
