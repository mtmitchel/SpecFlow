import { execFileSync } from "node:child_process";

// Detect new dependency additions in staged package.json files.
// Flags new entries in dependencies/devDependencies (not version bumps).
// Exit 1 if new dependencies found -- hard block per policy.

const PACKAGE_JSON_PATHS = [
  "package.json",
  "packages/app/package.json",
  "packages/client/package.json",
  "packages/tauri/package.json",
];
const DEP_FIELDS = ["dependencies", "devDependencies"];

let stagedFiles: string[];
try {
  const output = execFileSync("git", ["diff", "--cached", "--name-only"], {
    encoding: "utf8",
  });
  stagedFiles = output.trim().split("\n").filter(Boolean);
} catch {
  // Not in a git repo or git not available
  process.exit(0);
}

const changedPackageJsons = stagedFiles.filter((f) =>
  PACKAGE_JSON_PATHS.includes(f),
);

if (changedPackageJsons.length === 0) {
  process.exit(0);
}

interface DepMap {
  [key: string]: string;
}

function getDeps(content: string): Map<string, DepMap> {
  const result = new Map<string, DepMap>();
  try {
    const pkg = JSON.parse(content);
    for (const field of DEP_FIELDS) {
      if (pkg[field] && typeof pkg[field] === "object") {
        result.set(field, pkg[field] as DepMap);
      }
    }
  } catch {
    // Malformed JSON -- skip
  }
  return result;
}

function gitShow(ref: string): string {
  return execFileSync("git", ["show", ref], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

const newDeps: string[] = [];

for (const pkgPath of changedPackageJsons) {
  // Get the HEAD version of the file
  let headContent: string;
  try {
    headContent = gitShow(`HEAD:${pkgPath}`);
  } catch {
    // File is new (not in HEAD) -- all deps are new
    headContent = "{}";
  }

  // Get the staged version
  let stagedContent: string;
  try {
    stagedContent = gitShow(`:${pkgPath}`);
  } catch {
    continue;
  }

  const headDeps = getDeps(headContent);
  const stagedDeps = getDeps(stagedContent);

  for (const field of DEP_FIELDS) {
    const oldDeps = headDeps.get(field) || {};
    const newDepsMap = stagedDeps.get(field) || {};

    for (const name of Object.keys(newDepsMap)) {
      if (!(name in oldDeps)) {
        newDeps.push(`${pkgPath} [${field}]: ${name}@${newDepsMap[name]}`);
      }
    }
  }
}

if (newDeps.length > 0) {
  process.stderr.write("New dependencies detected (requires explicit approval):\n");
  for (const d of newDeps) {
    process.stderr.write(`  ${d}\n`);
  }
  process.stderr.write(
    "\nIf approved, rerun commit. If not approved, remove the dependency.\n",
  );
  process.exit(1);
} else {
  process.exit(0);
}
