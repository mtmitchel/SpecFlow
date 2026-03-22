import type { LlmTokenHandler } from "../../llm/client.js";
import type { InitiativeArtifactStep, PlanningReviewArtifact } from "../../types/entities.js";
import { getImpactedReviewKinds } from "../planning-reviews.js";
import { executeReviewJob } from "../planner-service-runtime.js";
import type { PlannerServiceDependencies, ReviewJobInput } from "./planner-service-shared.js";

export async function runPlanningReviewJob(
  service: PlannerServiceDependencies,
  input: ReviewJobInput,
  onToken?: LlmTokenHandler,
  signal?: AbortSignal
): Promise<PlanningReviewArtifact> {
  const initiative = service.requireInitiative(input.initiativeId);
  const review = await executeReviewJob(
    service.getRuntimeContext(),
    initiative,
    input.kind,
    onToken,
    signal
  );
  await service.store.upsertPlanningReview(review);
  return review;
}

export async function overridePlanningReview(
  service: PlannerServiceDependencies,
  input: {
    initiativeId: string;
    kind: import("../../types/entities.js").PlanningReviewKind;
    reason: string;
  }
): Promise<PlanningReviewArtifact> {
  const reviewId = `${input.initiativeId}:${input.kind}`;
  const existing = service.store.planningReviews.get(reviewId);
  if (!existing) {
    throw new Error(`Review ${input.kind} not found for initiative ${input.initiativeId}`);
  }

  const nowIso = service.now().toISOString();
  const overridden: PlanningReviewArtifact = {
    ...existing,
    status: "overridden",
    overrideReason: input.reason,
    updatedAt: nowIso
  };
  await service.store.upsertPlanningReview(overridden);
  return overridden;
}

export async function markPlanningArtifactsStale(
  service: PlannerServiceDependencies,
  initiativeId: string,
  step: InitiativeArtifactStep
): Promise<void> {
  const nowIso = service.now().toISOString();
  for (const kind of getImpactedReviewKinds(step)) {
    const reviewId = `${initiativeId}:${kind}`;
    const review = service.store.planningReviews.get(reviewId);
    if (!review) {
      continue;
    }

    await service.store.upsertPlanningReview({
      ...review,
      status: "stale",
      overrideReason: null,
      updatedAt: nowIso
    });
  }
}
