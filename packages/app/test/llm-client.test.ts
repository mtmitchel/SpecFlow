import { describe, expect, it, vi } from "vitest";
import { HttpLlmClient } from "../src/llm/client.js";
import { LlmProviderError } from "../src/llm/errors.js";

const makeOpenAiSseStream = (content: string): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  const sseText = [
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`,
    "",
    "data: [DONE]",
    ""
  ].join("\n");
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sseText));
      controller.close();
    }
  });
};

describe("HttpLlmClient OpenRouter support", () => {
  it("sends completion requests to OpenRouter and parses assistant text", async () => {
    const expectedContent =
      '{"decision":"ok","reason":"looks good","ticketDraft":{"title":"T","description":"D","acceptanceCriteria":["A"],"implementationPlan":"P","fileTargets":["src/a.ts"]}}';

    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");

      const payload = JSON.parse(String(init?.body));
      expect(payload.model).toBe("openrouter/model");
      expect(payload.messages[0].role).toBe("system");
      expect(payload.messages[1].role).toBe("user");
      expect(payload.stream).toBe(true);

      return new Response(makeOpenAiSseStream(expectedContent), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" }
      });
    });

    const client = new HttpLlmClient(fetchMock as unknown as typeof fetch);
    const output = await client.complete({
      provider: "openrouter",
      model: "openrouter/model",
      apiKey: "test-key",
      systemPrompt: "sys",
      userPrompt: "user"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(output).toContain('"decision":"ok"');
  });

  it("maps OpenRouter auth failures to invalid_api_key", async () => {
    const fetchMock = vi.fn(async () => new Response("invalid api key", { status: 401 }));
    const client = new HttpLlmClient(fetchMock as unknown as typeof fetch);

    await expect(
      client.complete({
        provider: "openrouter",
        model: "openrouter/model",
        apiKey: "bad",
        systemPrompt: "sys",
        userPrompt: "user"
      })
    ).rejects.toEqual(
      expect.objectContaining<LlmProviderError>({
        name: "LlmProviderError",
        code: "invalid_api_key"
      })
    );
  });

  it("replaces malformed surrogate code units before serializing prompt text", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));

      expect(payload.messages[0].content).toBe("sys \uFFFD prompt");
      expect(payload.messages[1].content).toBe("user \uFFFD prompt");

      return new Response(makeOpenAiSseStream('{"decision":"ok"}'), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" }
      });
    });

    const client = new HttpLlmClient(fetchMock as unknown as typeof fetch);
    await client.complete({
      provider: "openai",
      model: "gpt-5-mini",
      apiKey: "test-key",
      systemPrompt: "sys \uD800 prompt",
      userPrompt: "user \uDC00 prompt"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("strips disallowed control characters before serializing prompt text", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));

      expect(payload.messages[0].content).toBe("sys prompt");
      expect(payload.messages[1].content).toBe("user  prompt");

      return new Response(makeOpenAiSseStream('{"decision":"ok"}'), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" }
      });
    });

    const client = new HttpLlmClient(fetchMock as unknown as typeof fetch);
    await client.complete({
      provider: "openai",
      model: "gpt-5-mini",
      apiKey: "test-key",
      systemPrompt: "sys\u0000prompt",
      userPrompt: "user\u0007\u0085prompt"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("includes the serialized request size when the provider rejects the JSON body", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "We could not parse the JSON body of your request." } }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      })
    );
    const client = new HttpLlmClient(fetchMock as unknown as typeof fetch);

    await expect(
      client.complete({
        provider: "openai",
        model: "gpt-5-mini",
        apiKey: "test-key",
        systemPrompt: "sys",
        userPrompt: "user"
      })
    ).rejects.toMatchObject({
      name: "LlmProviderError",
      code: "provider_error",
      message: expect.stringContaining("Request size:")
    });
  });
});
