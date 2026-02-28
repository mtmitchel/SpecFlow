import { LlmProviderError } from "./errors.js";

export interface LlmRequest {
  provider: "anthropic" | "openai" | "openrouter";
  model: string;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  timeoutMs?: number;
}

export type LlmTokenHandler = (chunk: string) => Promise<void> | void;

export interface LlmClient {
  complete(request: LlmRequest, onToken?: LlmTokenHandler): Promise<string>;
}

const defaultTimeoutMs = 30_000;

const chunkText = (text: string, chunkSize = 24): string[] => {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += chunkSize) {
    chunks.push(text.slice(index, index + chunkSize));
  }
  return chunks;
};

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

const parseOpenAiResponseText = (payload: unknown): string => {
  const maybe = payload as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = maybe.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new LlmProviderError("OpenAI response missing text content", "provider_error");
  }

  return content;
};

const parseAnthropicResponseText = (payload: unknown): string => {
  const maybe = payload as {
    content?: Array<{ type?: string; text?: string }>;
  };

  const textPart = maybe.content?.find((part) => part.type === "text" && typeof part.text === "string");
  if (!textPart?.text) {
    throw new LlmProviderError("Anthropic response missing text content", "provider_error");
  }

  return textPart.text;
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

    const timeoutMs = request.timeoutMs ?? defaultTimeoutMs;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const text = await this.executeRequest(request, controller.signal);
      if (onToken) {
        for (const chunk of chunkText(text)) {
          await onToken(chunk);
        }
      }

      return text;
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw new LlmProviderError("Provider request timed out", "timeout");
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async executeRequest(request: LlmRequest, signal: AbortSignal): Promise<string> {
    if (request.provider === "openrouter") {
      return this.requestOpenRouter(request, signal);
    }

    if (request.provider === "openai") {
      return this.requestOpenAi(request, signal);
    }

    return this.requestAnthropic(request, signal);
  }

  private async requestOpenAi(request: LlmRequest, signal: AbortSignal): Promise<string> {
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
        messages: [
          {
            role: "system",
            content: request.systemPrompt
          },
          {
            role: "user",
            content: request.userPrompt
          }
        ]
      })
    });

    const raw = await response.text();

    if (!response.ok) {
      throw classifyProviderError(response.status, raw);
    }

    const payload = JSON.parse(raw) as unknown;
    return parseOpenAiResponseText(payload);
  }

  private async requestAnthropic(request: LlmRequest, signal: AbortSignal): Promise<string> {
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
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: request.userPrompt
          }
        ]
      })
    });

    const raw = await response.text();

    if (!response.ok) {
      throw classifyProviderError(response.status, raw);
    }

    const payload = JSON.parse(raw) as unknown;
    return parseAnthropicResponseText(payload);
  }

  private async requestOpenRouter(request: LlmRequest, signal: AbortSignal): Promise<string> {
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
        messages: [
          {
            role: "system",
            content: request.systemPrompt
          },
          {
            role: "user",
            content: request.userPrompt
          }
        ]
      })
    });

    const raw = await response.text();

    if (!response.ok) {
      throw classifyProviderError(response.status, raw);
    }

    const payload = JSON.parse(raw) as unknown;
    return parseOpenAiResponseText(payload);
  }
}
