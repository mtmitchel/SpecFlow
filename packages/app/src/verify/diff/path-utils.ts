import path from "node:path";
import { isValidGitRef } from "../../validation.js";
import type { DiffSourceSelection } from "./types.js";

export const normalizeRelativePath = (rawPath: string): string | null => {
  const normalized = path.posix.normalize(rawPath.trim().replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../") || path.isAbsolute(normalized)) {
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
    const branch = diffSource.branch || "main";
    if (!isValidGitRef(branch)) {
      throw new Error(`Invalid git branch ref: ${branch}`);
    }
    return [`${branch}...HEAD`];
  }

  if (diffSource.mode === "commit-range") {
    if (!isValidGitRef(diffSource.from) || !isValidGitRef(diffSource.to)) {
      throw new Error(`Invalid git ref in commit range: ${diffSource.from}..${diffSource.to}`);
    }
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
