import {
  deriveInitiativeTitle,
  normalizeInitiativeTitle,
} from "./title-style.js";

const stripWrappingQuotes = (value: string): string => value.replace(/^["“”'`]+|["“”'`]+$/g, "").trim();
const normalizeWhitespace = (value: string): string => value.trim().replace(/\s+/g, " ");
const stripTrailingEllipsis = (value: string): string => value.replace(/\.\.\.$/, "").trim();

const looksLikeDescriptionSnippet = (title: string, description: string): boolean => {
  const normalizedTitle = normalizeWhitespace(stripTrailingEllipsis(title)).toLowerCase();
  const normalizedDescription = normalizeWhitespace(description).toLowerCase();

  return normalizedTitle.length >= 12 && normalizedDescription.startsWith(normalizedTitle);
};

const normalizeBriefHeading = (rawHeading: string): string | null => {
  let title = rawHeading.trim();

  title = title.replace(/^brief\s*[:\-–—]\s*/i, "");
  title = title.replace(/^["“”'`]*brief["“”'`]*\s*[:\-–—]\s*/i, "");
  title = stripWrappingQuotes(title);

  if (!title || /^brief$/i.test(title)) {
    return null;
  }

  return normalizeInitiativeTitle(title);
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
    looksLikeDescriptionSnippet(normalizedCurrentTitle, description) ||
    normalizedCurrentTitle === "Untitled project"
  );
};
