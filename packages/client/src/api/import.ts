import type { Initiative, Ticket } from "../types.js";
import { transportJsonRequest } from "./transport";

export type ImportGithubIssueResult =
  | { decision: "ok"; reason: string; ticket: Ticket; issueUrl: string }
  | { decision: "too-large"; reason: string; initiative: Initiative };

export const importGithubIssue = async (
  url: string
): Promise<ImportGithubIssueResult> => {
  return transportJsonRequest(
    "import.githubIssue",
    { url },
    undefined,
    { localMutationApplied: true }
  );
};
