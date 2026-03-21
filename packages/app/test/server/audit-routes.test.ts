import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createServerFixture } from "../helpers/server-fixture.js";

describe("audit routes", () => {
  it("audits run, dismisses finding, and creates ticket from finding", async () => {
    const fixture = await createServerFixture();

    try {
      const exportResponse = await fixture.server.app.inject({
        method: "POST",
        url: "/api/tickets/ticket-aabbccdd/export-bundle",
        payload: { agent: "generic", operationId: "op-deadbeef" }
      });
      expect(exportResponse.statusCode).toBe(201);

      const exportedRunId = exportResponse.json().runId as string;
      const exportedAttemptId = exportResponse.json().attemptId as string;

      const auditResponse = await fixture.server.app.inject({
        method: "POST",
        url: `/api/runs/${exportedRunId}/audit`,
        payload: {
          diffSource: { mode: "branch", branch: "main" },
          scopePaths: ["src/auth.ts"],
          widenedScopePaths: []
        }
      });
      expect(auditResponse.statusCode).toBe(200);
      expect(auditResponse.json().findings.length).toBeGreaterThan(0);

      const findingId = auditResponse.json().findings[0].id as string;
      const committedAuditPath = path.join(
        fixture.rootDir,
        "specflow",
        "runs",
        exportedRunId,
        "attempts",
        exportedAttemptId,
        "audit-findings.json"
      );
      const legacyAuditPath = path.join(fixture.rootDir, "specflow", "runs", exportedRunId, "audit-findings.json");
      const committedReport = JSON.parse(await readFile(committedAuditPath, "utf8")) as {
        findings: Array<{ id: string }>;
      };

      expect(committedReport.findings.some((finding) => finding.id === findingId)).toBe(true);
      await expect(readFile(legacyAuditPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

      const dismissResponse = await fixture.server.app.inject({
        method: "POST",
        url: `/api/runs/${exportedRunId}/findings/${findingId}/dismiss`,
        payload: { note: "accepted drift for scaffold phase" }
      });
      expect(dismissResponse.statusCode).toBe(200);

      const dismissedReport = JSON.parse(await readFile(committedAuditPath, "utf8")) as {
        findings: Array<{ id: string; dismissed: boolean; dismissNote: string | null }>;
      };
      expect(dismissedReport.findings.find((finding) => finding.id === findingId)).toMatchObject({
        dismissed: true,
        dismissNote: "accepted drift for scaffold phase"
      });

      const createTicketResponse = await fixture.server.app.inject({
        method: "POST",
        url: `/api/runs/${exportedRunId}/findings/${findingId}/create-ticket`
      });
      expect(createTicketResponse.statusCode).toBe(201);
      expect(createTicketResponse.json().ticket.title).toContain("[Audit]");
    } finally {
      await fixture.cleanup();
    }
  });

  it("reads legacy run-root audit reports and rewrites them into the committed attempt", async () => {
    const fixture = await createServerFixture();

    try {
      const exportResponse = await fixture.server.app.inject({
        method: "POST",
        url: "/api/tickets/ticket-aabbccdd/export-bundle",
        payload: { agent: "generic", operationId: "op-deadbeef" }
      });
      expect(exportResponse.statusCode).toBe(201);

      const exportedRunId = exportResponse.json().runId as string;
      const exportedAttemptId = exportResponse.json().attemptId as string;
      const legacyAuditPath = path.join(fixture.rootDir, "specflow", "runs", exportedRunId, "audit-findings.json");
      const committedAuditPath = path.join(
        fixture.rootDir,
        "specflow",
        "runs",
        exportedRunId,
        "attempts",
        exportedAttemptId,
        "audit-findings.json"
      );

      await writeFile(
        legacyAuditPath,
        JSON.stringify(
          {
            runId: exportedRunId,
            generatedAt: "2026-02-27T20:00:00.000Z",
            diffSourceMode: "branch",
            defaultScope: ["src/auth.ts"],
            primaryDiff: "diff",
            driftDiff: null,
            findings: [
              {
                id: "finding-1",
                severity: "warning",
                category: "clarity",
                file: "src/auth.ts",
                line: 1,
                description: "Legacy persisted finding.",
                dismissed: false,
                dismissNote: null
              }
            ]
          },
          null,
          2
        ),
        "utf8"
      );

      const dismissResponse = await fixture.server.app.inject({
        method: "POST",
        url: `/api/runs/${exportedRunId}/findings/finding-1/dismiss`,
        payload: { note: "migrated from legacy path" }
      });
      expect(dismissResponse.statusCode).toBe(200);

      const committedReport = JSON.parse(await readFile(committedAuditPath, "utf8")) as {
        findings: Array<{ id: string; dismissed: boolean; dismissNote: string | null }>;
      };
      expect(committedReport.findings).toHaveLength(1);
      expect(committedReport.findings[0]).toMatchObject({
        id: "finding-1",
        dismissed: true,
        dismissNote: "migrated from legacy path"
      });
    } finally {
      await fixture.cleanup();
    }
  });
});
