import path from "node:path";
import type { DiffSourceSelection } from "./types.js";

export const normalizeRelativePath = (rawPath: string): string | null => {
  const normalized = path.posix.normalize(rawPath.replaceAll("\\", "/"));
  if (normalized.startsWith("../") || path.isAbsolute(normalized)) {
    return null;
  }

  return normalized;
};

export const normalizeScopePaths = (scopePaths: string[]): string[] => {
  const normalized = scopePaths
    .map((entry) => normalizeRelativePath(entry))
    .filter((entry): entry is string => Boolean(entry));

  return Array.from(new Set(normalized));
};

export const buildRevisionArgs = (diffSource: Exclude<DiffSourceSelection, { mode: "snapshot" }>): string[] => {
  if (diffSource.mode === "branch") {
    return [`${diffSource.branch || "main"}...HEAD`];
  }

  if (diffSource.mode === "commit-range") {
    return [`${diffSource.from}..${diffSource.to}`];
  }

  return [];
};

export const buildScopedArgs = (scopePaths: string[]): string[] => {
  if (scopePaths.length === 0) {
    return [];
  }

  return ["--", ...scopePaths];
};
