# Repository layout

## `packages/app`

```text
src/
  bundle/           bundle generation and agent-specific renderers
    internal/       helpers: agents-md, context-files, manifest, operations, snapshot
  cli/              Commander.js entry point and command modules (ui, export-bundle, verify)
    commands/
  config/           env key resolution
  io/               file I/O: agents-md (secure loader), atomic-write, paths, yaml
  llm/              LLM provider client, error types, SSE stream parser
  planner/          spec + plan generation service, workflow contract, execution gates
    internal/       helpers: context, error-shaping, plan-job, review-job, spec-artifacts, ticket-factory, validators
  runtime/          transport-agnostic runtime factory, handler layer, shared sidecar contract
    handlers/       one file per domain: runtime, providers, initiatives, tickets, runs, audit, operations, import
  audit/            drift audit logic (findings, report-store, types)
  validation.ts     security validators
  sidecar/          sidecar JSON-RPC dispatcher and runtime helpers
  store/            in-memory artifact store with staged commits
    internal/       helpers: artifact-writer, cleanup, fs-utils, loaders, operations, planning-artifact-validation, recovery, reload, spec-utils, watcher
    types.ts        PreparedOperationArtifacts interface (shared between store and operations)
  types/            core entity types (Initiative, Ticket, Run, Config, etc.)
  verify/           verification and diff engine
    diff/           git-strategy, snapshot-strategy, patch-utils, path-utils, types
    internal/       helpers: agents-md, config, criteria, operations, prompt
```

## `packages/client`

```text
src/
  api/              one module per domain: artifacts, audit, http, import, initiatives, runs, settings, tickets, transport
  styles/           modular CSS entrypoint + concern-based stylesheets (base, navigator, workspace, shared-ui, feedback/settings, command-palette, entry-flows, planning-shell, pipeline, planning-intake, planning-reviews, overview, ticket-execution, run-report)
  app/
    components/     shared UI: audit-panel, checkpoint-gate-banner, diff-viewer, markdown-view, model-combobox, phase-transition-banner, pipeline, workflow-section
    constants/      status-columns (status transition rules, canTransition helper)
    context/        toast (error notification context and useToast hook)
    hooks/          use-capture-preview, use-dirty-form, use-export-workflow, use-tree-navigation, use-verification-stream
    layout/         workspace-shell, icon-rail, navigator, navigator-tree, command-palette (+ palette-search-mode, palette-quick-task-mode, palette-github-import-mode), settings-modal
    utils/          initiative-progress, phase-warning, scope-paths, specs
    views/          detail-workspace, overview-panel, initiative-view, initiative-route-view, initiative-creator, initiative-handoff-view, spec-view, ticket-view, run-view
      initiative/   planning workspace sections, review cards, shared state/controller hook
      ticket/       export-section, capture-verify-section, verification-results-section, override-panel
  api.ts            consolidated re-export of all API modules
  App.tsx           root component, ArtifactsSnapshot state, refreshArtifacts callback
  types.ts          all client-facing types including AgentTarget, Config, ConfigSavePayload
```

## `packages/tauri`

```text
src-tauri/
  src/              Rust bridge, sidecar lifecycle, pending request registry, Tauri commands
  capabilities/     Tauri capability declarations
  icons/            desktop app icons
  tauri.conf.json   packaged desktop config
  tauri.dev.conf.json
                   dev-only overlay that disables packaged-sidecar requirements
```
