import type { TicketCoverageItem } from "../../types/entities.js";
import { PLANNING_STEP_LABELS } from "../workflow-contract.js";
import type {
  PlanResult,
  PlanValidationFeedback,
  PlanValidationIssue,
} from "../types.js";

const MAX_SUMMARY_ISSUES = 3;

const formatCoverageKind = (value: string): string => value.replace(/-/g, " ");

const buildIssueSummary = (issues: PlanValidationIssue[]): string => {
  if (issues.length === 1) {
    return issues[0].message;
  }

  const preview = issues
    .slice(0, MAX_SUMMARY_ISSUES)
    .map((issue) => issue.message)
    .join("; ");
  const remainingCount = issues.length - MAX_SUMMARY_ISSUES;

  return remainingCount > 0
    ? `Generated ticket plan has ${issues.length} coverage validation issues: ${preview}; and ${remainingCount} more.`
    : `Generated ticket plan has ${issues.length} coverage validation issues: ${preview}.`;
};

const createMissingCoverageIssue = (
  coverageItemId: string,
  coverageItem: TicketCoverageItem,
): PlanValidationIssue => ({
  kind: "missing-coverage-item",
  message: `Missing ${PLANNING_STEP_LABELS[coverageItem.sourceStep]} ${formatCoverageKind(coverageItem.kind)}: ${coverageItem.text}`,
  coverageItemId,
  coverageItem,
});

export class PlanValidationError extends Error {
  public readonly issues: PlanValidationIssue[];

  public constructor(issues: PlanValidationIssue[]) {
    super(buildIssueSummary(issues));
    this.name = "PlanValidationError";
    this.issues = issues;
  }
}

export const buildPlanValidationFeedback = (
  error: unknown,
): PlanValidationFeedback => ({
  summary: error instanceof Error ? error.message : String(error),
  issues: error instanceof PlanValidationError ? error.issues : [],
});

export const validateCoverageMappings = (
  result: PlanResult,
  coverageItems: TicketCoverageItem[],
): void => {
  const knownCoverageItemsById = new Map(
    coverageItems.map((item) => [item.id, item] as const),
  );
  const assignedCoverageItemIds = new Set<string>();
  const issues: PlanValidationIssue[] = [];

  for (const phase of result.phases) {
    for (const ticket of phase.tickets) {
      if (knownCoverageItemsById.size > 0 && ticket.coverageItemIds.length === 0) {
        issues.push({
          kind: "ticket-missing-coverage",
          message: `Plan ticket "${ticket.title}" must reference at least one coverage item`,
          ticketTitle: ticket.title,
        });
      }

      for (const coverageItemId of ticket.coverageItemIds) {
        const coverageItem = knownCoverageItemsById.get(coverageItemId);
        if (!coverageItem) {
          issues.push({
            kind: "unknown-ticket-coverage-item",
            message: `Plan ticket "${ticket.title}" references unknown coverage item "${coverageItemId}"`,
            coverageItemId,
            ticketTitle: ticket.title,
          });
          continue;
        }

        assignedCoverageItemIds.add(coverageItemId);
      }
    }
  }

  const uncoveredCoverageItemIds = new Set<string>();
  for (const coverageItemId of result.uncoveredCoverageItemIds) {
    const coverageItem = knownCoverageItemsById.get(coverageItemId);
    if (!coverageItem) {
      issues.push({
        kind: "unknown-uncovered-coverage-item",
        message: `Plan uncoveredCoverageItemIds references unknown coverage item "${coverageItemId}"`,
        coverageItemId,
      });
      continue;
    }

    if (assignedCoverageItemIds.has(coverageItemId)) {
      issues.push({
        kind: "assigned-and-uncovered-coverage-item",
        message: `Coverage item "${coverageItemId}" cannot be both assigned and uncovered`,
        coverageItemId,
        coverageItem,
      });
    }

    uncoveredCoverageItemIds.add(coverageItemId);
  }

  for (const [coverageItemId, coverageItem] of knownCoverageItemsById) {
    if (
      !assignedCoverageItemIds.has(coverageItemId) &&
      !uncoveredCoverageItemIds.has(coverageItemId)
    ) {
      issues.push(createMissingCoverageIssue(coverageItemId, coverageItem));
    }
  }

  if (issues.length > 0) {
    throw new PlanValidationError(issues);
  }
};
