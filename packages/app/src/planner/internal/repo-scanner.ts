import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const CONFIG_CANDIDATES = [
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "setup.py",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
  "Makefile",
  "composer.json",
  "requirements.txt",
  ".python-version",
  ".nvmrc",
  ".node-version"
];

const MAX_FILE_LINES = 50;
const MAX_TREE_ENTRIES = 300;

const readConfigFile = async (rootDir: string, filename: string): Promise<string | null> => {
  try {
    const text = await readFile(path.join(rootDir, filename), "utf8");
    const lines = text.split("\n");
    const truncated = lines.length > MAX_FILE_LINES ? lines.slice(0, MAX_FILE_LINES) : lines;
    return truncated.join("\n") + (lines.length > MAX_FILE_LINES ? "\n...(truncated)" : "");
  } catch { // catch-ok: config file absence is expected and non-critical
    return null;
  }
};

const buildDirectoryTree = (files: string[]): string => {
  const dirs = new Map<string, number>();

  for (const file of files) {
    const parts = file.split("/");
    for (let depth = 1; depth < parts.length; depth++) {
      const dir = parts.slice(0, depth).join("/");
      dirs.set(dir, (dirs.get(dir) ?? 0) + 1);
    }
  }

  const topLevel = files
    .filter((f) => !f.includes("/"))
    .map((f) => `  ${f}`)
    .join("\n");

  const dirEntries = Array.from(dirs.entries())
    .filter(([dir]) => !dir.includes("/"))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dir, count]) => `  ${dir}/  (${count} files)`);

  const deepEntries: string[] = [];
  for (const [dir, count] of dirs.entries()) {
    if (dir.split("/").length === 2) {
      deepEntries.push(`    ${dir}/  (${count} files)`);
    }
  }

  return [topLevel, ...dirEntries, ...deepEntries].slice(0, MAX_TREE_ENTRIES).join("\n");
};

export interface RepoContext {
  fileTree: string;
  totalFiles: number;
  configSummary: string;
}

export const scanRepo = async (rootDir: string): Promise<RepoContext> => {
  let files: string[] = [];

  try {
    const { stdout } = await execAsync("git ls-files", {
      cwd: rootDir,
      timeout: 8000
    });
    files = stdout
      .trim()
      .split("\n")
      .filter((f) => f.trim().length > 0);
  } catch {
    // Not a git repo or git unavailable — skip file tree
  }

  const fileTree = files.length > 0 ? buildDirectoryTree(files) : "(git ls-files unavailable)";

  const configParts: string[] = [];
  for (const candidate of CONFIG_CANDIDATES) {
    const content = await readConfigFile(rootDir, candidate);
    if (content) {
      configParts.push(`--- ${candidate} ---\n${content}`);
    }
  }

  return {
    fileTree,
    totalFiles: files.length,
    configSummary: configParts.join("\n\n") || "(no config files found)"
  };
};
