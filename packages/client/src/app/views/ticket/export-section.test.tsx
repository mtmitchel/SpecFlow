import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExportSection } from "./export-section.js";

describe("ExportSection", () => {
  it("renders bundle utility actions once in the non-collapsed handoff surface", () => {
    render(
      <ExportSection
        workflowPhase="export"
        agentTarget="generic"
        setAgentTarget={vi.fn()}
        exportResult={{ runId: "run-12345678", attemptId: "attempt-12345678" }}
        bundlePreview="## Prompt"
        bundlePreviewOpen={false}
        bundleTextLoading={false}
        copyFeedback={false}
        handleExport={vi.fn(async () => undefined)}
        handleCopyBundle={vi.fn(async () => undefined)}
        handleToggleBundlePreview={vi.fn(async () => undefined)}
        handleDownloadBundle={vi.fn(async () => undefined)}
        handleSaveZipBundle={vi.fn(async () => undefined)}
        chrome="plain"
        showCreateControls={false}
        collapseUtilities={false}
      />
    );

    expect(screen.getAllByRole("button", { name: "Copy bundle" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Show bundle" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Download Markdown bundle" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Save ZIP bundle" })).toHaveLength(1);
    expect(screen.queryByText("Bundle details")).not.toBeInTheDocument();
  });
});
