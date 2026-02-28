import { mkdir } from "node:fs/promises";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { specflowDir } from "../../io/paths.js";

export const isReloadablePath = (filePath: string): boolean =>
  [".yaml", ".yml", ".md", ".json"].includes(path.extname(filePath));

export const createSpecflowWatcher = async (
  rootDir: string,
  onReloadableChange: () => void
): Promise<FSWatcher> => {
  const root = specflowDir(rootDir);
  await mkdir(root, { recursive: true });

  const watcher = chokidar.watch(root, {
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

    onReloadableChange();
  });

  await new Promise<void>((resolve) => {
    watcher.once("ready", () => resolve());
  });

  return watcher;
};
