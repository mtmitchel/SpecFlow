import { mkdir } from "node:fs/promises";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { specflowDir } from "../../io/paths.js";

export interface SpecflowWatcher {
  close: () => Promise<void>;
  destroy: () => void;
  suppress: () => void;
  resume: () => void;
}

export const isReloadablePath = (filePath: string): boolean =>
  [".yaml", ".yml", ".md", ".json"].includes(path.extname(filePath));

export const createSpecflowWatcher = async (
  rootDir: string,
  onReload: () => Promise<void>
): Promise<SpecflowWatcher> => {
  const root = specflowDir(rootDir);
  await mkdir(root, { recursive: true });

  let reloadTimer: ReturnType<typeof setTimeout> | null = null;
  let reloadInFlight: Promise<void> | null = null;
  let suppressed = false;
  let pendingDuringSuppression = false;

  const scheduleReload = (): void => {
    if (suppressed) {
      pendingDuringSuppression = true;
      return;
    }

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
    awaitWriteFinish: {
      stabilityThreshold: 120,
      pollInterval: 50
    }
  });

  watcher.on("all", (_eventName, changedPath) => {
    if (!isReloadablePath(changedPath)) {
      return;
    }

    scheduleReload();
  });

  await new Promise<void>((resolve) => {
    watcher.once("ready", () => resolve());
  });

  return {
    close: () => watcher.close(),
    destroy: () => {
      if (reloadTimer) {
        clearTimeout(reloadTimer);
        reloadTimer = null;
      }
    },
    suppress: () => {
      suppressed = true;
      pendingDuringSuppression = false;
    },
    resume: () => {
      suppressed = false;
      if (pendingDuringSuppression) {
        pendingDuringSuppression = false;
        scheduleReload();
      }
    }
  };
};
