# Runtime Modes - SpecFlow

SpecFlow now has two runtime modes:

- `desktop-first`: the active development and normal usage path
- `legacy web`: the retained fallback path for compatibility and browser-based testing

Related docs:

- For setup and command entry points, see [`../README.md`](../README.md)
- For transport, sidecar, CLI, and store architecture, see [`architecture.md`](architecture.md)
- For user-visible workflow behavior, see [`workflows.md`](workflows.md)

## Desktop Development

Use this for day-to-day development:

```bash
npm run tauri dev
```

What it does:

1. Starts the `@specflow/app` TypeScript watcher
2. Starts the Vite client dev server on `http://127.0.0.1:5173`
3. Launches `tauri dev`
4. Waits for the first watched `packages/app/dist/sidecar.js` output before spawning the desktop sidecar

Notes:

- `npm run dev` is an alias for `npm run tauri dev`
- `npm run tauri:dev` is a second alias for the same desktop-oriented dev flow
- Development uses `packages/tauri/src-tauri/tauri.dev.conf.json`
- The dev config disables `bundle.externalBin`, so desktop development does not require `packages/app/dist-sidecar/*`
- The Tauri shell spawns the Node sidecar from `packages/app/dist/sidecar.js` after the watcher has produced it

## Desktop Packaging

Use this when you need a native desktop bundle:

```bash
npm run package:desktop
```

What it does:

1. Builds `@specflow/client`
2. Builds `@specflow/app`
3. Packages the Node sidecar into `packages/app/dist-sidecar/specflow-sidecar-$TARGET`
4. Runs `tauri build`

Build output:

- Tauri artifacts are emitted under `packages/tauri/src-tauri/target/`
- Native bundles are unsigned in this migration

Desktop packaging is explicit. It is not part of normal development, and it is not required to use `npm run tauri dev`.

## Desktop Launch

For a local launch outside the Tauri dev loop:

```bash
npm run ui
```

`specflow ui` runs the CLI from source. It looks for an existing packaged desktop binary and launches it. If no desktop binary is available, it falls back to legacy web mode with a deprecation warning.

## Legacy Web Mode

Use this only when you explicitly need the old Fastify + browser runtime:

```bash
npm run dev:web
npm run ui:web
```

Behavior:

- `npm run dev:web` starts the watched app server plus the Vite dev server
- `npm run ui:web` runs the legacy Fastify + browser runtime from source without an upfront package build
- Legacy web mode still uses `/api` HTTP routes and SSE
- This mode is retained for fallback behavior, compatibility, and browser-focused testing

## CLI Behavior

The CLI remains available in both runtime modes:

```bash
tsx packages/app/src/cli.ts export-bundle --ticket <ticket-id> --agent codex-cli
tsx packages/app/src/cli.ts verify --ticket <ticket-id>
```

Rules:

- `export-bundle` and `verify` remain headless CLI commands
- They preserve the prefer-server delegation model when a compatible Fastify runtime is already running
- If no compatible server is reachable, they execute locally in-process

## Transport Summary

- Desktop mode: React -> Tauri bridge -> Node sidecar
- Legacy web mode: React -> Fastify HTTP/SSE -> shared runtime handlers
- Both modes use the same planner, verifier, bundle, store, config, and import logic in `packages/app`

For deeper implementation details, continue with [`architecture.md`](architecture.md).
