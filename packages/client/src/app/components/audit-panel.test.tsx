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
    expect(
      screen.getByText("Choose the diff source, adjust scope if needed, and run the audit when you're ready.")
    ).toBeInTheDocument();
  });

  it("waits for the user to click Run Audit before executing", async () => {
    runAuditMock.mockResolvedValue(auditReport);

    render(
      <MemoryRouter>
        <AuditPanel runId="run-12345678" defaultScopePaths={["src/a.ts"]} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Run Audit" }));

    await waitFor(() => {
      expect(runAuditMock).toHaveBeenCalledWith("run-12345678", {
        diffSource: { mode: "branch", branch: "main" },
        scopePaths: [],
        widenedScopePaths: []
      });
    });

    expect(screen.getByText("Findings")).toBeInTheDocument();
    expect(screen.getByText("Button label is ambiguous.")).toBeInTheDocument();
  });
});
