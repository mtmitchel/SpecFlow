import { ARTIFACT_STEPS, PLANNING_STEPS, REVIEW_KINDS } from "../../planner/workflow-contract.js";
import type {
  ArtifactTraceOutline,
  PendingTicketPlanArtifact,
  PlanningReviewArtifact,
  PlanningReviewFinding,
  PlanningReviewStatus,
  TicketCoverageArtifact,
  TicketCoverageItem
} from "../../types/entities.js";

const REVIEW_STATUSES = new Set<PlanningReviewStatus>(["passed", "blocked", "overridden", "stale"]);

const assertRecord = (value: unknown, context: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }

  return value as Record<string, unknown>;
};

const assertString = (value: unknown, context: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${context} must be a non-empty string`);
  }

  return value;
};

const assertNullableString = (value: unknown, context: string): string | null => {
  if (value === null) {
    return null;
  }

  return assertString(value, context);
};

const assertStringArray = (value: unknown, context: string): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${context} must be an array of strings`);
  }

  return value;
};

const assertPlanningStepArray = (value: unknown, context: string): PlanningReviewFinding["relatedArtifacts"] => {
  const items = assertStringArray(value, context);
  if (items.some((item) => !PLANNING_STEPS.includes(item as (typeof PLANNING_STEPS)[number]))) {
    throw new Error(`${context} contains an unknown planning step`);
  }

  return items as PlanningReviewFinding["relatedArtifacts"];
};

const assertStepTimestampMap = (
  value: unknown,
  context: string
): Partial<Record<(typeof PLANNING_STEPS)[number], string>> => {
  const record = assertRecord(value ?? {}, context);
  for (const [key, entry] of Object.entries(record)) {
    if (!PLANNING_STEPS.includes(key as (typeof PLANNING_STEPS)[number])) {
      throw new Error(`${context} contains unexpected key "${key}"`);
    }
    if (typeof entry !== "string") {
      throw new Error(`${context}.${key} must be a string timestamp`);
    }
  }

  return record as Partial<Record<(typeof PLANNING_STEPS)[number], string>>;
};

const parseReviewFinding = (value: unknown, context: string): PlanningReviewFinding => {
  const record = assertRecord(value, context);
  const type = assertString(record.type, `${context}.type`);
  if (!["blocker", "warning", "traceability-gap", "assumption", "recommended-fix"].includes(type)) {
    throw new Error(`${context}.type is invalid`);
  }

  return {
    id: assertString(record.id, `${context}.id`),
    type: type as PlanningReviewFinding["type"],
    message: assertString(record.message, `${context}.message`),
    relatedArtifacts: assertPlanningStepArray(record.relatedArtifacts, `${context}.relatedArtifacts`)
  };
};

const parseCoverageItem = (value: unknown, context: string): TicketCoverageItem => {
  const record = assertRecord(value, context);
  const sourceStep = assertString(record.sourceStep, `${context}.sourceStep`);
  if (!ARTIFACT_STEPS.includes(sourceStep as (typeof ARTIFACT_STEPS)[number])) {
    throw new Error(`${context}.sourceStep is invalid`);
  }

  return {
    id: assertString(record.id, `${context}.id`),
    sourceStep: sourceStep as TicketCoverageItem["sourceStep"],
    sectionKey: assertString(record.sectionKey, `${context}.sectionKey`),
    sectionLabel: assertString(record.sectionLabel, `${context}.sectionLabel`),
    kind: assertString(record.kind, `${context}.kind`),
    text: assertString(record.text, `${context}.text`)
  };
};

const parsePendingPlanTicket = (
  value: unknown,
  context: string
): PendingTicketPlanArtifact["phases"][number]["tickets"][number] => {
  const record = assertRecord(value, context);
  return {
    title: assertString(record.title, `${context}.title`),
    description: assertString(record.description, `${context}.description`),
    acceptanceCriteria: assertStringArray(record.acceptanceCriteria, `${context}.acceptanceCriteria`),
    fileTargets: assertStringArray(record.fileTargets, `${context}.fileTargets`),
    coverageItemIds: assertStringArray(record.coverageItemIds, `${context}.coverageItemIds`)
  };
};

const parsePendingPlanPhase = (
  value: unknown,
  context: string
): PendingTicketPlanArtifact["phases"][number] => {
  const record = assertRecord(value, context);
  const ticketsRaw = record.tickets;
  if (!Array.isArray(ticketsRaw)) {
    throw new Error(`${context}.tickets must be an array`);
  }

  const order = record.order;
  if (typeof order !== "number" || !Number.isFinite(order)) {
    throw new Error(`${context}.order must be a number`);
  }

  return {
    name: assertString(record.name, `${context}.name`),
    order,
    tickets: ticketsRaw.map((ticket, index) =>
      parsePendingPlanTicket(ticket, `${context}.tickets[${index}]`)
    )
  };
};

export const parsePlanningReviewArtifact = (
  value: unknown,
  filePath: string
): PlanningReviewArtifact => {
  const record = assertRecord(value, `Planning review ${filePath}`);
  const kind = assertString(record.kind, `${filePath}.kind`);
  if (!REVIEW_KINDS.includes(kind as (typeof REVIEW_KINDS)[number])) {
    throw new Error(`${filePath}.kind is invalid`);
  }

  const status = assertString(record.status, `${filePath}.status`);
  if (!REVIEW_STATUSES.has(status as PlanningReviewStatus)) {
    throw new Error(`${filePath}.status is invalid`);
  }

  const findingsRaw = record.findings;
  if (!Array.isArray(findingsRaw)) {
    throw new Error(`${filePath}.findings must be an array`);
  }

  return {
    id: assertString(record.id, `${filePath}.id`),
    initiativeId: assertString(record.initiativeId, `${filePath}.initiativeId`),
    kind: kind as PlanningReviewArtifact["kind"],
    status: status as PlanningReviewStatus,
    summary: assertString(record.summary, `${filePath}.summary`),
    findings: findingsRaw.map((finding, index) => parseReviewFinding(finding, `${filePath}.findings[${index}]`)),
    sourceUpdatedAts: assertStepTimestampMap(record.sourceUpdatedAts ?? {}, `${filePath}.sourceUpdatedAts`),
    overrideReason: assertNullableString(record.overrideReason, `${filePath}.overrideReason`),
    reviewedAt: assertString(record.reviewedAt, `${filePath}.reviewedAt`),
    updatedAt: assertString(record.updatedAt, `${filePath}.updatedAt`)
  };
};

export const parseTicketCoverageArtifact = (
  value: unknown,
  filePath: string
): TicketCoverageArtifact => {
  const record = assertRecord(value, `Ticket coverage ${filePath}`);
  const itemsRaw = record.items;
  if (!Array.isArray(itemsRaw)) {
    throw new Error(`${filePath}.items must be an array`);
  }

  return {
    id: assertString(record.id, `${filePath}.id`),
    initiativeId: assertString(record.initiativeId, `${filePath}.initiativeId`),
    items: itemsRaw.map((item, index) => parseCoverageItem(item, `${filePath}.items[${index}]`)),
    uncoveredItemIds: assertStringArray(record.uncoveredItemIds, `${filePath}.uncoveredItemIds`),
    sourceUpdatedAts: assertStepTimestampMap(record.sourceUpdatedAts ?? {}, `${filePath}.sourceUpdatedAts`),
    generatedAt: assertString(record.generatedAt, `${filePath}.generatedAt`),
    updatedAt: assertString(record.updatedAt, `${filePath}.updatedAt`)
  };
};

export const parsePendingTicketPlanArtifact = (
  value: unknown,
  filePath: string
): PendingTicketPlanArtifact => {
  const record = assertRecord(value, `Pending ticket plan ${filePath}`);
  const phasesRaw = record.phases;
  const itemsRaw = record.coverageItems;
  if (!Array.isArray(phasesRaw)) {
    throw new Error(`${filePath}.phases must be an array`);
  }
  if (!Array.isArray(itemsRaw)) {
    throw new Error(`${filePath}.coverageItems must be an array`);
  }

  return {
    id: assertString(record.id, `${filePath}.id`),
    initiativeId: assertString(record.initiativeId, `${filePath}.initiativeId`),
    phases: phasesRaw.map((phase, index) => parsePendingPlanPhase(phase, `${filePath}.phases[${index}]`)),
    coverageItems: itemsRaw.map((item, index) => parseCoverageItem(item, `${filePath}.coverageItems[${index}]`)),
    uncoveredItemIds: assertStringArray(record.uncoveredItemIds, `${filePath}.uncoveredItemIds`),
    sourceUpdatedAts: assertStepTimestampMap(record.sourceUpdatedAts ?? {}, `${filePath}.sourceUpdatedAts`),
    generatedAt: assertString(record.generatedAt, `${filePath}.generatedAt`),
    updatedAt: assertString(record.updatedAt, `${filePath}.updatedAt`)
  };
};

export const parseArtifactTraceOutline = (
  value: unknown,
  filePath: string
): ArtifactTraceOutline => {
  const record = assertRecord(value, `Artifact trace ${filePath}`);
  const step = assertString(record.step, `${filePath}.step`);
  if (!ARTIFACT_STEPS.includes(step as (typeof ARTIFACT_STEPS)[number])) {
    throw new Error(`${filePath}.step is invalid`);
  }

  const sectionsRaw = record.sections;
  if (!Array.isArray(sectionsRaw)) {
    throw new Error(`${filePath}.sections must be an array`);
  }

  return {
    id: assertString(record.id, `${filePath}.id`),
    initiativeId: assertString(record.initiativeId, `${filePath}.initiativeId`),
    step: step as ArtifactTraceOutline["step"],
    sections: sectionsRaw.map((section, index) => {
      const sectionRecord = assertRecord(section, `${filePath}.sections[${index}]`);
      return {
        key: assertString(sectionRecord.key, `${filePath}.sections[${index}].key`),
        label: assertString(sectionRecord.label, `${filePath}.sections[${index}].label`),
        items: assertStringArray(sectionRecord.items, `${filePath}.sections[${index}].items`)
      };
    }),
    sourceUpdatedAt: assertString(record.sourceUpdatedAt, `${filePath}.sourceUpdatedAt`),
    generatedAt: assertString(record.generatedAt, `${filePath}.generatedAt`),
    updatedAt: assertString(record.updatedAt, `${filePath}.updatedAt`)
  };
};
