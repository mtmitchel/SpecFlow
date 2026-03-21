import type { SpecDocument } from "../../types/entities.js";
import { normalizeInitiativeTitle, toSentenceCaseLabel } from "../../planner/internal/title-style.js";

const stripWrappingQuotes = (value: string): string => value.replace(/^["“”'`]+|["“”'`]+$/g, "").trim();

const normalizeBriefHeading = (rawHeading: string, fallbackTitle: string): string => {
  let title = rawHeading.trim();

  title = title.replace(/^brief\s*[:\-–—]\s*/i, "");
  title = title.replace(/^["“”'`]*brief["“”'`]*\s*[:\-–—]\s*/i, "");
  title = stripWrappingQuotes(title);

  if (!title || /^brief$/i.test(title)) {
    return fallbackTitle;
  }

  return normalizeInitiativeTitle(title);
};

export const extractSpecSummaryTitle = (
  type: SpecDocument["type"],
  markdown: string,
  fallbackTitle: string,
): string => {
  const headingMatch = markdown.trim().match(/^#\s+(.+?)\s*(?:\r?\n|$)/);
  if (!headingMatch) {
    return fallbackTitle;
  }

  const rawHeading = headingMatch[1]?.trim() ?? "";
  if (!rawHeading) {
    return fallbackTitle;
  }

  if (type === "brief") {
    return normalizeBriefHeading(rawHeading, fallbackTitle);
  }

  const title = stripWrappingQuotes(rawHeading);
  return title ? toSentenceCaseLabel(title) : fallbackTitle;
};
