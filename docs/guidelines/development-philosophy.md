# Development philosophy

This document captures the principles and guardrails that govern how code is written, reviewed, and shipped in this repository. It applies to human and AI contributors equally.

For operational rules (commands, file conventions, architecture constraints), see [AGENTS.md](../../AGENTS.md). This file covers the *why*; AGENTS.md covers the *how*.

## Core principles

1. **Deterministic infrastructure, observable AI.** Infrastructure (store, IO, diff, bundle, config) must work without AI. AI-driven features (planning, verification, audit) must be observable, overridable, and fail loudly. If removing AI breaks infrastructure, redesign it.

2. **Real usage beats synthetic success.** A feature is not done until it works in actual workflows. Do not report success without real command output. Do not say "should work."

3. **AI starts as advisory.** Promote to automation only after it is consistently correct, predictable, visible, and reversible. All AI outputs must have a user review gate.

4. **One system, one path, one owner.** Avoid dual implementations. Every piece of state, every workflow rule, and every validation check has exactly one canonical location.

5. **Add complexity only after repeated real pain.** Do not introduce abstractions, generic helpers, or future-facing extensibility unless they remove current duplication, restore clear ownership, or are required to make current behavior correct.

6. **If you cannot explain it in plain language, simplify it.** Any system, module, or workflow that resists a clear one-paragraph explanation is too complex for solo AI-driven development.

7. **Before every change, answer three questions.** What breaks? What gets more complex? What gets harder to debug? If you cannot answer all three, you do not understand the change well enough to make it.

8. **Past effort does not justify keeping bad structure.** Delete aggressively. Sunk cost is not a reason to preserve code, abstractions, or workflows that no longer serve the product.

9. **Prefer root-cause fixes over local patches.** If a bug has a structural cause, fix the structure. Do not hide symptoms with guard clauses.

10. **Optimize for maintainability six months from now, not convenience today.** Choose the smallest coherent scope that fully resolves the real problem and keeps the design durable.

## AI usage policy

- AI features are semi-autonomous with human-in-the-loop review gates.
- Plan reviews, audit findings, and verification results can all be overridden by the user with a stated reason.
- When AI is unavailable (no API key, provider down), the system must either provide a deterministic fallback or fail visibly. Silent degradation is not acceptable.
- Provider keys never leave the backend. The UI never calls provider APIs directly.

## Complexity budget

- A file that reaches 600 lines needs a refactor plan before more code is added.
- A function that exceeds 60 lines and handles multiple concerns needs to be split.
- A module that imports from more than 8 internal modules is coupling too broadly.
- If a fix requires more infrastructure than the feature itself, the problem is upstream. Stop and say so.

## Decision discipline

Before implementing any non-trivial change:

1. Read the shared type surface, ownership boundaries, and workflow contracts touched by the change.
2. Answer the three questions: what breaks, what gets more complex, what gets harder to debug?
3. If the root cause crosses a shared boundary, fix the boundary instead of patching downstream symptoms.
4. If you cannot determine whether a change is safe without an end-to-end run and you do not have that capability, stop and report.

## Agent guardrails

These rules apply to every AI coding agent working in this repository:

1. **Never claim anything you did not verify in this session.** Do not invent results.
2. **No new files, scripts, dependencies, branches, or GitHub issues without explicit approval.**
3. **No silent fallbacks.** If the system degrades, it must be observable -- log at warn level or surface a user-visible indicator.
4. **No swallowed exceptions.** Every error path must either surface to the caller, log with enough context to diagnose, or both. Use `// catch-ok: <reason>` only for truly intentional fire-and-forget patterns.
5. **Do not weaken, skip, or delete tests to get green without approval.**
6. **Scope verification to the changed surface by default.**
7. **Stop after three non-converging attempts in the same lane.** Report what you tried, what failed, and the likely root cause.
8. **If a fix requires more infrastructure than the feature itself, stop and say the problem is upstream.**
9. **Every substantive response ends with one recommended next action, not a menu.**
10. **Every completion report includes changed files, commands run, results, and remaining risk.**
