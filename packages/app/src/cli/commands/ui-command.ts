import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";
import { createSpecFlowServer } from "../../server/create-server.js";
import { openBrowser } from "../../server/open-browser.js";

interface UiCommandOptions {
  host: string;
  port: number;
  noOpen: boolean;
  legacyWeb: boolean;
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

  if (!options.legacyWeb) {
    const launched = await launchDesktop(rootDir, options.desktopBinary);
    if (launched) {
      return;
    }

    process.stderr.write(
      "SpecFlow desktop binary was not found. Falling back to the legacy Fastify + browser runtime.\n"
    );
  }

  const server = await createSpecFlowServer({
    rootDir,
    host: options.host,
    port: options.port
  });

  const url = await server.start();
  process.stdout.write(`SpecFlow UI running at ${url}\n`);

  if (!options.noOpen) {
    try {
      await openBrowser(url);
    } catch (error) {
      process.stderr.write(`Failed to open browser automatically: ${(error as Error).message}\n`);
    }
  }

  const shutdown = async (signal: string): Promise<void> => {
    process.stdout.write(`Received ${signal}, shutting down...\n`);
    await server.close();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
};
