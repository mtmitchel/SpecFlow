import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchArtifacts, fetchSpecDetail } from "./artifacts";

const transportRequestMock = vi.fn();

vi.mock("./transport", () => ({
  transportRequest: (...args: unknown[]) => transportRequestMock(...args),
}));

describe("artifacts api", () => {
  beforeEach(() => {
    transportRequestMock.mockReset();
  });

  it("adds a bounded timeout when refreshing artifacts", async () => {
    transportRequestMock.mockResolvedValue({
      initiatives: [],
      tickets: [],
      runs: [],
      specs: [],
      reviews: [],
      decisions: [],
      repository: null,
    });

    await fetchArtifacts();

    expect(transportRequestMock).toHaveBeenCalledWith(
      "artifacts.snapshot",
      {},
      expect.any(Function),
      undefined,
      {
        timeoutMs: 20_000,
        timeoutMessage: "Refreshing the workspace took too long. Try again."
      }
    );
  });

  it("adds a bounded timeout when loading a spec detail", async () => {
    transportRequestMock.mockResolvedValue({
      spec: {
        id: "spec-1",
        initiativeId: "initiative-1",
        type: "brief",
        content: "# Brief",
        updatedAt: "2026-03-19T12:00:00.000Z",
      },
    });

    await fetchSpecDetail("spec-1");

    expect(transportRequestMock).toHaveBeenCalledWith(
      "specs.detail",
      { id: "spec-1" },
      expect.any(Function),
      undefined,
      {
        timeoutMs: 20_000,
        timeoutMessage: "Loading the draft took too long. Try again."
      }
    );
  });
});
