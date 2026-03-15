import { LlmProviderError } from "./errors.js";
import type { LlmTokenHandler } from "./client.js";

export interface SseParseConfig {
  completionSentinel?: string;
  extractContent: (parsed: unknown) => string | undefined;
  extractError: (parsed: unknown) => string | undefined;
}

export const ANTHROPIC_SSE_CONFIG: SseParseConfig = {
  extractContent: (parsed) => {
    const event = parsed as {
      type?: string;
      delta?: { type?: string; text?: string };
    };
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      return event.delta.text;
    }
    return undefined;
  },
  extractError: (parsed) => {
    const event = parsed as { type?: string; error?: { message?: string } };
    if (event.type === "error" && event.error?.message) {
      return event.error.message;
    }
    return undefined;
  }
};

export const OPENAI_SSE_CONFIG: SseParseConfig = {
  completionSentinel: "[DONE]",
  extractContent: (parsed) => {
    const event = parsed as {
      choices?: Array<{ delta?: { content?: string } }>;
    };
    return event.choices?.[0]?.delta?.content;
  },
  extractError: (parsed) => {
    const event = parsed as { error?: { message?: string } };
    return event.error?.message;
  }
};

export const parseStreamingSse = async (
  response: Response,
  config: SseParseConfig,
  onToken?: LlmTokenHandler
): Promise<string> => {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new LlmProviderError("Response body is not readable", "provider_error");
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
      if (config.completionSentinel && data === config.completionSentinel) {
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

      const errorMessage = config.extractError(parsed);
      if (errorMessage) {
        throw new LlmProviderError(errorMessage, "provider_error");
      }

      const content = config.extractContent(parsed);
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
