import type { Ticket } from "../../types/entities.js";
import type { TriageTicketDraft } from "../types.js";

export type PlannerTicketDraft =
  | TriageTicketDraft
  | { title: string; description: string; acceptanceCriteria: string[]; fileTargets: string[]; coverageItemIds?: string[] };

const TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "between",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with"
]);

const TITLE_SPECIAL_CASES = new Map<string, string>([
  ["api", "API"],
  ["cli", "CLI"],
  ["fedora", "Fedora"],
  ["github", "GitHub"],
  ["gtk", "GTK"],
  ["linux", "Linux"],
  ["llm", "LLM"],
  ["openai", "OpenAI"],
  ["openrouter", "OpenRouter"],
  ["prd", "PRD"],
  ["react", "React"],
  ["sql", "SQL"],
  ["tauri", "Tauri"],
  ["ui", "UI"],
  ["vite", "Vite"]
]);

const deriveLegacyInitiativeTitle = (description: string): string => {
  const compact = description.trim().replace(/\s+/g, " ");
  if (!compact) {
    return "Untitled Initiative";
  }

  return compact.length > 64 ? `${compact.slice(0, 61)}...` : compact;
};

const toTitleCase = (input: string): string => {
  const words = input.split(/\s+/).filter(Boolean);
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      const special = TITLE_SPECIAL_CASES.get(lower);
      if (special) {
        return special;
      }

      if (index > 0 && index < words.length - 1 && TITLE_STOP_WORDS.has(lower)) {
        return lower;
      }

      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
};

export const deriveInitiativeTitle = (description: string): string => {
  const compact = description.trim().replace(/\s+/g, " ");
  if (!compact) {
    return "Untitled Initiative";
  }

  const withoutLeadIn = compact.replace(
    /^(?:i|we)\s+(?:want|need)\s+to\s+(?:build|create|make|ship)\s+|^(?:build|create|make|ship)\s+/i,
    ""
  );

  const splitMarkers = [". ", "? ", "! ", " that's ", " that ", " which ", " in terms of "];
  const firstMarkerIndex = splitMarkers
    .map((marker) => withoutLeadIn.toLowerCase().indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  const rawTitle = (firstMarkerIndex === undefined ? withoutLeadIn : withoutLeadIn.slice(0, firstMarkerIndex))
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!rawTitle) {
    return deriveLegacyInitiativeTitle(description);
  }

  const formatted = toTitleCase(rawTitle);
  return formatted.length > 64 ? `${formatted.slice(0, 61).trimEnd()}...` : formatted;
};

const hasImplementationPlan = (draft: PlannerTicketDraft): draft is TriageTicketDraft => {
  return "implementationPlan" in draft && typeof draft.implementationPlan === "string";
};

const hasCoverageItemIds = (
  draft: PlannerTicketDraft | undefined
): draft is PlannerTicketDraft & { coverageItemIds: string[] } =>
  Boolean(draft && "coverageItemIds" in draft && Array.isArray(draft.coverageItemIds));

export const createTicketFromDraft = (input: {
  initiativeId: string | null;
  phaseId: string | null;
  status: Ticket["status"];
  draft?: PlannerTicketDraft;
  nowIso: string;
  idGenerator: () => string;
}): Ticket => {
  const title = input.draft?.title?.trim() || "Quick Task";
  const description = input.draft?.description?.trim() || title;
  const acceptanceCriteria =
    input.draft?.acceptanceCriteria?.map((text, index) => ({
      id: `criterion-${index + 1}`,
      text
    })) ?? [];

  const implementationPlan =
    input.draft && hasImplementationPlan(input.draft) ? input.draft.implementationPlan : "";

  return {
    id: `ticket-${input.idGenerator()}`,
    initiativeId: input.initiativeId,
    phaseId: input.phaseId,
    title,
    description,
    status: input.status,
    acceptanceCriteria,
    implementationPlan,
    fileTargets: input.draft?.fileTargets ?? [],
    coverageItemIds: hasCoverageItemIds(input.draft) ? input.draft.coverageItemIds : [],
    blockedBy: [],
    blocks: [],
    runId: null,
    createdAt: input.nowIso,
    updatedAt: input.nowIso
  };
};
