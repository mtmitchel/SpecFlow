import { stat } from "node:fs/promises";
import path from "node:path";
import type { Initiative, Ticket } from "./types/entities.js";
import type { ArtifactStore } from "./store/artifact-store.js";

const normalizeProjectRoot = (storageRoot: string, projectRoot?: string | null): string => {
  if (typeof projectRoot === "string" && projectRoot.trim().length > 0) {
    return path.resolve(projectRoot);
  }

  return path.resolve(storageRoot);
};

export const resolveRequestedProjectRoot = (storageRoot: string, requestedPath: string): string =>
  path.resolve(path.isAbsolute(requestedPath) ? requestedPath : path.join(storageRoot, requestedPath));

export const assertProjectRootDirectory = async (projectRoot: string): Promise<void> => {
  let targetStat;

  try {
    targetStat = await stat(projectRoot);
  } catch {
    throw new Error(`Project folder not found: ${projectRoot}`);
  }

  if (!targetStat.isDirectory()) {
    throw new Error(`Project folder must be a directory: ${projectRoot}`);
  }
};

export const resolveInitiativeProjectRoot = (storageRoot: string, initiative: Initiative): string =>
  normalizeProjectRoot(storageRoot, initiative.projectRoot);

export const resolveTicketProjectRoot = (
  storageRoot: string,
  store: Pick<ArtifactStore, "initiatives">,
  ticket: Ticket
): string => {
  if (!ticket.initiativeId) {
    return path.resolve(storageRoot);
  }

  const initiative = store.initiatives.get(ticket.initiativeId);
  if (!initiative) {
    throw new Error(`Ticket ${ticket.id} references missing initiative ${ticket.initiativeId}`);
  }

  return resolveInitiativeProjectRoot(storageRoot, initiative);
};
