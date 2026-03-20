import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditReport } from "../../types.js";
import { AuditPanel } from "./audit-panel.js";

const runAuditMock = vi.fn();

vi.mock("../../api.js", async () => {
  const actual = await vi.importActual<typeof import("../../api.js")>("../../api.js");
  return {
    ...actual,
    runAudit: (...args: unknown[]) => runAuditMock(...args),
  };
});

vi.mock("../context/toast.js", () => ({
  useToast: () => ({ showError: vi.fn() })
}));

const auditReport: AuditReport = {
  runId: "run-12345678",
  generatedAt: "2026-03-17T09:00:00.000Z",
  diffSourceMode: "branch",
  defaultScope: ["packages/client/src/app/components/audit-panel.tsx"],
  primaryDiff: "diff --git a/file.ts b/file.ts\n",
  driftDiff: null,
  findings: [
    {
      id: "finding-1",
      severity: "warning",
      category: "clarity",
      file: "packages/client/src/app/components/audit-panel.tsx",
      line: 42,
      description: "Button label is ambiguous.",
      confidence: 0.91,
      dismissed: false,
      dismissNote: null
    }
  ]
};

const clearAuditReport: AuditReport = {
  ...auditReport,
  findings: [
    {
      id: "finding-1",
      severity: "info",
      category: "drift",
      file: "(n/a)",
      line: null,
      description: "No audit findings were detected for the selected scope.",
      dismissed: false,
      dismissNote: null
    }
  ]
};

describe("AuditPanel", () => {
  beforeEach(() => {
    runAuditMock.mockReset();
  });

  it("does not run the audit automatically on mount", () => {
    render(
      <MemoryRouter>
        <AuditPanel runId="run-12345678" defaultScopePaths={["src/a.ts"]} />
      </MemoryRouter>
    );

    expect(runAuditMock).not.toHaveBeenCalled();
    expect(screen.getByText("Start with the default review for this run. Open review options only when the default comparison or scope is wrong.")).toBeInTheDocument();
    expect(screen.getByText("Review options")).toBeInTheDocument();
  });

  it("waits for the user to click Review changes before executing", async () => {
    runAuditMock.mockResolvedValue(auditReport);

    render(
      <MemoryRouter>
        <AuditPanel runId="run-12345678" defaultScopePaths={["src/a.ts"]} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Review changes" }));

    await waitFor(() => {
      expect(runAuditMock).toHaveBeenCalledWith("run-12345678", {
        diffSource: { mode: "branch", branch: "main" },
        scopePaths: [],
        widenedScopePaths: []
      });
    });

    expect(screen.getByText("Findings")).toBeInTheDocument();
    expect(screen.getAllByText("Button label is ambiguous.")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Create follow-up ticket" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export fix bundle" })).toBeInTheDocument();
    expect(screen.getAllByText("Diff context").length).toBeGreaterThan(0);
  });

  it("treats the clear-review placeholder as no findings", async () => {
    runAuditMock.mockResolvedValue(clearAuditReport);

    render(
      <MemoryRouter>
        <AuditPanel runId="run-12345678" defaultScopePaths={["src/a.ts"]} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Review changes" }));

    await waitFor(() => {
      expect(runAuditMock).toHaveBeenCalled();
    });

    expect(screen.getByText("No findings")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create follow-up ticket" })).not.toBeInTheDocument();
  });
});
