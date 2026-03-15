import { LlmProviderError } from "./errors.js";
import { ANTHROPIC_SSE_CONFIG, OPENAI_SSE_CONFIG, parseStreamingSse } from "./sse-parser.js";

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
  complete(request: LlmRequest, onToken?: LlmTokenHandler): Promise<string>;
}

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 120_000;

const classifyProviderError = (statusCode: number, message: string): LlmProviderError => {
  const normalized = message.toLowerCase();

  if (statusCode === 401 || normalized.includes("invalid api key") || normalized.includes("authentication")) {
    return new LlmProviderError("Invalid provider API key", "invalid_api_key", statusCode);
  }

  if (statusCode === 429 || normalized.includes("rate limit")) {
    return new LlmProviderError("Rate limited by provider", "rate_limit", statusCode);
  }

  // Extract a useful detail from the provider response
  let detail = "";
  try {
    const parsed = JSON.parse(message);
    detail = parsed?.error?.message ?? "";
  } catch {
    detail = message.slice(0, 200);
  }
  const suffix = detail ? `: ${detail}` : ` (HTTP ${statusCode})`;
  return new LlmProviderError(`Provider request failed${suffix}`, "provider_error", statusCode);
};

export class HttpLlmClient implements LlmClient {
  private readonly fetchImpl: typeof fetch;

  public constructor(fetchImpl: typeof fetch = fetch) {
    this.fetchImpl = fetchImpl;
  }

  public async complete(request: LlmRequest, onToken?: LlmTokenHandler): Promise<string> {
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

    try {
      return await this.executeRequest(request, controller.signal, onToken);
    } catch (error) {
      if ((error as Error).name === "AbortError") {
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
    const response = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": request.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: request.model,
        system: request.systemPrompt,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        stream: true,
        messages: [{ role: "user", content: request.userPrompt }]
      })
    });

    if (!response.ok) {
      const raw = await response.text();
      throw classifyProviderError(response.status, raw);
    }

    return parseStreamingSse(response, ANTHROPIC_SSE_CONFIG, onToken);
  }

  private async requestOpenAi(
    request: LlmRequest,
    signal: AbortSignal,
    onToken?: LlmTokenHandler
  ): Promise<string> {
    const response = await this.fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${request.apiKey}`
      },
      body: JSON.stringify({
        model: request.model,
        max_completion_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        stream: true,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const raw = await response.text();
      throw classifyProviderError(response.status, raw);
    }

    return parseStreamingSse(response, OPENAI_SSE_CONFIG, onToken);
  }

  private async requestOpenRouter(
    request: LlmRequest,
    signal: AbortSignal,
    onToken?: LlmTokenHandler
  ): Promise<string> {
    const response = await this.fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${request.apiKey}`,
        "HTTP-Referer": "https://specflow.local",
        "X-Title": "SpecFlow"
      },
      body: JSON.stringify({
        model: request.model,
        temperature: 0.2,
        max_completion_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        stream: true,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const raw = await response.text();
      throw classifyProviderError(response.status, raw);
    }

    return parseStreamingSse(response, OPENAI_SSE_CONFIG, onToken);
  }
}
