const formatBullets = (title: string, items: readonly string[]): string =>
  [title, ...items.map((item) => `- ${item}`)].join("\n");

const PRODUCT_DESIGN_CHARTER_RULES = [
  "Treat information architecture and product design as first-class requirements, not polish or follow-up work.",
  "Ground decisions in the user's or operator's job to be done, the information they need, the decisions they must make, and the system feedback that keeps them confident.",
  "Preserve clear primary paths, progressive disclosure, coherent information hierarchy, and explicit empty, loading, error, recovery, and destructive states when they materially affect the experience."
] as const;

const TITLE_STYLE_RULES = [
  "Use sentence case for project names, phase names, ticket titles, and markdown headings.",
  "Sentence case means: capitalize the first word, proper nouns, approved acronyms, and the first word after a colon. Lowercase the rest.",
  'Examples: "Local notes", "Project setup", "Import GitHub issues", and "PRD review: Failure paths". Avoid "Local Notes", "Project Setup", and "Import Github Issues".',
  'Do not use ampersands anywhere in generated names, headings, or body copy. Write "and" instead.',
  "Project names must be 2 to 3 words and no more than 32 characters.",
  "Phase names must be 1 to 4 words and no more than 36 characters.",
  "Ticket titles must be 2 to 6 words and no more than 56 characters.",
  "Do not end names or headings with a period."
] as const;

const ENGINEERING_FOUNDATIONS_RULES = [
  "Treat package boundaries, shared type ownership, runtime-mode boundaries, file-size limits, and folder conventions as implementation constraints that must stay correct throughout delivery.",
  "Treat secret handling, canonical input validation helpers, sanitization, least-privilege desktop capabilities, and on-device data boundaries as day-one requirements, not later hardening.",
  "Treat atomic writes, staged commits, idempotent operations, concurrent mutation handling, interrupted-write recovery, and corrupted-data handling as part of the core design.",
  "Treat cancellation, payload-size awareness, file I/O cost, streaming behavior, and hot-path performance as ongoing implementation concerns, not cleanup work for later.",
  "Treat test coverage, deterministic test strategy, CI gates, duplicate-UI prevention, and release readiness as part of done.",
  "Treat design tokens, shared interaction states, motion policy, copy rules, observability, safe diagnostics, docs accuracy, and dependency policy as first-class constraints for every affected change."
] as const;

export const PLANNER_PRODUCT_DESIGN_CHARTER_SECTION = formatBullets(
  "Product design charter:",
  PRODUCT_DESIGN_CHARTER_RULES
);

export const PLANNER_ENGINEERING_FOUNDATIONS_SECTION = formatBullets(
  "Continuous engineering foundations:",
  ENGINEERING_FOUNDATIONS_RULES
);

export const PLANNER_REVIEW_PRODUCT_DESIGN_SECTION = formatBullets(
  "Product design review lens:",
  [
    "Flag missing or incoherent information architecture, workflow clarity, progressive disclosure, system feedback, or edge-state handling when it would weaken the shipped product.",
    "During ticket-coverage review, call out when the plan omits necessary design or information-architecture work implied by the artifact set."
  ]
);

export const TICKET_PLAN_PRODUCT_DESIGN_SECTION = formatBullets(
  "Product design and information architecture rules:",
  [
    "Treat product design and information architecture as first-class requirements in the ticket plan, not polish or follow-up work.",
    "If the artifact set implies a user-facing, operator-facing, or workflow-facing surface, create tickets that cover the structure, navigation, feedback, and state handling needed to make that experience coherent.",
    "Do not hide information architecture, workflow clarity, system feedback, empty/loading/error states, or primary-versus-secondary action design inside vague implementation tickets or omit them because they are cross-cutting."
  ]
);

export const PLANNER_TITLE_STYLE_SECTION = formatBullets(
  "Title and heading style rules:",
  TITLE_STYLE_RULES
);

export const BUNDLE_PRODUCT_DESIGN_SECTION = formatBullets(
  "Product design guardrails:",
  [
    "Treat information architecture and product design as part of the task, not optional polish.",
    "Keep the primary workflow obvious with clear primary versus secondary actions and progressive disclosure where it affects comprehension.",
    "Handle navigation, information hierarchy, statuses, and empty/loading/error, recovery, or destructive states intentionally when the ticket affects them."
  ]
);

export const BUNDLE_ENGINEERING_FOUNDATIONS_SECTION = formatBullets(
  "Continuous engineering guardrails:",
  [
    "Keep architecture boundaries, shared types, validation helpers, staged writes, and recovery rules correct while implementing the ticket.",
    "Preserve security, privacy, observability, testing, design-system, docs, and dependency constraints throughout the change, not only at the end.",
    "Treat AGENTS.md plus the covered engineering foundation items below as hard constraints for the entire task."
  ]
);
