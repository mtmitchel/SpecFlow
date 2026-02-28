import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeFileAtomic } from "../../io/atomic-write.js";
import type { AuditReport } from "./types.js";

export const auditReportPath = (rootDir: string, runId: string): string =>
  path.join(rootDir, "specflow", "runs", runId, "audit-findings.json");

export const readAuditReport = async (rootDir: string, runId: string): Promise<AuditReport | null> => {
  try {
    const content = await readFile(auditReportPath(rootDir, runId), "utf8");
    return JSON.parse(content) as AuditReport;
  } catch {
    return null;
  }
};

export const writeAuditReport = async (rootDir: string, report: AuditReport): Promise<void> => {
  await writeFileAtomic(auditReportPath(rootDir, report.runId), JSON.stringify(report, null, 2));
};
