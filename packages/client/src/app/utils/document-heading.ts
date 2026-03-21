import type { InitiativeArtifactStep } from "../../types.js";

const stripWrappingQuotes = (value: string): string => value.replace(/^["“”'`]+|["“”'`]+$/g, "").trim();
const TITLE_SPECIAL_CASES = new Map<string, string>([
  ["api", "API"],
  ["github", "GitHub"],
  ["json", "JSON"],
  ["prd", "PRD"],
  ["pwa", "PWA"],
  ["tauri", "Tauri"],
  ["ui", "UI"],
  ["ux", "UX"],
]);
const applySpecialCases = (value: string): string => {
  let normalized = value;

  for (const [lowercase, styled] of TITLE_SPECIAL_CASES.entries()) {
    normalized = normalized.replace(
      new RegExp(`\\b${lowercase}\\b`, "gi"),
      styled
    );
  }

  return normalized;
};
const toSentenceCaseHeading = (value: string): string => {
  const normalized = stripWrappingQuotes(value).trim();
  if (!normalized) {
    return normalized;
  }

  return applySpecialCases(normalized.toLowerCase()).replace(
    /(^|:\s+|\/)([a-z])/g,
    (_, prefix: string, character: string) => `${prefix}${character.toUpperCase()}`
  );
};

const normalizeBriefHeading = (
  rawHeading: string,
  initiativeTitle: string,
  fallbackTitle: string
): string => {
  let title = rawHeading.trim();

  title = title.replace(/^brief\s*[:\-–—]\s*/i, "");
  title = title.replace(/^["“”'`]*brief["“”'`]*\s*[:\-–—]\s*/i, "");
  title = stripWrappingQuotes(title);

  if (/^brief$/i.test(title)) {
    title = "";
  }

  return toSentenceCaseHeading(title || initiativeTitle || fallbackTitle);
};

export const extractDocumentHeading = (
  content: string,
  step: InitiativeArtifactStep,
  fallbackTitle: string,
  initiativeTitle: string
): { title: string; body: string } => {
  const trimmed = content.trim();
  const headingMatch = trimmed.match(/^#\s+(.+?)\s*(?:\r?\n|$)/);

  if (!headingMatch) {
    return {
      title: step === "brief" ? initiativeTitle || fallbackTitle : fallbackTitle,
      body: trimmed
    };
  }

  const rawTitle = headingMatch[1].trim();
  const title =
    step === "brief"
      ? normalizeBriefHeading(rawTitle, initiativeTitle, fallbackTitle)
      : toSentenceCaseHeading(stripWrappingQuotes(rawTitle) || fallbackTitle);

  return {
    title,
    body: trimmed.slice(headingMatch[0].length).trimStart()
  };
};
