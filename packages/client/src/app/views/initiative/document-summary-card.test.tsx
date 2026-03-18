import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentSummaryCard } from "./document-summary-card.js";

const showError = vi.fn();
const showSuccess = vi.fn();

vi.mock("../../context/toast.js", () => ({
  useToast: () => ({ showError, showSuccess, showInfo: vi.fn() }),
}));

describe("DocumentSummaryCard", () => {
  beforeEach(() => {
    showError.mockReset();
    showSuccess.mockReset();
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("shows a copy action for the brief card and copies the full brief markdown", async () => {
    const writeText = vi.mocked(window.navigator.clipboard.writeText);

    render(
      <DocumentSummaryCard
        step="brief"
        content={"# Local Notes\n\n## Summary\n\nA short summary."}
        initiativeTitle="Local Notes"
        isBusy={false}
        onEdit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy brief" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("# Local Notes\n\n## Summary\n\nA short summary.");
    });
    expect(showSuccess).toHaveBeenCalledWith("Brief copied to clipboard");
  });

  it("does not show the brief copy action on non-brief cards", () => {
    render(
      <DocumentSummaryCard
        step="core-flows"
        content={"# Core Flows\n\n## Primary path\n\nBody copy."}
        initiativeTitle="Local Notes"
        isBusy={false}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Copy brief" })).not.toBeInTheDocument();
  });
});
