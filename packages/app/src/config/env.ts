import path from "node:path";
import { config as loadDotEnv } from "dotenv";

const loadedRoots = new Set<string>();

export const loadEnvironment = (rootDir: string): void => {
  const normalizedRoot = path.resolve(rootDir);
  if (loadedRoots.has(normalizedRoot)) {
    return;
  }

  loadDotEnv({ path: path.join(normalizedRoot, ".env"), override: false });
  loadedRoots.add(normalizedRoot);
};

export const providerApiKeyEnvVar = (provider: "anthropic" | "openai" | "openrouter"): string => {
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

export const resolveProviderApiKey = (
  provider: "anthropic" | "openai" | "openrouter",
  fallback?: string
): string => {
  const envVarName = providerApiKeyEnvVar(provider);
  const fromEnv = process.env[envVarName];
  if (fromEnv?.trim()) {
    return fromEnv.trim();
  }

  return fallback?.trim() ?? "";
};
