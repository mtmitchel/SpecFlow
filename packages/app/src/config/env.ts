import { readFile } from "node:fs/promises";
import path from "node:path";
import { config as loadDotEnv } from "dotenv";
import { writeFileAtomic } from "../io/atomic-write.js";
import type { ProviderId, ProviderKeyStatus } from "../types/entities.js";

const loadedRoots = new Set<string>();

export const loadEnvironment = (rootDir: string): void => {
  const normalizedRoot = path.resolve(rootDir);
  if (loadedRoots.has(normalizedRoot)) {
    return;
  }

  loadDotEnv({ path: path.join(normalizedRoot, ".env"), override: false });
  loadedRoots.add(normalizedRoot);
};

const envFilePath = (rootDir: string): string => path.join(path.resolve(rootDir), ".env");

export const providerApiKeyEnvVar = (provider: ProviderId): string => {
  switch (provider) {
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "openai":
      return "OPENAI_API_KEY";
    case "openrouter":
      return "OPENROUTER_API_KEY";
    default: {
      const exhaustive: never = provider;
      return String(exhaustive);
    }
  }
};

const serializeEnvValue = (value: string): string => JSON.stringify(value);

const replaceEnvValue = (content: string, key: string, value: string): string => {
  const assignment = `${key}=${serializeEnvValue(value)}`;
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const nextLines: string[] = [];
  let replaced = false;

  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match?.[1] !== key) {
      nextLines.push(line);
      continue;
    }

    if (!replaced) {
      nextLines.push(assignment);
      replaced = true;
    }
  }

  if (!replaced) {
    const hasVisibleLines = nextLines.some((line) => line.trim().length > 0);
    if (hasVisibleLines && nextLines[nextLines.length - 1] !== "") {
      nextLines.push("");
    }
    nextLines.push(assignment);
  }

  return `${nextLines.join("\n").replace(/\n*$/, "")}\n`;
};

export const setProviderApiKey = async (
  rootDir: string,
  provider: ProviderId,
  apiKey: string
): Promise<void> => {
  const trimmed = apiKey.trim();
  const envVarName = providerApiKeyEnvVar(provider);

  let existing = "";
  try {
    existing = await readFile(envFilePath(rootDir), "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }

  await writeFileAtomic(envFilePath(rootDir), replaceEnvValue(existing, envVarName, trimmed));
  process.env[envVarName] = trimmed;
};

export const getProviderKeyStatus = (): ProviderKeyStatus => ({
  anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
  openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
  openrouter: Boolean(process.env.OPENROUTER_API_KEY?.trim())
});

export const resolveProviderApiKey = (
  provider: ProviderId,
  fallback?: string
): string => {
  const envVarName = providerApiKeyEnvVar(provider);
  const fromEnv = process.env[envVarName];
  if (fromEnv?.trim()) {
    return fromEnv.trim();
  }

  return fallback?.trim() ?? "";
};
