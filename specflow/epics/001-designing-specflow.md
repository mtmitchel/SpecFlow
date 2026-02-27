# Epic: Designing SpecFlow - A Spec-Driven Development Orchestrator

---

# Epic Brief - SpecFlow

## Summary

SpecFlow is a local-first, board-first spec-driven development orchestrator for solo builders and small teams who use AI coding agents. It sits above agents like Claude Code, Codex CLI, and OpenCode - turning raw intent into structured specs, ordered task breakdowns, and agent-ready handoff bundles, then verifying that the agent's output actually matches the plan. The primary interface is a web board running on `localhost`; the CLI handles repo initialization, server control, verification, and bundle export. In v1, audit/review is initiated from contextual actions in the board (not via a separate CLI audit command). An internal LLM-powered Planner/Verifier drives clarification, spec generation, and outcome checking. All artifacts (specs, tickets, plans, decisions) live as Markdown/YAML/JSON files under a `specflow/` directory in the repo, making them git-friendly and human-readable without any cloud dependency.

## Context & Problem

**Who is affected:** Solo developers and small teams (2-5 people) who have adopted AI coding agents as their primary implementation tool but lack a structured layer above those agents to maintain coherence across a project.

**The core pain:** AI coding agents are powerful at writing code but have no memory of intent, no awareness of prior decisions, and no mechanism to check whether their output satisfies the original requirements. Without a plan-first layer, teams experience:

- **Drift** - agents implement plausible-but-wrong solutions because the spec was never written down or was lost in chat history.
- **Rework** - bugs and missing requirements are caught late, after the agent has already touched many files.
- **Context collapse** - each new agent session starts cold; conventions, decisions, and acceptance criteria must be re-explained every time.
- **No audit trail** - there is no record of what was planned, what the agent did, or whether the outcome matched the intent.

**Where the gap is:** Existing tools are either full project management suites (too heavy, not agent-aware) or raw agent CLIs (no planning layer, no verification). There is no lightweight, local, plan-first orchestrator that speaks the language of AI coding agents and closes the loop from intent to verified outcome.

## Goals for This Epic

- Ship a working local web board where a user can go from a raw idea to a verified, agent-executed change without leaving the tool.
- Prove the end-to-end loop: intent -> specs/tickets -> export bundle -> (manual agent run) -> capture results -> verify -> visible in board.
- Keep the tool local-only, file-based, and dependency-light so it works in any repo without accounts or infrastructure.

## v1 Success Criteria (Release Readiness)

- **Scenario coverage:** A user can complete all four workflows end-to-end at least once: Groundwork, Milestone Run, Quick Build, and Drift Audit (board-context action path).
- **Quality bar:** Verification outputs are consistent and auditable: acceptance-criteria pass/fail is explicit, drift flags are visible, manual override-to-Done uses a two-step confirmation (reason + explicit risk acceptance), and these actions are persisted in run history.
- **Resilience bar:** Verification works with git diff when available, and also works without git via user-selected folder/file snapshot scope.
- **Usability bar:** First-run setup is low-friction: users can initialize a repo and reach a usable board quickly, with clear next actions and no hidden setup blockers. Quick Task remains fast for small work and auto-converts oversized requests into draft initiatives to preserve flow quality.

## Non-Goals (v1)

- No cloud sync or multi-tenant features.
- No automatic subprocess invocation of agents (export-only bundles in v1).
- No replacement for a full project management suite.

