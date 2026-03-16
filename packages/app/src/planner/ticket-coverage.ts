import type {
  ArtifactTraceOutline,
  InitiativeArtifactStep,
  InitiativePlanningStep,
  TicketCoverageArtifact,
  TicketCoverageItem
} from "../types/entities.js";

const COVERAGE_STEPS: InitiativeArtifactStep[] = ["brief", "core-flows", "prd", "tech-spec"];

const SECTION_KEYS_BY_STEP: Record<
  InitiativeArtifactStep,
  Array<{ key: string; kind: string }>
> = {
  brief: [
    { key: "goals", kind: "goal" },
    { key: "constraints", kind: "constraint" },
    { key: "success-criteria", kind: "success-criterion" }
  ],
  "core-flows": [
    { key: "flows", kind: "flow" },
    { key: "states", kind: "state" },
    { key: "edge-cases", kind: "edge-case" }
  ],
  prd: [
    { key: "requirements", kind: "requirement" },
    { key: "rules", kind: "rule" },
    { key: "acceptance-criteria", kind: "acceptance-criterion" }
  ],
  "tech-spec": [
    { key: "decisions", kind: "decision" },
    { key: "verification-hooks", kind: "verification-hook" }
  ]
};

const sanitizeKey = (value: string): string => value.replace(/[^a-z0-9-]/gi, "-").toLowerCase();

const toCoverageItemId = (step: InitiativeArtifactStep, sectionKey: string, index: number): string =>
  `coverage-${sanitizeKey(step)}-${sanitizeKey(sectionKey)}-${index + 1}`;

export const getTicketCoverageArtifactId = (initiativeId: string): string =>
  `${initiativeId}:ticket-coverage`;

export const getTicketCoverageReviewId = (initiativeId: string): string =>
  `${initiativeId}:ticket-coverage-review`;

export const buildTicketCoverageItems = (
  traces: Partial<Record<InitiativeArtifactStep, ArtifactTraceOutline>>
): TicketCoverageItem[] => {
  const items: TicketCoverageItem[] = [];

  for (const step of COVERAGE_STEPS) {
    const trace = traces[step];
    if (!trace) {
      continue;
    }

    const preferredSections = SECTION_KEYS_BY_STEP[step]
      .map((sectionConfig) => ({
        sectionConfig,
        section: trace.sections.find((candidate) => candidate.key === sectionConfig.key)
      }))
      .filter((candidate): candidate is { sectionConfig: { key: string; kind: string }; section: ArtifactTraceOutline["sections"][number] } => Boolean(candidate.section));

    const sectionsToUse =
      preferredSections.length > 0
        ? preferredSections
        : trace.sections.map((section) => ({
            sectionConfig: { key: section.key, kind: section.key },
            section
          }));

    for (const { sectionConfig, section } of sectionsToUse) {
      if (!section) {
        continue;
      }

      for (const item of section.items.map((candidate) => candidate.trim()).filter(Boolean)) {
        items.push({
          id: toCoverageItemId(step, section.key, items.filter((candidate) => (
            candidate.sourceStep === step && candidate.sectionKey === section.key
          )).length),
          sourceStep: step,
          sectionKey: section.key,
          sectionLabel: section.label,
          kind: sectionConfig.kind,
          text: item
        });
      }
    }
  }

  return items;
};

export const buildTicketCoverageArtifact = (input: {
  initiativeId: string;
  items: TicketCoverageItem[];
  uncoveredItemIds: string[];
  sourceUpdatedAts: Partial<Record<InitiativePlanningStep, string>>;
  nowIso: string;
}): TicketCoverageArtifact => ({
  id: getTicketCoverageArtifactId(input.initiativeId),
  initiativeId: input.initiativeId,
  items: input.items,
  uncoveredItemIds: input.uncoveredItemIds,
  sourceUpdatedAts: input.sourceUpdatedAts,
  generatedAt: input.nowIso,
  updatedAt: input.nowIso
});
