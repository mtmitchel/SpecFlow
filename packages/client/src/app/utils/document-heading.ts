import type { InitiativeArtifactStep } from "../../types.js";

const stripWrappingQuotes = (value: string): string => value.replace(/^["“”'`]+|["“”'`]+$/g, "").trim();
const startCaseHeading = (value: string): string =>
  value ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : value;

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

  return startCaseHeading(title || initiativeTitle || fallbackTitle);
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
      : startCaseHeading(stripWrappingQuotes(rawTitle) || fallbackTitle);

  return {
    title,
    body: trimmed.slice(headingMatch[0].length).trimStart()
  };
};
