import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveInitiativeRefinement, saveInitiativeSpecs } from "./initiatives";

const transportJsonRequestMock = vi.fn();
const transportRequestMock = vi.fn();

vi.mock("./transport", () => ({
  transportJsonRequest: (...args: unknown[]) => transportJsonRequestMock(...args),
  transportRequest: (...args: unknown[]) => transportRequestMock(...args),
}));

describe("initiatives api", () => {
  beforeEach(() => {
    transportJsonRequestMock.mockReset();
    transportRequestMock.mockReset();
  });

  it("adds a bounded timeout when saving refinement answers", async () => {
    transportJsonRequestMock.mockResolvedValue({ assumptions: [] });

    await saveInitiativeRefinement("initiative-1", "core-flows", { scope: "notes" }, [], null);

    expect(transportJsonRequestMock).toHaveBeenCalledWith(
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
      undefined,
      {
        timeoutMs: 20_000,
        timeoutMessage: "Saving your core flows answers took too long. Try again."
      }
    );
  });

  it("adds a bounded timeout when saving a draft spec", async () => {
    transportJsonRequestMock.mockResolvedValue(undefined);

    await saveInitiativeSpecs("initiative-1", "tech-spec", "# Tech spec");

    expect(transportJsonRequestMock).toHaveBeenCalledWith(
      "initiatives.spec.save",
      {
        id: "initiative-1",
        type: "tech-spec",
        body: { content: "# Tech spec" }
      },
      undefined,
      {
        timeoutMs: 20_000,
        timeoutMessage: "Saving the tech spec draft took too long. Try again."
      }
    );
  });
});
