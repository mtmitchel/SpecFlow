import { describe, expect, it, vi } from "vitest";
import { HttpLlmClient } from "../src/llm/client.js";
import { LlmProviderError } from "../src/llm/errors.js";

describe("HttpLlmClient OpenRouter support", () => {
  it("sends completion requests to OpenRouter and parses assistant text", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");

      const payload = JSON.parse(String(init?.body));
      expect(payload.model).toBe("openrouter/model");
      expect(payload.messages[0].role).toBe("system");
      expect(payload.messages[1].role).toBe("user");

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"decision":"ok","reason":"looks good","ticketDraft":{"title":"T","description":"D","acceptanceCriteria":["A"],"implementationPlan":"P","fileTargets":["src/a.ts"]}}'
              }
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
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
});
