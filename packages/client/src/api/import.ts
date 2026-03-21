import { transportJsonRequest } from "./transport";

export type ImportGithubIssueResult =
  | { decision: "ok"; reason: string; ticketId: string; ticketTitle: string; issueUrl: string }
  | { decision: "too-large"; reason: string; initiativeId: string; initiativeTitle: string };

export const importGithubIssue = async (
  url: string
): Promise<ImportGithubIssueResult> => {
  return transportJsonRequest(
    "import.githubIssue",
    { url },
    { url: "/api/import/github-issue", method: "POST", body: { url } }
  );
};
