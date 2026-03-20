import { deriveInitiativeTitle } from "./ticket-factory.js";

const stripWrappingQuotes = (value: string): string => value.replace(/^["“”'`]+|["“”'`]+$/g, "").trim();

const startCaseHeading = (value: string): string =>
  value ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : value;

const deriveLegacyInitiativeTitle = (description: string): string => {
  const compact = description.trim().replace(/\s+/g, " ");
  if (!compact) {
    return "Untitled Project";
  }

  return compact.length > 64 ? `${compact.slice(0, 61)}...` : compact;
};

const normalizeBriefHeading = (rawHeading: string): string | null => {
  let title = rawHeading.trim();

  title = title.replace(/^brief\s*[:\-–—]\s*/i, "");
  title = title.replace(/^["“”'`]*brief["“”'`]*\s*[:\-–—]\s*/i, "");
  title = stripWrappingQuotes(title);

  if (!title || /^brief$/i.test(title)) {
    return null;
  }

  return startCaseHeading(title);
};

export const extractInitiativeTitleFromBriefMarkdown = (markdown: string): string | null => {
  const trimmed = markdown.trim();
  const headingMatch = trimmed.match(/^#\s+(.+?)\s*(?:\r?\n|$)/);
  if (!headingMatch) {
    return null;
  }

  return normalizeBriefHeading(headingMatch[1] ?? "");
};

export const shouldReplaceInitiativeTitle = (currentTitle: string, description: string): boolean => {
  const normalizedCurrentTitle = currentTitle.trim();
  if (!normalizedCurrentTitle) {
    return true;
  }

  return (
    normalizedCurrentTitle === description.trim() ||
    normalizedCurrentTitle === deriveInitiativeTitle(description) ||
    normalizedCurrentTitle === deriveLegacyInitiativeTitle(description)
  );
};
