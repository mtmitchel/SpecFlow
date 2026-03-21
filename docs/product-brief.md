# Product Brief - SpecFlow

## Summary

SpecFlow is a local-first, desktop-first spec-driven development orchestrator for solo builders and small teams who use AI coding agents. It sits above agents like Claude Code, Codex CLI, and OpenCode -- turning raw intent into structured planning artifacts, ordered task breakdowns, and agent-ready handoff bundles, then verifying that the agent's output actually matches the plan.

The primary interface is a desktop workspace built with Tauri and backed by a persistent Node sidecar. The CLI launches the desktop workspace, exports bundles, verifies results, and backs up the local store. An internal LLM-powered Planner/Verifier drives progressive artifact generation, targeted blocker questions, secondary planning reviews, and outcome checking. All artifacts (specs, tickets, plans, decisions, review results) live as Markdown/YAML files under a `specflow/` directory in the repo, making them git-friendly and human-readable without any cloud dependency.

## Problem

**Who is affected:** Solo developers and small teams (2-5 people) who have adopted AI coding agents as their primary implementation tool but lack a structured layer above those agents to maintain coherence across a project.

**The core pain:** AI coding agents are powerful at writing code but have no memory of intent, no awareness of prior decisions, and no mechanism to check whether their output satisfies the original requirements. Without a plan-first layer, teams experience:

- **Drift** -- agents implement plausible-but-wrong solutions because the spec was never written down or was lost in chat history.
- **Rework** -- bugs and missing requirements are caught late, after the agent has already touched many files.
- **Context collapse** -- each new agent session starts cold; conventions, decisions, and acceptance criteria must be re-explained every time.
- **No audit trail** -- there is no record of what was planned, what the agent did, or whether the outcome matched the intent.

**Where the gap is:** Existing tools are either full project management suites (too heavy, not agent-aware) or raw agent CLIs (no planning layer, no verification). There is no lightweight, local, plan-first orchestrator that speaks the language of AI coding agents and closes the loop from intent to verified outcome.

## Goals

- A working local desktop workspace where a user can go from a raw idea to a verified, agent-executed change without leaving the tool.
- The end-to-end loop: intent -> Brief -> Core flows -> PRD -> Tech spec -> tickets -> export bundle -> (manual agent run) -> capture results -> verify -> visible in board.
- Groundwork should catch meaningful planning gaps before ticket generation, not after implementation has started.
- Local-only, file-based, dependency-light -- works in any repo without accounts or infrastructure, and should not require an HTTP port during normal desktop use.

## Success Criteria

- A user can complete all four workflows end-to-end: Groundwork, Milestone Run, Quick Build, and Drift Audit.
- Groundwork produces a coherent Brief, Core flows, PRD, and Tech spec set, and surfaces review blockers before tickets are created.
- Verification outputs are consistent and auditable: acceptance-criteria pass/fail is explicit with severity and remediation hints, drift flags are visible, manual override-to-Done uses a two-step confirmation (reason + explicit risk acceptance), and actions are persisted in run history.
- Verification works with git diff when available, and also works without git via user-selected folder/file snapshot scope.
- First-run setup is low-friction: users can initialize a repo and reach a usable board quickly, with clear next actions and no hidden setup blockers.

## Non-Goals

- No cloud sync or multi-tenant features.
- No automatic subprocess invocation of agents (export-only bundles).
- No replacement for a full project management suite.
