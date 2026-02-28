import type { AgentTarget, OutputFormat } from "./types.js";

export const parseInteger = (value: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Expected integer but received '${value}'`);
  }

  return parsed;
};

export const parseOutputFormat = (value: string): OutputFormat => {
  if (value === "json" || value === "text") {
    return value;
  }

  throw new Error(`Unsupported format '${value}'. Use 'text' or 'json'.`);
};

export const parseAgent = (value: string): AgentTarget => {
  if (value === "claude-code" || value === "codex-cli" || value === "opencode" || value === "generic") {
    return value;
  }

  throw new Error(`Unsupported agent '${value}'`);
};
