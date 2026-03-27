import type { LlmTokenHandler } from "../../llm/client.js";
import { LlmProviderError } from "../../llm/errors.js";
import { logObservabilityEvent } from "../../observability.js";
import { resolveInitiativeProjectRoot } from "../../project-roots.js";
import type {
  Initiative,
  PlanningReviewArtifact,
  PlanningReviewFindingType,
  Ticket
} from "../../types/entities.js";
import { blockWorkflowAtStep } from "../workflow-state.js";
import { requireSpecUpdatedAt } from "./context.js";
import { resolveValidatedPlanResult } from "./plan-generation-job.js";
import { buildPendingTicketPlanArtifact, commitPendingTicketPlanArtifact } from "./plan-job.js";
import { validateCoverageMappings } from "./plan-validation.js";
import { scanRepo } from "./repo-scanner.js";
import { buildPersistedTicketCoverageArtifact, buildTicketCoverageInput } from "./spec-artifacts.js";
import { createTicketFromDraft } from "./ticket-factory.js";
import { normalizeInitiativeTitle } from "./title-style.js";
import { validatePlanResult, validateTriageResult } from "./validators.js";
import { ensureArtifactTrace, executeReviewJob } from "../planner-service-runtime.js";
import type { PlanResult, PlanValidationFeedback, PlanValidationIssue, TriageResult } from "../types.js";
import type { PlannerServiceDependencies, TriageJobResult } from "./planner-service-shared.js";

export type PlanStatusSink = (message: string) => Promise<void> | void;

const countTraceSections = (
  traceOutlines: import("../types.js").PlannerTraceOutlineMap
): number =>
  Object.values(traceOutlines).reduce(
    (total, trace) => total + (trace?.sections.length ?? 0),
    0
  );

const estimatePromptInputBytes = (value: unknown): number =>
  JSON.stringify(value)?.length ?? 0;

const REVIEW_PLAN_REPAIR_FINDING_TYPES: PlanningReviewFindingType[] = [
  "blocker",
  "traceability-gap",
  "recommended-fix"
];

const buildReviewRepairFeedback = (
  review: PlanningReviewArtifact
): PlanValidationFeedback | null => {
  if (review.status !== "blocked") {
    return null;
  }

  const seenMessages = new Set<string>();
  const issues: PlanValidationIssue[] = [];

  for (const finding of review.findings) {
    if (!REVIEW_PLAN_REPAIR_FINDING_TYPES.includes(finding.type)) {
      continue;
    }

    const message = finding.message.trim();
    if (!message || seenMessages.has(message)) {
      continue;
    }

    seenMessages.add(message);
    issues.push({
      kind: "review-finding",
      message
    });
  }

  const summary = review.summary.trim();
  if (!summary && issues.length === 0) {
    return null;
  }

  return {
    summary: summary || "Validation review found unresolved ticket-plan blockers.",
    issues
  };
};

export async function runPlanJob(
  service: PlannerServiceDependencies,
  input: { initiativeId: string },
  onToken?: LlmTokenHandler,
  signal?: AbortSignal,
  onStatus?: PlanStatusSink
): Promise<PlanResult> {
  const initiative = service.requireInitiative(input.initiativeId);
  const projectRoot = resolveInitiativeProjectRoot(service.rootDir, initiative);
  const emitStatus = async (message: string): Promise<void> => {
    await onStatus?.(message);
  };

  await emitStatus("Preparing validation inputs...");
  const coverageInput = await buildTicketCoverageInput({
    initiative,
    requireSpecUpdatedAt: (currentInitiativeId, step) =>
      requireSpecUpdatedAt(currentInitiativeId, step, service.store.specs),
    ensureArtifactTrace: (currentInitiative, step) =>
      ensureArtifactTrace(service.getRuntimeContext(), currentInitiative, step, signal)
  });
  const repoContext = await scanRepo(projectRoot).catch((err: unknown) => {
    console.warn("[planner] repo context unavailable:", (err as Error).message);
    return undefined;
  });
  const traceStepCount = Object.keys(coverageInput.traceOutlines).length;
  const traceSectionCount = countTraceSections(coverageInput.traceOutlines);
  const repoContextBytes = repoContext ? estimatePromptInputBytes(repoContext) : 0;
  let latestAttemptMode: "plan" | "plan-repair" = "plan";

  logObservabilityEvent({
    layer: "runtime",
    event: "planner.validation.plan",
    status: "start",
    details: {
      initiativeId: initiative.id,
      coverageItemCount: coverageInput.items.length,
      traceStepCount,
      traceSectionCount,
      repoContextBytes
    }
  });

  let result: PlanResult;
  try {
    result = await resolveValidatedPlanResult({
      planInput: {
        initiativeDescription: initiative.description,
        traceOutlines: coverageInput.traceOutlines,
        coverageItems: coverageInput.items,
        repoContext
      },
      executePlan: (nextPlanInput) =>
        service.executePlannerJob<PlanResult>("plan", nextPlanInput, onToken, signal, projectRoot),
      executePlanRepair: (nextPlanInput) =>
        service.executePlannerJob<PlanResult>(
          "plan-repair",
          nextPlanInput,
          onToken,
          signal,
          projectRoot
        ),
      validateResult: (nextResult) => {
        validatePlanResult(nextResult);
        validateCoverageMappings(nextResult, coverageInput.items);
      },
      onAttempt: async ({ attemptNumber, mode, planInput }) => {
        latestAttemptMode = mode;
        await emitStatus(
          mode === "plan"
            ? `Drafting ticket plan (attempt ${attemptNumber} of 3)...`
            : `Repairing ticket coverage (attempt ${attemptNumber} of 3)...`
        );
        logObservabilityEvent({
          layer: "runtime",
          event: "planner.validation.plan.attempt",
          status: "start",
          details: {
            initiativeId: initiative.id,
            attemptNumber,
            mode,
            promptInputBytes: estimatePromptInputBytes(planInput),
            coverageItemCount: planInput.coverageItems.length,
            traceStepCount: Object.keys(planInput.traceOutlines).length,
            traceSectionCount: countTraceSections(planInput.traceOutlines)
          }
        });
      }
    });
  } catch (error) {
    logObservabilityEvent({
      layer: "runtime",
      event: "planner.validation.plan",
      status: error instanceof LlmProviderError && error.code === "timeout" ? "timeout" : "error",
      details: {
        initiativeId: initiative.id,
        mode: latestAttemptMode,
        timeoutSource:
          error instanceof LlmProviderError && error.code === "timeout"
            ? latestAttemptMode
            : undefined,
        message: error instanceof Error ? error.message : String(error)
      }
    });
    throw error;
  }

  let pendingPlanNowIso = service.now().toISOString();
  let pendingPlan = buildPendingTicketPlanArtifact({
    initiativeId: initiative.id,
    result,
    coverageItems: coverageInput.items,
    sourceUpdatedAts: coverageInput.sourceUpdatedAts,
    nowIso: pendingPlanNowIso
  });
  await service.store.upsertPendingTicketPlanArtifact(pendingPlan);

  await emitStatus("Running ticket coverage review...");
  let review = await executeReviewJob(
    service.getRuntimeContext(),
    initiative,
    "ticket-coverage-review",
    undefined,
    signal
  );
  await service.store.upsertPlanningReview(review);

  const reviewRepairFeedback = buildReviewRepairFeedback(review);
  if (review.status === "blocked" && reviewRepairFeedback) {
    const repairedResult = await resolveValidatedPlanResult({
      planInput: {
        initiativeDescription: initiative.description,
        traceOutlines: coverageInput.traceOutlines,
        coverageItems: coverageInput.items,
        repoContext,
        validationFeedback: reviewRepairFeedback,
        previousInvalidResult: result
      },
      executePlan: (nextPlanInput) =>
        service.executePlannerJob<PlanResult>(
          "plan-repair",
          nextPlanInput,
          onToken,
          signal,
          projectRoot
        ),
      executePlanRepair: (nextPlanInput) =>
        service.executePlannerJob<PlanResult>(
          "plan-repair",
          nextPlanInput,
          onToken,
          signal,
          projectRoot
        ),
      validateResult: (nextResult) => {
        validatePlanResult(nextResult);
        validateCoverageMappings(nextResult, coverageInput.items);
      },
      onAttempt: async ({ attemptNumber, planInput }) => {
        await emitStatus(`Repairing ticket plan from validation review (attempt ${attemptNumber} of 3)...`);
        logObservabilityEvent({
          layer: "runtime",
          event: "planner.validation.plan.attempt",
          status: "start",
          details: {
            initiativeId: initiative.id,
            attemptNumber,
            mode: "plan-repair",
            promptInputBytes: estimatePromptInputBytes(planInput),
            coverageItemCount: planInput.coverageItems.length,
            traceStepCount: Object.keys(planInput.traceOutlines).length,
            traceSectionCount: countTraceSections(planInput.traceOutlines)
          }
        });
      }
    });

    result = repairedResult;
    pendingPlanNowIso = service.now().toISOString();
    pendingPlan = buildPendingTicketPlanArtifact({
      initiativeId: initiative.id,
      result,
      coverageItems: coverageInput.items,
      sourceUpdatedAts: coverageInput.sourceUpdatedAts,
      nowIso: pendingPlanNowIso
    });
    await service.store.upsertPendingTicketPlanArtifact(pendingPlan);

    await emitStatus("Rechecking ticket coverage...");
    review = await executeReviewJob(
      service.getRuntimeContext(),
      initiative,
      "ticket-coverage-review",
      undefined,
      signal
    );
    await service.store.upsertPlanningReview(review);
  }

  if (review.status === "blocked") {
    const refreshedInitiative = service.requireInitiative(initiative.id);
    await service.store.upsertInitiative({
      ...refreshedInitiative,
      workflow: blockWorkflowAtStep(
        refreshedInitiative.workflow,
        "validation",
        service.now().toISOString()
      ),
      updatedAt: service.now().toISOString()
    });
    await emitStatus("Validation found follow-up work.");
    return result;
  }

  await emitStatus("Committing ticket plan...");
  await commitPendingPlan(service, initiative, pendingPlan, service.now().toISOString());
  logObservabilityEvent({
    layer: "runtime",
    event: "planner.validation.plan",
    status: "ok",
    details: {
      initiativeId: initiative.id,
      coverageItemCount: coverageInput.items.length,
      traceStepCount,
      traceSectionCount
    }
  });
  return result;
}

export async function commitPendingPlan(
  service: PlannerServiceDependencies,
  initiative: Initiative,
  pendingPlan: import("../../types/entities.js").PendingTicketPlanArtifact,
  nowIso: string
): Promise<void> {
  await commitPendingTicketPlanArtifact({
    initiative,
    pendingPlan,
    nowIso,
    idGenerator: service.idGenerator,
    upsertTicket: (ticket) => service.store.upsertTicket(ticket),
    deleteTicket: (ticketId) => service.store.deleteTicket(ticketId),
    getTicket: (ticketId) => service.store.tickets.get(ticketId),
    listInitiativeTickets: (initiativeId) =>
      Array.from(service.store.tickets.values()).filter((ticket) => ticket.initiativeId === initiativeId),
    upsertInitiative: (updatedInitiative) => service.store.upsertInitiative(updatedInitiative),
    deletePendingTicketPlanArtifact: (initiativeId) =>
      service.store.deletePendingTicketPlanArtifact(initiativeId),
    upsertTicketCoverageArtifact: (artifact) => service.store.upsertTicketCoverageArtifact(artifact),
    buildTicketCoverageArtifact: ({
      initiativeId,
      items,
      uncoveredItemIds,
      sourceUpdatedAts,
      nowIso: artifactNowIso
    }) =>
      buildPersistedTicketCoverageArtifact({
        initiativeId,
        items,
        uncoveredItemIds,
        sourceUpdatedAts,
        nowIso: artifactNowIso
      })
  });
}

export async function commitPendingPlanForInitiative(
  service: PlannerServiceDependencies,
  input: { initiativeId: string }
): Promise<void> {
  const initiative = service.requireInitiative(input.initiativeId);
  const pendingPlan = service.store.pendingTicketPlans.get(`${initiative.id}:pending-ticket-plan`);
  if (!pendingPlan) {
    throw new Error(`Pending ticket plan is missing for initiative ${initiative.id}`);
  }

  await commitPendingPlan(service, initiative, pendingPlan, service.now().toISOString());
}

export async function runTriageJob(
  service: PlannerServiceDependencies,
  input: { description: string },
  onToken?: LlmTokenHandler,
  signal?: AbortSignal
): Promise<TriageJobResult> {
  const result = await service.executePlannerJob<TriageResult>("triage", input, onToken, signal);
  validateTriageResult(result);

  const normalizedDecision = result.decision.toLowerCase();
  const nowIso = service.now().toISOString();

  if (normalizedDecision === "too-large") {
    const initiative = await service.createDraftInitiative({ description: input.description });
    const titledInitiative =
      result.initiativeTitle?.trim() &&
      normalizeInitiativeTitle(result.initiativeTitle) !== initiative.title
        ? { ...initiative, title: normalizeInitiativeTitle(result.initiativeTitle), updatedAt: nowIso }
        : initiative;
    if (titledInitiative !== initiative) {
      await service.store.upsertInitiative(titledInitiative);
    }

    return {
      decision: "too-large",
      reason: result.reason,
      initiative: titledInitiative
    };
  }

  const ticket: Ticket = createTicketFromDraft({
    initiativeId: null,
    phaseId: null,
    status: "ready",
    draft: result.ticketDraft,
    nowIso,
    idGenerator: service.idGenerator
  });

  await service.store.upsertTicket(ticket);
  return {
    decision: "ok",
    reason: result.reason,
    ticket
  };
}
