import type { LlmTokenHandler } from "../../llm/client.js";
import { resolveInitiativeProjectRoot } from "../../project-roots.js";
import type { Initiative, Ticket } from "../../types/entities.js";
import { blockWorkflowAtStep } from "../workflow-state.js";
import { requireSpecMarkdown, requireSpecUpdatedAt } from "./context.js";
import { resolveValidatedPlanResult } from "./plan-generation-job.js";
import { buildPendingTicketPlanArtifact, commitPendingTicketPlanArtifact } from "./plan-job.js";
import { validateCoverageMappings } from "./plan-validation.js";
import { scanRepo } from "./repo-scanner.js";
import { buildPersistedTicketCoverageArtifact, buildTicketCoverageInput } from "./spec-artifacts.js";
import { createTicketFromDraft } from "./ticket-factory.js";
import { normalizeInitiativeTitle } from "./title-style.js";
import { validatePlanResult, validateTriageResult } from "./validators.js";
import { ensureArtifactTrace, executeReviewJob } from "../planner-service-runtime.js";
import type { PlanResult, TriageResult } from "../types.js";
import type { PlannerServiceDependencies, TriageJobResult } from "./planner-service-shared.js";

export async function runPlanJob(
  service: PlannerServiceDependencies,
  input: { initiativeId: string },
  onToken?: LlmTokenHandler,
  signal?: AbortSignal
): Promise<PlanResult> {
  const initiative = service.requireInitiative(input.initiativeId);
  const projectRoot = resolveInitiativeProjectRoot(service.rootDir, initiative);
  const brief = await requireSpecMarkdown(initiative.id, "brief", (specId) =>
    service.store.readSpecMarkdown(specId)
  );
  const coreFlows = await requireSpecMarkdown(initiative.id, "core-flows", (specId) =>
    service.store.readSpecMarkdown(specId)
  );
  const prd = await requireSpecMarkdown(initiative.id, "prd", (specId) =>
    service.store.readSpecMarkdown(specId)
  );
  const techSpec = await requireSpecMarkdown(initiative.id, "tech-spec", (specId) =>
    service.store.readSpecMarkdown(specId)
  );
  const coverageInput = await buildTicketCoverageInput({
    initiative,
    requireSpecUpdatedAt: (currentInitiativeId, step) =>
      requireSpecUpdatedAt(currentInitiativeId, step, service.store.specs),
    ensureArtifactTrace: (currentInitiative, step) =>
      ensureArtifactTrace(service.getRuntimeContext(), currentInitiative, step, signal)
  });
  const repoContext = await scanRepo(projectRoot).catch(() => undefined);

  const result = await resolveValidatedPlanResult({
    planInput: {
      initiativeDescription: initiative.description,
      briefMarkdown: brief,
      coreFlowsMarkdown: coreFlows,
      prdMarkdown: prd,
      techSpecMarkdown: techSpec,
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
    }
  });

  const nowIso = service.now().toISOString();
  const pendingPlan = buildPendingTicketPlanArtifact({
    initiativeId: initiative.id,
    result,
    coverageItems: coverageInput.items,
    sourceUpdatedAts: coverageInput.sourceUpdatedAts,
    nowIso
  });
  await service.store.upsertPendingTicketPlanArtifact(pendingPlan);

  const review = await executeReviewJob(
    service.getRuntimeContext(),
    initiative,
    "ticket-coverage-review",
    undefined,
    signal
  );
  await service.store.upsertPlanningReview(review);

  if (review.status === "blocked") {
    const refreshedInitiative = service.requireInitiative(initiative.id);
    await service.store.upsertInitiative({
      ...refreshedInitiative,
      workflow: blockWorkflowAtStep(refreshedInitiative.workflow, "validation", nowIso),
      updatedAt: nowIso
    });
    return result;
  }

  await commitPendingPlan(service, initiative, pendingPlan, nowIso);
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
