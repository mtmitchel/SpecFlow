import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  decisionsDir,
  initiativeCoverageDir,
  initiativePendingTicketPlanPath,
  initiativeTicketCoveragePath,
  initiativeDir,
  initiativeReviewPath,
  initiativeReviewsDir,
  initiativeTracePath,
  initiativeTracesDir,
  initiativeValidationDir,
  initiativeYamlPath,
  initiativesDir,
  runDir,
  runYamlPath,
  runsDir,
  ticketsDir,
  verificationPath
} from "../../io/paths.js";
import { readYamlFile } from "../../io/yaml.js";
import type { StoreReloadIssue } from "../../shared-contracts.js";
import type {
  ArtifactTraceOutline,
  Initiative,
  PendingTicketPlanArtifact,
  PlanningReviewArtifact,
  Run,
  RunAttempt,
  RunAttemptSummary,
  SpecDocument,
  SpecDocumentSummary,
  TicketCoverageArtifact,
  Ticket
} from "../../types/entities.js";
import { listDirectoryNames, listFileNames, pathExists } from "./fs-utils.js";
import {
  parseArtifactTraceOutline,
  parsePendingTicketPlanArtifact,
  parsePlanningReviewArtifact,
  parseTicketCoverageArtifact
} from "./planning-artifact-validation.js";
import { extractSpecSummaryTitle } from "./spec-summary-titles.js";
import { shouldReplaceInitiativeTitle } from "../../planner/internal/initiative-title-sync.js";

type ReloadScope = StoreReloadIssue["scope"];

const describeIssue = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const recordIssue = (
  issues: StoreReloadIssue[],
  scope: ReloadScope,
  filePath: string,
  error: unknown
): void => {
  issues.push({
    scope,
    path: filePath,
    message: describeIssue(error)
  });
};

const readYamlFileSafely = async <T>(
  issues: StoreReloadIssue[],
  scope: ReloadScope,
  filePath: string
): Promise<T | null> => {
  try {
    return await readYamlFile<T>(filePath);
  } catch (error) {
    recordIssue(issues, scope, filePath, error);
    return null;
  }
};

const readTextFileSafely = async (
  issues: StoreReloadIssue[],
  scope: ReloadScope,
  filePath: string
): Promise<string | null> => {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    recordIssue(issues, scope, filePath, error);
    return null;
  }
};

const statSafely = async (
  issues: StoreReloadIssue[],
  scope: ReloadScope,
  filePath: string
) => {
  try {
    return await stat(filePath);
  } catch (error) {
    recordIssue(issues, scope, filePath, error);
    return null;
  }
};

export const loadInitiatives = async (input: {
  rootDir: string;
  initiatives: Map<string, Initiative>;
  pendingTicketPlans: Map<string, PendingTicketPlanArtifact>;
  planningReviews: Map<string, PlanningReviewArtifact>;
  artifactTraces: Map<string, ArtifactTraceOutline>;
  ticketCoverageArtifacts: Map<string, TicketCoverageArtifact>;
  specs: Map<string, SpecDocumentSummary>;
  issues: StoreReloadIssue[];
}): Promise<void> => {
  const ids = await listDirectoryNames(initiativesDir(input.rootDir));

  for (const id of ids) {
    const initiativeFilePath = initiativeYamlPath(input.rootDir, id);
    const initiative = await readYamlFileSafely<Initiative>(input.issues, "initiative", initiativeFilePath);
    if (!initiative) {
      continue;
    }

    let briefSummaryTitle: string | null = null;

    const docTuples: Array<{ fileName: string; type: SpecDocument["type"]; title: string }> = [
      { fileName: "brief.md", type: "brief", title: "Brief" },
      { fileName: "core-flows.md", type: "core-flows", title: "Core Flows" },
      { fileName: "prd.md", type: "prd", title: "PRD" },
      { fileName: "tech-spec.md", type: "tech-spec", title: "Tech Spec" }
    ];

    for (const doc of docTuples) {
      const filePath = path.join(initiativeDir(input.rootDir, id), doc.fileName);
      if (!(await pathExists(filePath))) {
        continue;
      }

      const markdown = await readTextFileSafely(input.issues, "initiative", filePath);
      const fileStat = await statSafely(input.issues, "initiative", filePath);
      if (markdown === null || !fileStat) {
        continue;
      }
      const specId = `${initiative.id}:${doc.type}`;
      const summaryTitle = extractSpecSummaryTitle(doc.type, markdown, doc.title);

      if (doc.type === "brief") {
        briefSummaryTitle = summaryTitle;
      }

      input.specs.set(specId, {
        id: specId,
        initiativeId: initiative.id,
        type: doc.type,
        title: summaryTitle,
        sourcePath: filePath,
        createdAt: fileStat.birthtime.toISOString(),
        updatedAt: fileStat.mtime.toISOString()
      });
    }

    const normalizedInitiative =
      briefSummaryTitle &&
      shouldReplaceInitiativeTitle(initiative.title, initiative.description)
        ? {
            ...initiative,
            projectRoot: initiative.projectRoot ?? input.rootDir,
            title: briefSummaryTitle,
          }
        : {
            ...initiative,
            projectRoot: initiative.projectRoot ?? input.rootDir
          };

    input.initiatives.set(normalizedInitiative.id, normalizedInitiative);

    const reviewFileNames = await listFileNames(initiativeReviewsDir(input.rootDir, id));
    for (const fileName of reviewFileNames) {
      if (!fileName.endsWith(".yaml") && !fileName.endsWith(".yml")) {
        continue;
      }

      const reviewKind = path.basename(fileName, path.extname(fileName));
      const filePath = initiativeReviewPath(input.rootDir, id, reviewKind);
      const review = await readYamlFileSafely<PlanningReviewArtifact>(
        input.issues,
        "initiative",
        filePath
      );
      if (review) {
        const parsed = parsePlanningReviewArtifact(review, filePath);
        input.planningReviews.set(parsed.id, parsed);
      }
    }

    const coverageFileNames = await listFileNames(initiativeCoverageDir(input.rootDir, id));
    if (coverageFileNames.some((fileName) => fileName === "tickets.yaml" || fileName === "tickets.yml")) {
      const filePath = initiativeTicketCoveragePath(input.rootDir, id);
      const coverage = await readYamlFileSafely<TicketCoverageArtifact>(
        input.issues,
        "initiative",
        filePath
      );
      if (coverage) {
        const parsed = parseTicketCoverageArtifact(coverage, filePath);
        input.ticketCoverageArtifacts.set(parsed.id, parsed);
      }
    }

    const validationFileNames = await listFileNames(initiativeValidationDir(input.rootDir, id));
    if (
      validationFileNames.some(
        (fileName) => fileName === "pending-ticket-plan.yaml" || fileName === "pending-ticket-plan.yml"
      )
    ) {
      const filePath = initiativePendingTicketPlanPath(input.rootDir, id);
      const pendingPlan = await readYamlFileSafely<PendingTicketPlanArtifact>(
        input.issues,
        "initiative",
        filePath
      );
      if (pendingPlan) {
        const parsed = parsePendingTicketPlanArtifact(pendingPlan, filePath);
        input.pendingTicketPlans.set(parsed.id, parsed);
      }
    }

    const traceFileNames = await listFileNames(initiativeTracesDir(input.rootDir, id));
    for (const fileName of traceFileNames) {
      if (!fileName.endsWith(".yaml") && !fileName.endsWith(".yml")) {
        continue;
      }

      const step = path.basename(fileName, path.extname(fileName));
      const filePath = initiativeTracePath(input.rootDir, id, step);
      const trace = await readYamlFileSafely<ArtifactTraceOutline>(
        input.issues,
        "initiative",
        filePath
      );
      if (trace) {
        const parsed = parseArtifactTraceOutline(trace, filePath);
        input.artifactTraces.set(parsed.id, parsed);
      }
    }
  }
};

export const loadTickets = async (input: {
  rootDir: string;
  tickets: Map<string, Ticket>;
  issues: StoreReloadIssue[];
}): Promise<void> => {
  const fileNames = await listFileNames(ticketsDir(input.rootDir));

  for (const fileName of fileNames) {
    if (!fileName.endsWith(".yaml") && !fileName.endsWith(".yml")) {
      continue;
    }

    const filePath = path.join(ticketsDir(input.rootDir), fileName);
    const ticket = await readYamlFileSafely<Ticket>(input.issues, "ticket", filePath);
    if (ticket) {
      // Normalize fields that were added after initial schema — absent in older YAML files.
      ticket.coverageItemIds = Array.isArray(ticket.coverageItemIds) ? ticket.coverageItemIds : [];
      ticket.blockedBy = Array.isArray(ticket.blockedBy) ? ticket.blockedBy : [];
      ticket.blocks = Array.isArray(ticket.blocks) ? ticket.blocks : [];
      input.tickets.set(ticket.id, ticket);
    }
  }
};

export const loadRuns = async (input: {
  rootDir: string;
  runs: Map<string, Run>;
  runAttempts: Map<string, RunAttemptSummary>;
  runAttemptKey: (runId: string, attemptId: string) => string;
  issues: StoreReloadIssue[];
}): Promise<void> => {
  const runIds = await listDirectoryNames(runsDir(input.rootDir));

  for (const runId of runIds) {
    const runFilePath = runYamlPath(input.rootDir, runId);
    const run = await readYamlFileSafely<Run>(input.issues, "run", runFilePath);
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

      const raw = await readTextFileSafely(input.issues, "run", verificationFile);
      if (raw === null) {
        continue;
      }

      try {
        const attempt = JSON.parse(raw) as RunAttempt;
        input.runAttempts.set(input.runAttemptKey(run.id, attemptId), {
          attemptId: attempt.attemptId,
          overallPass: attempt.overallPass,
          overrideReason: attempt.overrideReason,
          overrideAccepted: attempt.overrideAccepted,
          createdAt: attempt.createdAt
        });
      } catch (error) {
        recordIssue(input.issues, "run", verificationFile, error);
      }
    }
  }
};

export const loadDecisions = async (input: {
  rootDir: string;
  specs: Map<string, SpecDocumentSummary>;
  issues: StoreReloadIssue[];
}): Promise<void> => {
  const fileNames = await listFileNames(decisionsDir(input.rootDir));

  for (const fileName of fileNames) {
    if (!fileName.endsWith(".md")) {
      continue;
    }

    const filePath = path.join(decisionsDir(input.rootDir), fileName);
    const fileStat = await statSafely(input.issues, "decision", filePath);
    if (!fileStat) {
      continue;
    }

    const decisionId = path.basename(fileName, ".md");

    input.specs.set(`decision:${decisionId}`, {
      id: decisionId,
      initiativeId: null,
      type: "decision",
      title: decisionId,
      sourcePath: filePath,
      createdAt: fileStat.birthtime.toISOString(),
      updatedAt: fileStat.mtime.toISOString()
    });
  }
};
