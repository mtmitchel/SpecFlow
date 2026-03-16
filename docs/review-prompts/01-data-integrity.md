# Prompt 1: Data Integrity & Concurrency Review

You have access to the repository at https://github.com/mtmitchel/SpecFlow (main branch, commit 6dfc3ae).

You are reviewing the data layer of a Node.js application called SpecFlow. It uses flat YAML/JSON files on disk instead of a database. All data is loaded into in-memory Maps at startup and written through atomically.

The critical invariant is the **staged commit model**: long operations (export bundle, verification) write to a temp directory first, then "commit" by copying to the final location and updating the run pointer. A single in-process write lock (`Map<string, string>`) prevents concurrent operations on the same run.

## Key files to read from the repo

- `packages/app/src/store/artifact-store.ts` -- the main store class
- `packages/app/src/store/internal/operations.ts` -- staged commit logic
- `packages/app/src/store/internal/recovery.ts` -- startup recovery
- `packages/app/src/store/internal/watcher.ts` -- chokidar file watcher with debounced reload
- `packages/app/src/store/internal/artifact-writer.ts` -- writes staged artifacts
- `packages/app/src/store/errors.ts` -- error types
- `packages/app/src/store/types.ts` -- PreparedOperationArtifacts interface
- `packages/app/src/io/atomic-write.ts` -- atomic file write implementation
- `packages/app/src/io/paths.ts` -- all filesystem path constructors

## Critical code (inline for reference)

### operations.ts -- staged commit

```typescript
export const prepareRunOperation = async (
  store: OperationStoreContext,
  input: PrepareRunOperationInput
): Promise<OperationManifest> => {
  await store.ensureRunWritable(input.runId, input.operationId);

  const run = store.runs.get(input.runId);
  if (!run) {
    throw new NotFoundError(`Run ${input.runId} not found`);
  }

  store.writeLocks.set(input.runId, input.operationId);

  try {
    const operationRoot = operationManifestPath(store.rootDir, input.runId, input.operationId);
    const stagedAttemptDir = operationAttemptDir(store.rootDir, input.runId, input.operationId, input.attemptId);

    await mkdir(stagedAttemptDir, { recursive: true });
    await store.writePreparedArtifacts(stagedAttemptDir, input.artifacts);

    const nowIso = store.now().toISOString();
    const manifest: OperationManifest = {
      operationId: input.operationId,
      runId: input.runId,
      targetAttemptId: input.attemptId,
      state: "prepared",
      leaseExpiresAt: new Date(store.now().getTime() + input.leaseMs).toISOString(),
      validation: {
        passed: input.validation?.passed ?? true,
        details: input.validation?.details
      },
      preparedAt: nowIso,
      updatedAt: nowIso
    };

    await mkdir(path.dirname(operationRoot), { recursive: true });
    await writeYamlFile(operationRoot, manifest);

    const updatedRun: Run = {
      ...run,
      activeOperationId: input.operationId,
      operationLeaseExpiresAt: manifest.leaseExpiresAt
    };

    await store.upsertRun(updatedRun);
    await store.reloadFromDisk();

    return manifest;
  } finally {
    store.writeLocks.delete(input.runId);
  }
};

export const commitRunOperation = async (
  store: OperationStoreContext,
  input: CommitRunOperationInput
): Promise<Run> => {
  await store.ensureRunWritable(input.runId, input.operationId);

  const run = store.runs.get(input.runId);
  if (!run) {
    throw new NotFoundError(`Run ${input.runId} not found`);
  }

  if (run.activeOperationId !== input.operationId) {
    throw new RetryableConflictError(
      `Run ${input.runId} is locked by operation ${run.activeOperationId ?? "none"}`
    );
  }

  store.writeLocks.set(input.runId, input.operationId);

  try {
    const manifestPath = operationManifestPath(store.rootDir, input.runId, input.operationId);
    const manifest = await readYamlFile<OperationManifest>(manifestPath);

    if (!manifest) {
      throw new NotFoundError(`Operation manifest missing for ${input.operationId}`);
    }

    if (manifest.state === "committed") {
      return run;
    }

    if (store.isLeaseExpired(manifest.leaseExpiresAt)) {
      await store.markOperationState(input.runId, input.operationId, "abandoned");
      await store.clearRunOperationPointer(input.runId);
      throw new RetryableConflictError(`Operation ${input.operationId} lease expired before commit`);
    }

    const stagedAttempt = operationAttemptDir(store.rootDir, input.runId, input.operationId, manifest.targetAttemptId);
    const committedAttempt = attemptDir(store.rootDir, input.runId, manifest.targetAttemptId);

    await rm(committedAttempt, { recursive: true, force: true });
    await mkdir(path.dirname(committedAttempt), { recursive: true });
    await cp(stagedAttempt, committedAttempt, { recursive: true });

    const nowIso = store.now().toISOString();
    const updatedManifest: OperationManifest = {
      ...manifest,
      state: "committed",
      updatedAt: nowIso,
      committedAt: nowIso
    };
    await writeYamlFile(manifestPath, updatedManifest);

    const updatedRun: Run = {
      ...run,
      attempts: store.uniquePush(run.attempts, manifest.targetAttemptId),
      committedAttemptId: manifest.targetAttemptId,
      activeOperationId: null,
      operationLeaseExpiresAt: null,
      lastCommittedAt: nowIso,
      status: "complete"
    };
    await store.upsertRun(updatedRun);
    await store.reloadFromDisk();

    const committedRun = store.runs.get(input.runId);
    if (!committedRun) {
      throw new NotFoundError(`Run ${input.runId} disappeared after commit`);
    }

    return committedRun;
  } finally {
    store.writeLocks.delete(input.runId);
  }
};
```

### recovery.ts

```typescript
export const recoverOrphanOperations = async (store: RecoveryStoreContext): Promise<void> => {
  for (const run of store.runs.values()) {
    if (!run.activeOperationId) {
      continue;
    }

    const opId = run.activeOperationId;
    const opDir = operationDir(store.rootDir, run.id, opId);
    const hasTmp = await pathExists(opDir);

    if (!hasTmp) {
      await store.markOperationState(run.id, opId, "failed");
      await store.clearRunOperationPointer(run.id);
      continue;
    }

    const committedAttemptExists =
      run.committedAttemptId !== null &&
      (await pathExists(attemptDir(store.rootDir, run.id, run.committedAttemptId)));

    if (committedAttemptExists) {
      await store.markOperationState(run.id, opId, "superseded");
      await store.clearRunOperationPointer(run.id);
      continue;
    }

    await store.markOperationState(run.id, opId, "abandoned");
    await store.clearRunOperationPointer(run.id);
  }
};
```

### watcher.ts -- debounced reload

```typescript
export const createSpecflowWatcher = async (
  rootDir: string,
  onReload: () => Promise<void>
): Promise<SpecflowWatcher> => {
  const root = specflowDir(rootDir);
  await mkdir(root, { recursive: true });

  let reloadTimer: ReturnType<typeof setTimeout> | null = null;
  let reloadInFlight: Promise<void> | null = null;

  const scheduleReload = (): void => {
    if (reloadTimer) {
      clearTimeout(reloadTimer);
    }
    reloadTimer = setTimeout(() => {
      void queueReload();
    }, 150);
  };

  const queueReload = async (): Promise<void> => {
    if (reloadInFlight) {
      await reloadInFlight;
      return;
    }
    reloadInFlight = onReload().finally(() => {
      reloadInFlight = null;
    });
    await reloadInFlight;
  };

  const watcher: FSWatcher = chokidar.watch(root, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 50 }
  });

  watcher.on("all", (_eventName, changedPath) => {
    if (!isReloadablePath(changedPath)) return;
    scheduleReload();
  });

  await new Promise<void>((resolve) => { watcher.once("ready", () => resolve()); });

  return {
    close: () => watcher.close(),
    destroy: () => { if (reloadTimer) { clearTimeout(reloadTimer); reloadTimer = null; } }
  };
};
```

## Context

- This is a single-user local dev tool, but multiple CLI invocations can hit the server concurrently (e.g., user runs `specflow verify` in one terminal while the UI is open).
- The write lock is in-process only -- there is no filesystem lock.
- chokidar watches `specflow/` and triggers `reloadFromDisk()` on changes.
- `reloadFromDisk()` **clears ALL in-memory maps** and reloads from disk.
- `ArtifactStore.startWatcher()` passes `() => this.reloadFromDisk()` as the `onReload` callback to the watcher.

## Analyze the following specifically

1. **Race conditions**: Can `reloadFromDisk()` fire mid-commit and clear in-memory state that `commitRunOperation` depends on? Trace the exact sequence. What happens if the watcher fires between the `cp()` and the `upsertRun()` in `commitRunOperation`?

2. **Data loss scenarios**: If the process crashes between `cp(staged, committed)` and `writeYamlFile(manifestPath, updatedManifest)`, what state is the system in on restart? Does recovery handle this? Trace `recovery.ts` against this exact scenario.

3. **Lock gaps**: The `writeLock` is set inside `prepareRunOperation` and `commitRunOperation` but released in the `finally` block. Is there a window between prepare returning and commit being called where another operation could interleave? What protects against this?

4. **Debounce interaction**: The watcher debounces at 150ms. If a commit writes 5 files sequentially (`cp` + `manifestPath` + `runYaml`), could the watcher trigger a reload after the first write but before the last? What would the in-memory state look like?

5. **Recovery completeness**: Are there any crash points in `operations.ts` that `recovery.ts` does NOT handle? Enumerate crash points (between each `await`) and map each to a recovery path.

6. **reloadFromDisk atomicity**: `reloadFromDisk()` calls `.clear()` on all maps then does `Promise.all([loadInitiatives, loadTickets, loadRuns, loadDecisions])`. If an API request reads from the store between `.clear()` and load completion, what does it see? Is there a window where the store appears empty to concurrent readers?

## Output format

For each issue found, classify as:
- **CRITICAL**: data loss or corruption possible
- **HIGH**: inconsistent state that requires manual intervention
- **MEDIUM**: temporary inconsistency that self-heals on next reload
- **LOW**: theoretical concern unlikely in practice

Do not give generic advice. Only report issues you can trace through the actual code paths shown above. For each issue, show the exact sequence of events (with line references) that triggers it.
