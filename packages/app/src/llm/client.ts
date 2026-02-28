import { LlmProviderError } from "./errors.js";

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

  return new LlmProviderError("Provider request failed", "provider_error", statusCode);
};

/** Parse Anthropic streaming SSE and return accumulated text, calling onToken for each delta. */
const streamAnthropic = async (
  response: Response,
  onToken?: LlmTokenHandler
): Promise<string> => {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new LlmProviderError("Anthropic response body is not readable", "provider_error");
  }

  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) {
        continue;
      }

      const data = line.slice(5).trim();
      if (!data) {
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }

      const event = parsed as {
        type?: string;
        delta?: { type?: string; text?: string };
        error?: { message?: string };
      };

      if (event.type === "error" && event.error?.message) {
        throw new LlmProviderError(event.error.message, "provider_error");
      }

      if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
        const text = event.delta.text;
        accumulated += text;
        if (onToken) {
          await onToken(text);
        }
      }
    }
  }

  return accumulated;
};

/** Parse OpenAI-compatible streaming SSE (also used for OpenRouter) and return accumulated text. */
const streamOpenAi = async (
  response: Response,
  onToken?: LlmTokenHandler
): Promise<string> => {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new LlmProviderError("OpenAI response body is not readable", "provider_error");
  }

  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) {
        continue;
      }

      const data = line.slice(5).trim();
      if (data === "[DONE]") {
        break;
      }

      if (!data) {
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }

      const event = parsed as {
        choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
        error?: { message?: string };
      };

      if (event.error?.message) {
        throw new LlmProviderError(event.error.message, "provider_error");
      }

      const content = event.choices?.[0]?.delta?.content;
      if (content) {
        accumulated += content;
        if (onToken) {
          await onToken(content);
        }
      }
    }
  }

  return accumulated;
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

    return streamAnthropic(response, onToken);
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
        temperature: 0.2,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
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

    return streamOpenAi(response, onToken);
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
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
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

    return streamOpenAi(response, onToken);
  }
}
