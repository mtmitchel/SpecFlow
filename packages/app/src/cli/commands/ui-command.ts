import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

interface UiCommandOptions {
  desktopBinary?: string;
}

const canExecute = async (candidate: string): Promise<boolean> => {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
};

const resolveDesktopBinary = async (rootDir: string, explicit?: string): Promise<string | null> => {
  const envOverride = process.env.SPECFLOW_DESKTOP_BINARY;
  const candidates = [
    explicit,
    envOverride,
    path.join(rootDir, "packages", "tauri", "src-tauri", "target", "release", "specflow-tauri"),
    path.join(rootDir, "packages", "tauri", "src-tauri", "target", "release", "SpecFlow"),
    path.join(rootDir, "packages", "tauri", "src-tauri", "target", "release", "specflow-tauri.exe")
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (await canExecute(candidate)) {
      return candidate;
    }
  }

  return null;
};

const launchDesktop = async (rootDir: string, explicit?: string): Promise<boolean> => {
  const binary = await resolveDesktopBinary(rootDir, explicit);
  if (!binary) {
    return false;
  }

  const child = spawn(binary, {
    cwd: rootDir,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      SPECFLOW_ROOT_DIR: rootDir
    }
  });
  child.unref();
  process.stdout.write(`SpecFlow desktop launched from ${binary}\n`);
  return true;
};

export const runUiCommand = async (options: UiCommandOptions): Promise<void> => {
  const rootDir = process.cwd();
  const launched = await launchDesktop(rootDir, options.desktopBinary);
  if (launched) {
    return;
  }

  throw new Error(
    "SpecFlow desktop binary was not found. " +
    "Run the desktop app through `npm run tauri dev` or build it with `npm run package:desktop`."
  );
};
