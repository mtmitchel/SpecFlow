import { parse } from "./http";
import { transportRequest } from "./transport";

export type ImportGithubIssueResult =
  | { decision: "ok"; reason: string; ticketId: string; ticketTitle: string; issueUrl: string }
  | { decision: "too-large"; reason: string; initiativeId: string; initiativeTitle: string };

export const importGithubIssue = async (
  url: string
): Promise<ImportGithubIssueResult> => {
  return transportRequest(
    "import.githubIssue",
    { url },
    async () => {
      const response = await fetch("/api/import/github-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      return parse<ImportGithubIssueResult>(response);
    }
  );
};
