# Prompt 4: Product Value & Spec Quality Review

You are reviewing the current repository checkout for SpecFlow.

## What this app is

SpecFlow is a local-first desktop-first tool for a **solo non-developer who uses AI coding agents** (Claude Code, Codex CLI, etc.) to build software. The user is not a programmer by trade -- they are a "vibe coder" who describes what they want and hands structured prompts to AI agents.

The tool's value proposition is: **turn a vague idea into structured planning artifacts, break those into ordered tickets, generate agent-ready prompt bundles, then verify the agent's output against acceptance criteria.**

The four workflows are:
1. **Groundwork** -- describe idea -> required brief intake for fresh initiatives -> AI creates Brief / Core flows / PRD / Tech spec with targeted blocker questions only when needed -> AI runs review gates and cross-checks -> AI generates phased ticket plan
2. **Milestone Run** -- export ticket as agent prompt -> user runs agent -> capture results -> AI verifies against criteria -> pass/fail with remediation hints
3. **Quick Build** -- single-task shortcut (describe -> AI triages -> ticket -> export -> verify)
4. **Drift Audit** -- point at a diff, AI categorizes findings (bug/security/performance/etc.)

## Key files to read

- `docs/product-brief.md` -- problem statement, goals, success criteria
- `docs/workflows.md` -- all four workflows step by step
- `packages/app/src/planner/prompt-builder.ts` -- the actual LLM prompts that generate blocker questions, artifacts, reviews, traces, and plans
- `packages/app/src/planner/planner-service.ts` -- orchestration of planner jobs
- `packages/app/src/planner/planning-reviews.ts` -- required review gates and cross-check ownership
- `packages/app/src/planner/workflow-state.ts` -- phase progression, refinement state, and stale invalidation
- `packages/app/src/verify/internal/prompt.ts` -- the verifier prompt that checks agent output
- `packages/client/src/app/views/initiative-creator.tsx` -- the UI flow for creating an initiative
- `packages/client/src/app/views/ticket-view.tsx` -- the export/capture/verify UI
- `packages/client/src/app/views/initiative-view.tsx` -- initiative detail page
- `packages/client/src/app/layout/command-palette.tsx` -- Cmd+K quick actions
- `packages/client/src/app/views/overview-panel.tsx` -- what the user sees on first load

## The user persona (critical context)

This user:
- Is NOT a developer. They cannot read stack traces, debug TypeScript errors, or evaluate code quality by reading source.
- Relies entirely on AI agents to write code. Their skill is describing what they want clearly.
- Their biggest failure mode is **giving agents vague or incomplete instructions**, leading to agents building the wrong thing or missing requirements.
- They need SpecFlow to be the "thinking partner" that forces rigor before the agent runs -- not after.
- They have no team. There is no code review, no QA, no PM. SpecFlow is their entire quality assurance layer.
- They may have 3-5 projects going. Context switching between projects means they forget decisions made last week.

## The planner prompts (inline -- this is the brain of the product)

### Phase-check prompt (decides whether the next artifact can be created now)

```
System: You are SpecFlow's planner service. Use the AGENTS.md policy context below as hard constraints. Do not include markdown code fences.

Respond ONLY as JSON:
{
  "decision": "proceed|ask",
  "questions": [
    {
      "id": "string",
      "label": "string",
      "whyThisBlocks": "string",
      "affectedArtifact": "brief|core-flows|prd|tech-spec",
      "decisionType": "scope|user|workflow|platform|data|security|integration|success-metric",
      "type": "text|select|multi-select|boolean",
      "assumptionIfUnanswered": "string",
      "options": ["string"],
      "optionHelp": { "option": "one sentence explanation" },
      "recommendedOption": "string|null"
    }
  ],
  "assumptions": ["string"]
}

AGENTS.md:
(repo conventions file)

User: Decide whether SpecFlow can create the next artifact now or must ask targeted blocker questions first.

Rules:
- Fresh initiatives must start with a required brief intake before the first brief is generated.
- After that first intake, default to "proceed".
- Ask questions only when missing information would materially change the current artifact and would be costly to unwind later.
- Use finite options whenever reasonable.
- If you can proceed, return explicit assumptions.
```

### Artifact generation prompt (used for Brief, Core flows, PRD, and Tech spec)

```
System: (same as above, with artifact generation JSON contract)

Respond ONLY as JSON:
{
  "markdown": "string",
  "traceOutline": {
    "sections": [
      { "key": "string", "label": "string", "items": ["string"] }
    ]
  }
}

User: Generate the {artifact} markdown document for this initiative.

Rules:
- Return polished markdown plus a structured traceOutline.
- The traceOutline must only include facts grounded in the markdown you generated.
- Use saved refinement context and accepted assumptions.

Initiative description:
{user's description}

Saved refinement context:
{JSON of saved answers}

Assumptions:
{JSON of accepted/default assumptions}

Brief/Core flows/PRD/Tech spec:
{upstream artifacts as applicable}
```

### Review prompt (reviews one artifact or cross-checks adjacent artifacts)

```
System: (same as above, with review JSON contract)

Respond ONLY as JSON:
{
  "summary": "string",
  "blockers": ["string"],
  "warnings": ["string"],
  "traceabilityGaps": ["string"],
  "assumptions": ["string"],
  "recommendedFixes": ["string"]
}

User: Review this initiative artifact set for {review kind}.

Rules:
- Identify only material blockers and meaningful warnings.
- Use traceabilityGaps for missing or inconsistent links between artifacts.
- Use assumptions for important implicit decisions the team should make explicit.
- Use recommendedFixes for concrete next actions.
- Do not restate the entire artifact.

Artifacts:
{brief/core flows/prd/tech spec as applicable}

Trace outlines:
{structured fact outlines when available}
```

### Plan generation prompt (generates phased ticket breakdown)

```
System: (same as above, with plan JSON contract)

User: Generate an ordered phase plan and ticket breakdown. The textual phase/ticket structure is canonical. Use the repository file tree to generate accurate fileTargets -- only reference paths that exist in the repo.

Initiative description:
{description}

Brief:
{brief markdown}

Core flows:
{core flows markdown}

PRD:
{prd markdown}

Tech Spec:
{tech spec markdown}

Repository context (use this to generate accurate file paths -- only reference files that exist):
Total tracked files: {count}
File tree:
{git ls-files output}

Key config files:
{config summaries}
```

### Triage prompt (decides if a Quick Task is focused enough)

```
System: (same as above, with triage JSON contract)

User: Assess whether the task is focused enough for Quick Build or should become a larger initiative.

Task description:
{user's description}
```

## Analyze the following specifically

**You are not reviewing code quality. You are reviewing whether this product delivers maximum value for a solo non-developer vibe coder.**

### 1. Blocker-question quality
The phase-check step is the single most important filter in the planning flow -- it determines whether the user gets a fast first draft or unnecessary interrogation. Read the phase-check prompt. Is it likely to ask only the questions that materially improve the next artifact? Or will it still generate generic discovery questions that do not help a non-developer think more rigorously? What specific prompt engineering improvements would produce sharper, more useful blocker questions?

### 2. Spec-to-ticket fidelity
The planning set (Brief/Core flows/PRD/Tech spec) is generated, reviewed, then the ticket plan is generated from it. But does the plan prompt actually enforce that every important requirement and flow is covered by tickets? Or could the LLM silently drop requirements during plan generation? Is there any mechanism to detect coverage gaps -- requirements or user flows mentioned in the planning artifacts but not covered by ticket acceptance criteria?

### 3. Acceptance criteria quality
Each ticket gets acceptance criteria that the verifier later checks against. Look at the plan prompt output contract -- acceptance criteria are just `string[]`. Are these likely to be specific and testable, or vague and un-verifiable? What would make the LLM produce criteria that a verifier can meaningfully evaluate against a code diff?

### 4. The handoff gap
After export, the user manually runs an agent. The bundle is a markdown file. Read the bundle generation code (`packages/app/src/bundle/`) to understand what the agent actually receives. Is the bundle structured in a way that an AI agent will follow? Does it include the acceptance criteria prominently? Does it tell the agent what "done" looks like? Or does it bury the requirements in context that agents tend to ignore?

### 5. Verification realism
The verifier checks a code diff against acceptance criteria. But the user is a non-developer -- they cannot evaluate whether the verifier's pass/fail is correct. How much should the user trust the verifier? What are the failure modes? (False passes where the code looks related but doesn't actually satisfy the criterion? False fails on trivially correct code?) Read `packages/app/src/verify/internal/prompt.ts` to assess the verifier prompt quality.

### 6. Decision memory
The product brief mentions "context collapse" as a core problem. But where are decisions stored? If the user decides "use SQLite, not Postgres" during a blocker-question phase, does that decision persist into later artifacts, reviews, and future ticket bundles for the same initiative? Or is it lost after one artifact is generated? Trace how saved refinement answers, assumptions, reviews, and trace outlines flow through the system.

### 7. Onboarding & first experience
The user arrives at the board for the first time. Read `overview-panel.tsx`. Does the empty state guide them effectively? Is the Cmd+K palette discoverable enough for a non-technical user? Is the Groundwork flow self-explanatory, or does it assume the user already knows what "Brief", "Core flows", "PRD", and "Tech spec" mean?

### 8. Error recovery for non-developers
When an LLM call fails (rate limit, timeout, bad response), what does the user see? Do they get actionable guidance, or a raw error message? When verification fails, are the remediation hints written for a developer or for someone who will hand them to an agent? Read the verifier prompt to check the remediation hint instructions.

### 9. Missing workflows
Given the persona (solo non-dev, multiple projects, AI agents), are there workflows that would deliver significant value but don't exist? Think about: iteration (user wants to change a spec after seeing agent output), project switching (user comes back after a week), learning from past runs (what worked, what didn't), review/risk acknowledgement, and template reuse.

### 10. Honest assessment
Rate the current product on a 1-10 scale for the target persona across these dimensions:
- **Clarity of guidance** -- does the tool help the user think more clearly?
- **Spec quality output** -- do the generated specs actually help agents produce better code?
- **Verification trustworthiness** -- can the user rely on pass/fail?
- **Friction** -- how many steps to go from idea to verified code?
- **Decision persistence** -- are decisions and context preserved across sessions?

## Output format

For each section, provide:
- **Current state**: what the product does today (be specific, reference actual code/prompts)
- **Gap**: what's missing or weak (be specific, not "could be better")
- **Impact**: how this affects the target persona's outcomes (be concrete)
- **Suggested improvement**: a specific change (to prompts, UI flow, data model, or workflow) -- not "consider adding" but "change X to Y because Z"

Do not pad with compliments. The goal is to find the gaps that reduce value delivery. Be direct about what's weak.
