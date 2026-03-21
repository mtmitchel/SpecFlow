import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { VerificationResult } from "../../../types.js";
import { VerificationResultsSection } from "./verification-results-section.js";

vi.mock("./override-panel.js", () => ({
  OverridePanel: () => <div>OverridePanel</div>,
}));

const verificationResult: VerificationResult = {
  overallPass: true,
  criteriaResults: [
    {
      criterionId: "c1",
      pass: true,
      evidence: "The route blocks execution until coverage passes.",
      severity: "minor",
    },
  ],
  driftFlags: [],
};

describe("VerificationResultsSection", () => {
  it("requires explicit accept before a passing ticket is marked done", async () => {
    const handleAccept = vi.fn(async () => undefined);

    render(
      <MemoryRouter>
        <VerificationResultsSection
          ticketId="ticket-1"
          runId="run-1"
          ticketStatus="verify"
          verificationResult={verificationResult}
          attempts={[]}
          handleReExportWithFindings={vi.fn(async () => undefined)}
          handleAccept={handleAccept}
          acceptPending={false}
          onRefresh={vi.fn(async () => undefined)}
          chrome="plain"
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("This run matches the plan.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(handleAccept).toHaveBeenCalledTimes(1);
    });
  });

  it("shows the next-ticket path after a passing ticket is already done", () => {
    render(
      <MemoryRouter>
        <VerificationResultsSection
          ticketId="ticket-1"
          runId="run-1"
          ticketStatus="done"
          verificationResult={verificationResult}
          attempts={[]}
          handleReExportWithFindings={vi.fn(async () => undefined)}
          handleAccept={vi.fn(async () => undefined)}
          acceptPending={false}
          onRefresh={vi.fn(async () => undefined)}
          nextTicketId="ticket-2"
          chrome="plain"
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Ticket marked done.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open next ticket" })).toHaveAttribute("href", "/ticket/ticket-2");
  });
});
