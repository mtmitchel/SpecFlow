import type { FastifyInstance } from "fastify";
import type { PlannerService } from "../../planner/planner-service.js";

export interface RegisterImportRoutesOptions {
  plannerService: PlannerService;
  fetchImpl?: typeof fetch;
}

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

export const registerImportRoutes = (
  app: FastifyInstance,
  options: RegisterImportRoutesOptions
): void => {
  const { plannerService, fetchImpl = fetch } = options;

  app.post("/api/import/github-issue", async (request, reply) => {
    const body = (request.body ?? {}) as {
      url?: string;
      owner?: string;
      repo?: string;
      number?: number;
    };

    let owner: string;
    let repo: string;
    let issueNumber: number;

    if (body.url) {
      const parsed = parseGithubIssueUrl(body.url.trim());
      if (!parsed) {
        await reply.code(400).send({
          error: "Bad Request",
          message: "Invalid GitHub issue URL. Expected https://github.com/owner/repo/issues/N"
        });
        return;
      }

      owner = parsed.owner;
      repo = parsed.repo;
      issueNumber = parsed.number;
    } else if (body.owner && body.repo && body.number) {
      owner = body.owner;
      repo = body.repo;
      issueNumber = body.number;
    } else {
      await reply.code(400).send({
        error: "Bad Request",
        message: "Provide url or owner + repo + number"
      });
      return;
    }

    const token =
      process.env.GITHUB_PERSONAL_ACCESS_TOKEN ??
      process.env.GITHUB_TOKEN ??
      "";

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "SpecFlow/1.0"
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    let githubReply: Response;
    try {
      githubReply = await fetchImpl(
        `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
        { headers }
      );
    } catch (err) {
      await reply.code(502).send({
        error: "Import Failed",
        message: `GitHub API unreachable: ${(err as Error).message}`
      });
      return;
    }

    if (!githubReply.ok) {
      const statusCode = githubReply.status === 404 ? 404 : 502;
      const message =
        githubReply.status === 404
          ? `GitHub issue ${owner}/${repo}#${issueNumber} not found or private`
          : `GitHub API returned HTTP ${githubReply.status}`;
      await reply.code(statusCode).send({ error: "Import Failed", message });
      return;
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
      const triage = await plannerService.runTriageJob({ description });

      if (triage.decision === "too-large") {
        await reply.code(201).send({
          decision: "too-large",
          reason: triage.reason,
          initiativeId: triage.initiative.id,
          initiativeTitle: triage.initiative.title
        });
        return;
      }

      await reply.code(201).send({
        decision: "ok",
        reason: triage.reason,
        ticketId: triage.ticket.id,
        ticketTitle: triage.ticket.title,
        issueUrl: issue.html_url
      });
    } catch (error) {
      const structured = plannerService.toStructuredError(error);
      await reply.code(structured.statusCode).send(structured);
    }
  });
};
