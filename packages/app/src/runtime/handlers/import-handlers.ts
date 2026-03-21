import { isValidGitHubOwner, isValidGitHubRepo } from "../../validation.js";
import type { SpecFlowRuntime } from "../types.js";
import { badRequest, notFound, upstreamFailure } from "../errors.js";
import { structuredPlannerError } from "./shared.js";

const parseGithubIssueUrl = (
  raw: string
): { owner: string; repo: string; number: number } | null => {
  try {
    const parsed = new URL(raw);
    if (parsed.hostname !== "github.com") {
      return null;
    }

    const parts = parsed.pathname.replace(/^\//, "").split("/");
    if (parts.length < 4 || parts[2] !== "issues") {
      return null;
    }

    const num = parseInt(parts[3], 10);
    if (Number.isNaN(num) || num <= 0) {
      return null;
    }

    return { owner: parts[0], repo: parts[1], number: num };
  } catch {
    return null;
  }
};

interface ImportGithubIssueInput {
  url?: string;
  owner?: string;
  repo?: string;
  number?: number;
}

export const importGithubIssue = async (runtime: SpecFlowRuntime, input: ImportGithubIssueInput) => {
  let owner: string;
  let repo: string;
  let issueNumber: number;

  if (input.url) {
    const parsed = parseGithubIssueUrl(input.url.trim());
    if (!parsed) {
      throw badRequest("Invalid GitHub issue URL. Expected https://github.com/owner/repo/issues/N");
    }

    owner = parsed.owner;
    repo = parsed.repo;
    issueNumber = parsed.number;
  } else if (input.owner && input.repo && input.number) {
    if (!isValidGitHubOwner(input.owner)) {
      throw badRequest("Invalid GitHub owner format");
    }
    if (!isValidGitHubRepo(input.repo)) {
      throw badRequest("Invalid GitHub repo format");
    }
    if (!Number.isInteger(input.number) || input.number <= 0) {
      throw badRequest("Issue number must be a positive integer");
    }

    owner = input.owner;
    repo = input.repo;
    issueNumber = input.number;
  } else {
    throw badRequest("Provide url or owner + repo + number");
  }

  const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? process.env.GITHUB_TOKEN ?? "";
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "SpecFlow/1.0"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let githubReply: Response;
  try {
    githubReply = await runtime.fetchImpl(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`,
      { headers }
    );
  } catch {
    throw upstreamFailure("GitHub API unreachable; check connectivity", {
      error: "Import Failed",
      message: "GitHub API unreachable; check connectivity"
    });
  }

  if (!githubReply.ok) {
    if (githubReply.status === 404) {
      throw notFound(`GitHub issue ${owner}/${repo}#${issueNumber} not found or private`, {
        error: "Import Failed",
        message: `GitHub issue ${owner}/${repo}#${issueNumber} not found or private`
      });
    }

    throw upstreamFailure(`GitHub API returned HTTP ${githubReply.status}`, {
      error: "Import Failed",
      message: `GitHub API returned HTTP ${githubReply.status}`
    });
  }

  const issue = (await githubReply.json()) as {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    labels: Array<{ name: string }>;
  };

  const labelText =
    issue.labels.length > 0
      ? `\nLabels: ${issue.labels.map((label) => label.name).join(", ")}`
      : "";

  const description = [
    `GitHub Issue #${issue.number}: ${issue.title}`,
    `Source: ${issue.html_url}${labelText}`,
    "",
    issue.body?.trim() || "(no description provided)"
  ].join("\n");

  try {
    const triage = await runtime.plannerService.runTriageJob({ description });
    if (triage.decision === "too-large") {
      return {
        decision: "too-large" as const,
        reason: triage.reason,
        initiativeId: triage.initiative.id,
        initiativeTitle: triage.initiative.title
      };
    }

    return {
      decision: "ok" as const,
      reason: triage.reason,
      ticketId: triage.ticket.id,
      ticketTitle: triage.ticket.title,
      issueUrl: issue.html_url
    };
  } catch (error) {
    throw structuredPlannerError(runtime, error);
  }
};
