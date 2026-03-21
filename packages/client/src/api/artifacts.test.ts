import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchArtifacts, fetchSpecDetail } from "./artifacts";

const transportJsonRequestMock = vi.fn();

vi.mock("./transport", () => ({
  transportJsonRequest: (...args: unknown[]) => transportJsonRequestMock(...args),
}));

describe("artifacts api", () => {
  beforeEach(() => {
    transportJsonRequestMock.mockReset();
  });

  it("adds a bounded timeout when refreshing artifacts", async () => {
    transportJsonRequestMock.mockResolvedValue({
      initiatives: [],
      tickets: [],
      runs: [],
      specs: [],
      reviews: [],
      decisions: [],
      repository: null,
    });

    await fetchArtifacts();

    expect(transportJsonRequestMock).toHaveBeenCalledWith(
      "artifacts.snapshot",
      {},
      undefined,
      {
        timeoutMs: 20_000,
        timeoutMessage: "Refreshing the workspace took too long. Try again."
      }
    );
  });

  it("adds a bounded timeout when loading a spec detail", async () => {
    transportJsonRequestMock.mockResolvedValue({
      spec: {
        id: "spec-1",
        initiativeId: "initiative-1",
        type: "brief",
        content: "# Brief",
        updatedAt: "2026-03-19T12:00:00.000Z",
      },
    });

    await fetchSpecDetail("spec-1");

    expect(transportJsonRequestMock).toHaveBeenCalledWith(
      "specs.detail",
      { id: "spec-1" },
      undefined,
      {
        timeoutMs: 20_000,
        timeoutMessage: "Loading the draft took too long. Try again."
      }
    );
  });
});
