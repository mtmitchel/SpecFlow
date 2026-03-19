import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveInitiativeRefinement, saveInitiativeSpecs } from "./initiatives";

const transportRequestMock = vi.fn();

vi.mock("./transport", () => ({
  transportRequest: (...args: unknown[]) => transportRequestMock(...args),
}));

vi.mock("./http", () => ({
  parse: vi.fn(),
  requestJson: vi.fn(),
}));

vi.mock("./sse", () => ({
  parseSseResult: vi.fn(),
}));

describe("initiatives api", () => {
  beforeEach(() => {
    transportRequestMock.mockReset();
  });

  it("adds a bounded timeout when saving refinement answers", async () => {
    transportRequestMock.mockResolvedValue({ assumptions: [] });

    await saveInitiativeRefinement("initiative-1", "core-flows", { scope: "notes" }, [], null);

    expect(transportRequestMock).toHaveBeenCalledWith(
      "initiatives.refinement.save",
      {
        id: "initiative-1",
        step: "core-flows",
        body: {
          answers: { scope: "notes" },
          defaultAnswerQuestionIds: [],
          preferredSurface: null
        }
      },
      expect.any(Function),
      undefined,
      {
        timeoutMs: 20_000,
        timeoutMessage: "Saving your core flows answers took too long. Try again."
      }
    );
  });

  it("adds a bounded timeout when saving a draft spec", async () => {
    transportRequestMock.mockResolvedValue(undefined);

    await saveInitiativeSpecs("initiative-1", "tech-spec", "# Tech spec");

    expect(transportRequestMock).toHaveBeenCalledWith(
      "initiatives.spec.save",
      {
        id: "initiative-1",
        type: "tech-spec",
        body: { content: "# Tech spec" }
      },
      expect.any(Function),
      undefined,
      {
        timeoutMs: 20_000,
        timeoutMessage: "Saving the tech spec draft took too long. Try again."
      }
    );
  });
});
