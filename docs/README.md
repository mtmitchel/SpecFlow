# docs/

This directory holds SpecFlow planning and technical design artifacts.

## Current Docs Map

- Epic brief: [`designing-specflow/epic-brief.md`](designing-specflow/epic-brief.md)
- Core flows: [`designing-specflow/core-flows.md`](designing-specflow/core-flows.md)
- Tech plan: [`designing-specflow/tech-plan.md`](designing-specflow/tech-plan.md)
- Ticket artifact T1 (complete): [`designing-specflow/t1-repo-scaffold-cli-init.md`](designing-specflow/t1-repo-scaffold-cli-init.md)

## Implementation Status

SpecFlow is fully implemented. The repository includes a working app/client workspace:

- `packages/app`: Fastify backend, CLI commands (`ui`, `export-bundle`, `verify`), and all backend services (Planner, Verifier, Bundle Generator, Artifact Store, Drift Audit)
- `packages/client`: React UI for initiatives, tickets, runs, audits, specs, and settings

All four v1 workflows are functional: Groundwork, Milestone Run, Quick Build, and Drift Audit.

### Recent Improvements

**Verification quality**
- Verification criteria now include `severity` (Critical/Major/Minor/Outdated) and `remediationHint` fields.
- The verifier prompt instructs the LLM on evidence quality standards, partial-fulfillment reasoning, and how to generate actionable fix guidance.

**Audit quality**
- Drift audit uses LLM-powered analysis when an API key is configured, replacing the previous keyword-matching approach.
- Finding categories expanded to Bug/Performance/Security/Clarity with confidence scores.

**Planning quality**
- The planner scans the repo (`git ls-files` + key config files) before generating plans, grounding file targets in actual codebase structure.
- Plans include a Mermaid phase-dependency diagram rendered on the initiative detail page.

**Fix-forward loop**
- Failed verification enriches the re-export bundle with failure context and remediation hints.
- The ticket detail page shows a "Re-verify Now" button after a quick-fix bundle is exported.

**LLM streaming**
- The LLM client now streams real tokens via provider SSE APIs instead of simulating streaming after a full response.
- `max_tokens` is configurable per job type (8192 for plans, 4096 for verification).

**GitHub Issue import**
- `POST /api/import/github-issue` accepts a GitHub issue URL and feeds it through the triage pipeline.
- Requires `GITHUB_PERSONAL_ACCESS_TOKEN` or `GITHUB_TOKEN` in the environment.

**Ticket dependencies**
- `Ticket` now carries `blockedBy: string[]` and `blocks: string[]`.
- The planner wires inter-phase ticket dependencies automatically.
- Status transitions to `in-progress` are rejected (409) when unfinished blockers exist.

**Client reliability**
- Root error boundary catches rendering crashes and displays a recovery UI.
- Toast notifications surface API errors that were previously silent.
- Targeted state updates after mutations avoid full data reloads.

For run/setup instructions, use the root [`README.md`](../README.md).
For coding conventions and repo guidelines, see [`AGENTS.md`](../AGENTS.md).
