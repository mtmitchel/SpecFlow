import { describe, expect, it } from "vitest";
import { createServerFixture } from "../helpers/server-fixture.js";

describe("provider routes", () => {
  it("saves config and fetches openrouter models", async () => {
    const fixture = await createServerFixture();

    try {
      const configResponse = await fixture.server.app.inject({
        method: "PUT",
        url: "/api/config",
        payload: { provider: "openrouter", model: "openrouter/model", apiKey: "test-key" }
      });
      expect(configResponse.statusCode).toBe(200);
      expect(configResponse.json().config.provider).toBe("openrouter");

      const modelsResponse = await fixture.server.app.inject({
        method: "GET",
        url: "/api/providers/openrouter/models?q=auto"
      });
      expect(modelsResponse.statusCode).toBe(200);
      expect(modelsResponse.json().models).toHaveLength(1);
      expect(modelsResponse.json().models[0].id).toBe("openrouter/auto");
    } finally {
      await fixture.cleanup();
    }
  });
});
