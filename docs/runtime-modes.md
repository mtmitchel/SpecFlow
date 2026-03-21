# Runtime Modes - SpecFlow

SpecFlow now has one supported app runtime:

- `desktop-first`: the active development and normal usage path

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
4. Waits for a fresh settled backend build under `packages/app/dist` before spawning the desktop sidecar

Notes:

- `npm run dev` is an alias for `npm run tauri dev`
- `npm run tauri:dev` is a second alias for the same desktop-oriented dev flow
- Development uses `packages/tauri/src-tauri/tauri.dev.conf.json`
- The dev config disables `bundle.externalBin`, so desktop development does not require `packages/app/dist-sidecar/*`
- The Tauri shell spawns the Node sidecar from `packages/app/dist/sidecar.js` after the watcher has produced a fresh settled build
- The Rust bridge fingerprints the latest backend `dist/**/*.js` output in dev mode and hot-swaps to a fresh sidecar generation before the next request is dispatched after a rebuild
- The dev stack runs under `concurrently --raw` so closing the desktop window tears down the watched processes without the old spinner-heavy shutdown output that made the terminal look stuck

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

`specflow ui` runs the CLI from source and looks for an existing packaged desktop binary to launch. If no desktop binary is available, it fails closed instead of switching runtimes under the same command.

Important:

- `npm run ui` prefers an existing packaged desktop binary over the current source tree.
- If you have changed sidecar JSON-RPC methods or desktop transport behavior in source, use `npm run tauri dev` or rebuild the desktop app first.
- Otherwise you can end up with a newer UI talking to an older packaged sidecar, which surfaces as unsupported sidecar-method errors.

## CLI Behavior

The CLI remains available alongside the desktop runtime:

```bash
tsx packages/app/src/cli.ts export-bundle --ticket <ticket-id> --agent codex-cli
tsx packages/app/src/cli.ts verify --ticket <ticket-id>
```

Rules:

- `export-bundle` and `verify` remain headless CLI commands
- They execute locally in-process against the same store, bundle, and verifier services that the sidecar uses
- `--operation-id` still controls idempotent staged run operations across repeated local invocations

## Transport Summary

- React -> Tauri bridge -> Node sidecar
- The runtime uses the same planner, verifier, bundle, store, config, and import logic in `packages/app`

## Local release hardening

Before shipping a local desktop build, run:

```bash
npm ci
npm run check
npm test
cargo check --manifest-path packages/tauri/src-tauri/Cargo.toml --locked
cargo test --manifest-path packages/tauri/src-tauri/Cargo.toml --locked
npm run -w @specflow/tauri build -- --locked
```

Current release posture:

- desktop builds are unsigned
- there is no built-in updater configured
- lockfiles are required for local release validation

For deeper implementation details, continue with [`architecture.md`](architecture.md).
