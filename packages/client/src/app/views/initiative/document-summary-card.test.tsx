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
    expect(showSuccess).toHaveBeenCalledWith("Brief copied.");
  });

  it("shows a copy action for non-brief draft cards too", async () => {
    const writeText = vi.mocked(window.navigator.clipboard.writeText);

    render(
      <DocumentSummaryCard
        step="core-flows"
        content={"# Core Flows\n\n## Primary path\n\nBody copy."}
        initiativeTitle="Local Notes"
        isBusy={false}
        onEdit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy core flows" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("# Core Flows\n\n## Primary path\n\nBody copy.");
    });
    expect(showSuccess).toHaveBeenCalledWith("Core flows copied.");
  });

  it("applies the editorial document surface and marks the first section active for PRD content", async () => {
    const { container } = render(
      <DocumentSummaryCard
        step="prd"
        content={
          "# Product Requirements\n\n## Problem statement\n\nA short summary.\n\n## User stories\n\nStory body.\n\n### Edge cases\n\nMore detail."
        }
        initiativeTitle="Local Notes"
        isBusy={false}
        onEdit={vi.fn()}
      />,
    );

    expect(container.querySelector(".planning-document-body-editorial")).not.toBeNull();
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Problem statement" })).toHaveClass("active");
    });
  });

  it("applies the terminal document surface for the tech spec", () => {
    const { container } = render(
      <DocumentSummaryCard
        step="tech-spec"
        content={"# Tech Spec\n\n## Architecture\n\nBody copy."}
        initiativeTitle="Local Notes"
        isBusy={false}
        onEdit={vi.fn()}
      />,
    );

    expect(container.querySelector(".planning-document-body-terminal")).not.toBeNull();
  });
});
