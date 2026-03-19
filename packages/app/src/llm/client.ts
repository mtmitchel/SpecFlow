import { LlmProviderError } from "./errors.js";
import { ANTHROPIC_SSE_CONFIG, OPENAI_SSE_CONFIG, parseStreamingSse } from "./sse-parser.js";
import { asCancelledError } from "../cancellation.js";

export interface LlmRequest {
  provider: "anthropic" | "openai" | "openrouter";
  model: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  timeoutMs?: number;
}

export type LlmTokenHandler = (chunk: string) => Promise<void> | void;

export interface LlmClient {
  complete(request: LlmRequest, onToken?: LlmTokenHandler, options?: { signal?: AbortSignal }): Promise<string>;
}

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 120_000;

const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;
const LOW_SURROGATE_START = 0xdc00;
const LOW_SURROGATE_END = 0xdfff;

const normalizeTransportText = (value: string): string => {
  let normalized = "";

  for (let index = 0; index < value.length; index += 1) {
    const current = value.charCodeAt(index);

    if (
      (current < 0x20 && current !== 0x09 && current !== 0x0a && current !== 0x0d) ||
      (current >= 0x7f && current <= 0x9f)
    ) {
      normalized += " ";
      continue;
    }

    if (current >= HIGH_SURROGATE_START && current <= HIGH_SURROGATE_END) {
      const next = value.charCodeAt(index + 1);
      if (next >= LOW_SURROGATE_START && next <= LOW_SURROGATE_END) {
        normalized += value[index] ?? "";
        normalized += value[index + 1] ?? "";
        index += 1;
        continue;
      }

      normalized += "\uFFFD";
      continue;
    }

    if (current >= LOW_SURROGATE_START && current <= LOW_SURROGATE_END) {
      normalized += "\uFFFD";
      continue;
    }

    normalized += value[index] ?? "";
  }

  return normalized;
};

const sanitizeTransportValue = (value: unknown): unknown => {
  if (typeof value === "string") {
    return normalizeTransportText(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeTransportValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeTransportValue(entry)])
    );
  }

  return value;
};

const serializeRequestBody = (payload: Record<string, unknown>): { body: string; requestBytes: number } => {
  const sanitizedPayload = sanitizeTransportValue(payload);
  const body = JSON.stringify(sanitizedPayload);

  if (typeof body !== "string") {
    throw new LlmProviderError("Failed to serialize provider request body", "provider_error");
  }

  return {
    body,
    requestBytes: Buffer.byteLength(body, "utf8")
  };
};

const extractProviderDetail = (message: string): string => {
  try {
    const parsed = JSON.parse(message);
    return String(parsed?.error?.message ?? "").trim();
  } catch {
    return message.slice(0, 200).trim();
  }
};

const classifyProviderError = (
  statusCode: number,
  message: string,
  metadata?: { requestBytes?: number }
): LlmProviderError => {
  const normalized = message.toLowerCase();
  const detail = extractProviderDetail(message);

  if (statusCode === 401 || normalized.includes("invalid api key") || normalized.includes("authentication")) {
    return new LlmProviderError("Invalid provider API key", "invalid_api_key", statusCode);
  }

  if (statusCode === 429 || normalized.includes("rate limit")) {
    return new LlmProviderError("Rate limited by provider", "rate_limit", statusCode);
  }

  if (normalized.includes("parse the json body")) {
    const sizeSuffix =
      typeof metadata?.requestBytes === "number"
        ? ` Request size: ${metadata.requestBytes.toLocaleString()} bytes.`
        : "";
    return new LlmProviderError(
      `Provider request failed: ${detail || "The provider rejected the JSON request body."}${sizeSuffix}`,
      "provider_error",
      statusCode
    );
  }

  const suffix = detail ? `: ${detail}` : ` (HTTP ${statusCode})`;
  return new LlmProviderError(`Provider request failed${suffix}`, "provider_error", statusCode);
};

export class HttpLlmClient implements LlmClient {
  private readonly fetchImpl: typeof fetch;

  public constructor(fetchImpl: typeof fetch = fetch) {
    this.fetchImpl = fetchImpl;
  }

  public async complete(
    request: LlmRequest,
    onToken?: LlmTokenHandler,
    options?: { signal?: AbortSignal }
  ): Promise<string> {
    if (!request.apiKey.trim()) {
      throw new LlmProviderError(
        "Missing API key. Set provider key in .env (OPENROUTER_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY).",
        "invalid_api_key"
      );
    }

    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    const signal = options?.signal
      ? AbortSignal.any([controller.signal, options.signal])
      : controller.signal;

    try {
      return await this.executeRequest(request, signal, onToken);
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        if (options?.signal?.aborted) {
          throw asCancelledError(options.signal.reason);
        }
        throw new LlmProviderError("Provider request timed out", "timeout");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async executeRequest(
    request: LlmRequest,
    signal: AbortSignal,
    onToken?: LlmTokenHandler
  ): Promise<string> {
    if (request.provider === "openrouter") {
      return this.requestOpenRouter(request, signal, onToken);
    }

    if (request.provider === "openai") {
      return this.requestOpenAi(request, signal, onToken);
    }

    return this.requestAnthropic(request, signal, onToken);
  }

  private async requestAnthropic(
    request: LlmRequest,
    signal: AbortSignal,
    onToken?: LlmTokenHandler
  ): Promise<string> {
    const payload = serializeRequestBody({
      model: request.model,
      system: request.systemPrompt,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream: true,
      messages: [{ role: "user", content: request.userPrompt }]
    });
    const response = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": request.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: payload.body
    });

    if (!response.ok) {
      const raw = await response.text();
      throw classifyProviderError(response.status, raw, payload);
    }

    return parseStreamingSse(response, ANTHROPIC_SSE_CONFIG, onToken);
  }

  private async requestOpenAi(
    request: LlmRequest,
    signal: AbortSignal,
    onToken?: LlmTokenHandler
  ): Promise<string> {
    const payload = serializeRequestBody({
      model: request.model,
      max_completion_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream: true,
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userPrompt }
      ]
    });
    const response = await this.fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${request.apiKey}`
      },
      body: payload.body
    });

    if (!response.ok) {
      const raw = await response.text();
      throw classifyProviderError(response.status, raw, payload);
    }

    return parseStreamingSse(response, OPENAI_SSE_CONFIG, onToken);
  }

  private async requestOpenRouter(
    request: LlmRequest,
    signal: AbortSignal,
    onToken?: LlmTokenHandler
  ): Promise<string> {
    const payload = serializeRequestBody({
      model: request.model,
      temperature: 0.2,
      max_completion_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream: true,
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userPrompt }
      ]
    });
    const response = await this.fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${request.apiKey}`,
        "HTTP-Referer": "https://specflow.local",
        "X-Title": "SpecFlow"
      },
      body: payload.body
    });

    if (!response.ok) {
      const raw = await response.text();
      throw classifyProviderError(response.status, raw, payload);
    }

    return parseStreamingSse(response, OPENAI_SSE_CONFIG, onToken);
  }
}
