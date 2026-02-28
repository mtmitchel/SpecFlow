import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DriftFlag, Ticket } from "../../types/entities.js";
import type { AuditFinding, DiffChange } from "./types.js";

export const extractDiffChanges = (diffText: string): DiffChange[] => {
  const changes: DiffChange[] = [];
  const lines = diffText.split("\n");
  let currentFile = "(unknown)";
  let currentLine = 0;

  for (const line of lines) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6).trim();
      continue;
    }

    const hunkMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunkMatch) {
      currentLine = Number.parseInt(hunkMatch[1], 10);
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      changes.push({
        file: currentFile,
        line: currentLine,
        content: line.slice(1)
      });
      currentLine += 1;
      continue;
    }

    if (!line.startsWith("-")) {
      currentLine += 1;
    }
  }

  return changes;
};

export const buildAuditFindings = (
  ticket: Ticket,
  driftFlags: DriftFlag[],
  changes: DiffChange[],
  agentsConventions: string
): AuditFinding[] => {
  const findings: AuditFinding[] = [];
  let counter = 1;

  for (const flag of driftFlags) {
    const match = changes.find((change) => change.file === flag.file);
    findings.push({
      id: `finding-${counter++}`,
      severity: flag.type === "missing-requirement" ? "error" : flag.type === "unexpected-file" ? "warning" : "info",
      category: "drift",
      file: flag.file,
      line: match?.line ?? null,
      description: flag.description,
      dismissed: false,
      dismissNote: null
    });
  }

  const diffCorpus = changes.map((change) => change.content.toLowerCase()).join("\n");
  for (const criterion of ticket.acceptanceCriteria) {
    const keywords = criterion.text
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((word) => word.length >= 4);

    if (keywords.length === 0) {
      continue;
    }

    const matched = keywords.some((keyword) => diffCorpus.includes(keyword));
    if (!matched) {
      findings.push({
        id: `finding-${counter++}`,
        severity: "warning",
        category: "acceptance",
        file: ticket.fileTargets[0] ?? "(n/a)",
        line: null,
        description: `No direct diff evidence found for criterion '${criterion.id}': ${criterion.text}`,
        dismissed: false,
        dismissNote: null
      });
    }
  }

  const requiresTests = /test/i.test(agentsConventions);
  if (requiresTests) {
    const hasTestChange = changes.some(
      (change) =>
        /(^|\/)(test|tests)\//i.test(change.file) || /\.test\./i.test(change.file) || /\.spec\./i.test(change.file)
    );

    if (!hasTestChange) {
      findings.push({
        id: `finding-${counter++}`,
        severity: "info",
        category: "convention",
        file: "(n/a)",
        line: null,
        description: "AGENTS.md mentions testing conventions, but no test file changes were detected in the audit scope.",
        dismissed: false,
        dismissNote: null
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      id: "finding-1",
      severity: "info",
      category: "drift",
      file: "(n/a)",
      line: null,
      description: "No audit findings were detected for the selected scope.",
      dismissed: false,
      dismissNote: null
    });
  }

  return findings;
};

export const readAgentsConventions = async (rootDir: string): Promise<string> => {
  const preferred = path.join(rootDir, "specflow", "AGENTS.md");

  try {
    return await readFile(preferred, "utf8");
  } catch {
    try {
      return await readFile(path.join(rootDir, "AGENTS.md"), "utf8");
    } catch {
      return "";
    }
  }
};

export const normalizeScopePaths = (raw: string[]): string[] =>
  Array.from(
    new Set(
      raw
        .map((entry) => path.posix.normalize(entry.replaceAll("\\", "/")).trim())
        .filter((entry) => entry.length > 0 && !entry.startsWith("../") && !path.isAbsolute(entry))
    )
  );
