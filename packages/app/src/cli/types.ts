export type OutputFormat = "text" | "json";

export type AgentTarget = "claude-code" | "codex-cli" | "opencode" | "generic";

export interface RuntimeStatusPayload {
  protocolVersion?: string;
  capabilities?: Record<string, boolean>;
}
