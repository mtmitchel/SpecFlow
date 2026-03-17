import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createServerFixture } from "../helpers/server-fixture.js";

describe("provider routes", () => {
  it("saves provider keys in .env, keeps config non-secret, and fetches openrouter models", async () => {
    const fixture = await createServerFixture();
    const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    try {
      const providerKeyResponse = await fixture.server.app.inject({
        method: "PUT",
        url: "/api/config/provider-key",
        payload: { provider: "openrouter", apiKey: "test-key" }
      });
      expect(providerKeyResponse.statusCode).toBe(200);

      const configResponse = await fixture.server.app.inject({
        method: "PUT",
        url: "/api/config",
        payload: {
          provider: "openrouter",
          model: "openrouter/auto",
          port: 3141,
          host: "127.0.0.1",
          repoInstructionFile: "specflow/AGENTS.md"
        }
      });
      expect(configResponse.statusCode).toBe(200);
      expect(configResponse.json().config.provider).toBe("openrouter");
      expect(configResponse.json().config.providerKeyStatus).toMatchObject({
        openrouter: true
      });

      const modelsResponse = await fixture.server.app.inject({
        method: "GET",
        url: "/api/providers/openrouter/models?q=auto"
      });
      expect(modelsResponse.statusCode).toBe(200);
      expect(modelsResponse.json().models).toHaveLength(1);
      expect(modelsResponse.json().models[0].id).toBe("openrouter/auto");

      const envContents = await readFile(path.join(fixture.rootDir, ".env"), "utf8");
      const configContents = await readFile(path.join(fixture.rootDir, "specflow", "config.yaml"), "utf8");
      expect(envContents).toContain("OPENROUTER_API_KEY=");
      expect(configContents).not.toContain("apiKey:");
    } finally {
      if (previousOpenRouterKey === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = previousOpenRouterKey;
      }
      await fixture.cleanup();
    }
  });

  it("rejects config saves when the selected model is not available for the provider", async () => {
    const fixture = await createServerFixture();
    const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-key";

    try {
      const response = await fixture.server.app.inject({
        method: "PUT",
        url: "/api/config",
        payload: {
          provider: "openrouter",
          model: "openrouter/missing",
          port: 3141,
          host: "127.0.0.1",
          repoInstructionFile: "specflow/AGENTS.md"
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain("Model 'openrouter/missing' is not available for provider 'openrouter'");
    } finally {
      if (previousOpenRouterKey === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = previousOpenRouterKey;
      }
      await fixture.cleanup();
    }
  });
});
