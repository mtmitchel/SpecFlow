import type { LlmTokenHandler } from "../../llm/client.js";
import type {
  ArtifactTraceOutline,
  Initiative,
  InitiativeArtifactStep,
  InitiativePlanningStep,
  PlanningReviewArtifact,
  PlanningReviewFinding,
  PlanningReviewFindingType,
  PlanningReviewKind,
  Ticket,
  TicketCoverageItem
} from "../../types/entities.js";
import { REVIEW_KIND_SOURCE_STEPS } from "../planning-reviews.js";
import { getReviewResolutionStep } from "../review-resolution.js";
import type { PlannerJob } from "../prompt-builder.js";
import type { ReviewRunInput, ReviewRunResult } from "../types.js";

const isArtifactStep = (step: InitiativePlanningStep): step is InitiativeArtifactStep =>
  step !== "validation" && step !== "tickets";

const REVIEW_FINDING_ORDER: PlanningReviewFindingType[] = [
  "blocker",
  "warning",
  "traceability-gap",
  "assumption",
  "recommended-fix"
];

export const buildReviewFindings = (
  kind: PlanningReviewKind,
  result: ReviewRunResult
): PlanningReviewFinding[] => {
  const sourceSteps = REVIEW_KIND_SOURCE_STEPS[kind];
  const groups: Array<{ type: PlanningReviewFindingType; values: string[] }> = [
    { type: "blocker", values: result.blockers },
    { type: "warning", values: result.warnings },
    { type: "traceability-gap", values: result.traceabilityGaps },
    { type: "assumption", values: result.assumptions },
    { type: "recommended-fix", values: result.recommendedFixes }
  ];

  const findings: PlanningReviewFinding[] = [];
  for (const { type, values } of groups) {
    for (const value of values) {
      const relatedArtifacts =
        kind === "ticket-coverage-review"
          ? [getReviewResolutionStep({ type, message: value })]
          : sourceSteps;

      findings.push({
        id: `${kind}:${type}:${findings.length + 1}`,
        type,
        message: value,
        relatedArtifacts
      });
    }
  }

  return findings.sort(
    (left, right) => REVIEW_FINDING_ORDER.indexOf(left.type) - REVIEW_FINDING_ORDER.indexOf(right.type)
  );
};

export const executeReviewJob = async (input: {
  initiative: Initiative;
  kind: PlanningReviewKind;
  nowIso: string;
  validateReviewRunResult: (result: ReviewRunResult) => void;
  executePlannerJob: <T>(
    job: PlannerJob,
    payload: ReviewRunInput,
    onToken?: LlmTokenHandler
  ) => Promise<T>;
  getArtifactMarkdownMap: (initiativeId: string) => Promise<Record<InitiativeArtifactStep, string>>;
  ensureArtifactTrace: (initiative: Initiative, step: InitiativeArtifactStep) => Promise<ArtifactTraceOutline>;
  requireSpecUpdatedAt: (initiativeId: string, step: InitiativeArtifactStep) => string;
  requireTicketCoverageArtifact: (initiativeId: string) => {
    items: TicketCoverageItem[];
    uncoveredItemIds: string[];
    updatedAt: string;
  };
  getInitiativeTickets: (initiative: Initiative) => Ticket[];
  onToken?: LlmTokenHandler;
}): Promise<PlanningReviewArtifact> => {
  const sourceSteps = REVIEW_KIND_SOURCE_STEPS[input.kind];
  const markdownByStep = await input.getArtifactMarkdownMap(input.initiative.id);
  const traceOutlines: ReviewRunInput["traceOutlines"] = {};
  const sourceUpdatedAts: Partial<Record<InitiativePlanningStep, string>> = {};
  let coverageItems: TicketCoverageItem[] | undefined;
  let uncoveredCoverageItemIds: string[] | undefined;
  let tickets:
    | Array<{
        title: string;
        description: string;
        acceptanceCriteria: string[];
        fileTargets: string[];
        coverageItemIds: string[];
      }>
    | undefined;

  for (const step of sourceSteps) {
    if (step === "validation" || step === "tickets") {
      const coverage = input.requireTicketCoverageArtifact(input.initiative.id);
      const initiativeTickets = input.getInitiativeTickets(input.initiative);
      if (initiativeTickets.length === 0) {
        throw new Error(`Cannot run ${input.kind} before tickets exist`);
      }

      coverageItems = coverage.items;
      uncoveredCoverageItemIds = coverage.uncoveredItemIds;
      tickets = initiativeTickets.map((ticket) => ({
        title: ticket.title,
        description: ticket.description,
        acceptanceCriteria: ticket.acceptanceCriteria.map((criterion) => criterion.text),
        fileTargets: ticket.fileTargets,
        coverageItemIds: ticket.coverageItemIds
      }));
      sourceUpdatedAts.tickets = input.initiative.workflow.steps.tickets.updatedAt ?? coverage.updatedAt;
      if (step === "validation") {
        sourceUpdatedAts.validation = input.initiative.workflow.steps.validation.updatedAt ?? coverage.updatedAt;
      }
      continue;
    }

    if (!isArtifactStep(step)) {
      continue;
    }

    if (!markdownByStep[step]?.trim()) {
      throw new Error(`Cannot run ${input.kind} before ${step} exists`);
    }
    const trace = await input.ensureArtifactTrace(input.initiative, step);
    traceOutlines[step] = { sections: trace.sections };
    sourceUpdatedAts[step] = input.requireSpecUpdatedAt(input.initiative.id, step);
  }

  const result = await input.executePlannerJob<ReviewRunResult>(
    "review",
    {
      initiativeDescription: input.initiative.description,
      kind: input.kind,
      briefMarkdown: markdownByStep.brief,
      coreFlowsMarkdown: markdownByStep["core-flows"],
      prdMarkdown: markdownByStep.prd,
      techSpecMarkdown: markdownByStep["tech-spec"],
      traceOutlines,
      coverageItems,
      uncoveredCoverageItemIds,
      tickets
    },
    input.onToken
  );

  input.validateReviewRunResult(result);

  return {
    id: `${input.initiative.id}:${input.kind}`,
    initiativeId: input.initiative.id,
    kind: input.kind,
    status: result.blockers.length > 0 ? "blocked" : "passed",
    summary: result.summary,
    findings: buildReviewFindings(input.kind, result),
    sourceUpdatedAts,
    overrideReason: null,
    reviewedAt: input.nowIso,
    updatedAt: input.nowIso
  };
};
