# docs/

This directory holds SpecFlow planning and technical design artifacts.

## Current Docs Map

- Epic brief: [`designing-specflow/epic-brief.md`](designing-specflow/epic-brief.md)
- Core flows: [`designing-specflow/core-flows.md`](designing-specflow/core-flows.md)
- Tech plan (updated for implemented runtime/config handling): [`designing-specflow/tech-plan.md`](designing-specflow/tech-plan.md)
- Ticket artifact T1: [`designing-specflow/t1-repo-scaffold-cli-init.md`](designing-specflow/t1-repo-scaffold-cli-init.md)

## Implementation Notes

SpecFlow is no longer docs-only. The repository now includes a working app/client workspace:

- `packages/app`: Fastify backend, CLI commands (`ui`, `export-bundle`, `verify`)
- `packages/client`: React UI for initiatives, tickets, runs, audits, specs, and settings

For run/setup instructions, use the root [`README.md`](../README.md).
