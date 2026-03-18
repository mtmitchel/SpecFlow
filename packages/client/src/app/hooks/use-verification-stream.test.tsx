import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useVerificationStream } from "./use-verification-stream.js";

const fetchRunStateMock = vi.fn();

vi.mock("../../api.js", () => ({
  fetchRunState: (...args: unknown[]) => fetchRunStateMock(...args),
}));

vi.mock("../../api/transport.js", () => ({
  isDesktopRuntime: () => true,
}));

const Probe = ({
  ticketId,
  runId,
}: {
  ticketId: string | undefined;
  runId: string | undefined;
}) => {
  const { verificationResult } = useVerificationStream(ticketId, runId, vi.fn(async () => undefined));

  return (
    <div>
      <span data-testid="state">{verificationResult ? (verificationResult.overallPass ? "pass" : "fail") : "empty"}</span>
      <span data-testid="criterion">
        {verificationResult?.criteriaResults[0]?.criterionId ?? "none"}
      </span>
    </div>
  );
};

describe("useVerificationStream", () => {
  it("hydrates the latest verification result from run state on re-entry", async () => {
    fetchRunStateMock.mockResolvedValueOnce({
      run: { id: "run-12345678" },
      attempts: [
        {
          attemptId: "attempt-01",
          overallPass: true,
          criteriaResults: [{ criterionId: "criterion-old", pass: true, evidence: "old pass" }],
          driftFlags: [],
        },
        {
          attemptId: "attempt-02",
          overallPass: false,
          criteriaResults: [{ criterionId: "criterion-latest", pass: false, evidence: "latest failure" }],
          driftFlags: [{ type: "unexpected-file", file: "README.md", description: "Unexpected drift" }],
        },
      ],
    });

    render(<Probe ticketId="ticket-12345678" runId="run-12345678" />);

    await waitFor(() => {
      expect(screen.getByTestId("state")).toHaveTextContent("fail");
    });

    expect(screen.getByTestId("criterion")).toHaveTextContent("criterion-latest");
  });
});
