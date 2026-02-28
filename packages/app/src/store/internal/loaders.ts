import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  decisionsDir,
  initiativeDir,
  initiativeYamlPath,
  initiativesDir,
  runDir,
  runYamlPath,
  runsDir,
  ticketsDir,
  verificationPath
} from "../../io/paths.js";
import { readYamlFile } from "../../io/yaml.js";
import type { Initiative, Run, RunAttempt, SpecDocument, Ticket } from "../../types/entities.js";
import { listDirectoryNames, listFileNames, pathExists } from "./fs-utils.js";

export const loadInitiatives = async (input: {
  rootDir: string;
  initiatives: Map<string, Initiative>;
  specs: Map<string, SpecDocument>;
}): Promise<void> => {
  const ids = await listDirectoryNames(initiativesDir(input.rootDir));

  for (const id of ids) {
    const initiative = await readYamlFile<Initiative>(initiativeYamlPath(input.rootDir, id));
    if (!initiative) {
      continue;
    }

    input.initiatives.set(initiative.id, initiative);

    const docTuples: Array<{ fileName: string; type: SpecDocument["type"]; title: string }> = [
      { fileName: "brief.md", type: "brief", title: "Brief" },
      { fileName: "prd.md", type: "prd", title: "PRD" },
      { fileName: "tech-spec.md", type: "tech-spec", title: "Tech Spec" }
    ];

    for (const doc of docTuples) {
      const filePath = path.join(initiativeDir(input.rootDir, id), doc.fileName);
      if (!(await pathExists(filePath))) {
        continue;
      }

      const content = await readFile(filePath, "utf8");
      const fileStat = await stat(filePath);
      const specId = `${initiative.id}:${doc.type}`;

      input.specs.set(specId, {
        id: specId,
        initiativeId: initiative.id,
        type: doc.type,
        title: doc.title,
        content,
        sourcePath: filePath,
        createdAt: fileStat.birthtime.toISOString(),
        updatedAt: fileStat.mtime.toISOString()
      });
    }
  }
};

export const loadTickets = async (input: {
  rootDir: string;
  tickets: Map<string, Ticket>;
}): Promise<void> => {
  const fileNames = await listFileNames(ticketsDir(input.rootDir));

  for (const fileName of fileNames) {
    if (!fileName.endsWith(".yaml") && !fileName.endsWith(".yml")) {
      continue;
    }

    const ticket = await readYamlFile<Ticket>(path.join(ticketsDir(input.rootDir), fileName));
    if (ticket) {
      // Normalize fields that were added after initial schema — absent in older YAML files.
      ticket.blockedBy = Array.isArray(ticket.blockedBy) ? ticket.blockedBy : [];
      ticket.blocks = Array.isArray(ticket.blocks) ? ticket.blocks : [];
      input.tickets.set(ticket.id, ticket);
    }
  }
};

export const loadRuns = async (input: {
  rootDir: string;
  runs: Map<string, Run>;
  runAttempts: Map<string, RunAttempt>;
  runAttemptKey: (runId: string, attemptId: string) => string;
}): Promise<void> => {
  const runIds = await listDirectoryNames(runsDir(input.rootDir));

  for (const runId of runIds) {
    const run = await readYamlFile<Run>(runYamlPath(input.rootDir, runId));
    if (!run) {
      continue;
    }

    input.runs.set(run.id, run);

    const attemptIds = await listDirectoryNames(path.join(runDir(input.rootDir, runId), "attempts"));
    for (const attemptId of attemptIds) {
      const verificationFile = verificationPath(input.rootDir, runId, attemptId);
      if (!(await pathExists(verificationFile))) {
        continue;
      }

      const raw = await readFile(verificationFile, "utf8");
      const attempt = JSON.parse(raw) as RunAttempt;
      input.runAttempts.set(input.runAttemptKey(run.id, attemptId), attempt);
    }
  }
};

export const loadDecisions = async (input: {
  rootDir: string;
  specs: Map<string, SpecDocument>;
}): Promise<void> => {
  const fileNames = await listFileNames(decisionsDir(input.rootDir));

  for (const fileName of fileNames) {
    if (!fileName.endsWith(".md")) {
      continue;
    }

    const filePath = path.join(decisionsDir(input.rootDir), fileName);
    const content = await readFile(filePath, "utf8");
    const fileStat = await stat(filePath);
    const decisionId = path.basename(fileName, ".md");

    input.specs.set(`decision:${decisionId}`, {
      id: decisionId,
      initiativeId: null,
      type: "decision",
      title: decisionId,
      content,
      sourcePath: filePath,
      createdAt: fileStat.birthtime.toISOString(),
      updatedAt: fileStat.mtime.toISOString()
    });
  }
};
