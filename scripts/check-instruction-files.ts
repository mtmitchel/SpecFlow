import { execFileSync } from "node:child_process";

// Instruction files that should trigger a sync reminder when changed.
const INSTRUCTION_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".github/copilot-instructions.md",
  ".cursor/rules/core.mdc",
  "docs/guidelines/development-philosophy.md",
];

let stagedFiles: string[];
try {
  const output = execFileSync("git", ["diff", "--cached", "--name-only"], {
    encoding: "utf8",
  });
  stagedFiles = output.trim().split("\n").filter(Boolean);
} catch {
  // Not in a git repo or git not available -- nothing to check
  process.exit(0);
}

const changedInstructionFiles = stagedFiles.filter((f) =>
  INSTRUCTION_FILES.includes(f),
);

if (changedInstructionFiles.length > 0) {
  process.stderr.write("Instruction file(s) changed:\n");
  for (const f of changedInstructionFiles) {
    process.stderr.write(`  ${f}\n`);
  }
  process.stderr.write(
    "\nReminder: verify adapter sync (CLAUDE.md sync marker, other adapters if present).\n",
  );
}

// Always exit 0 -- this is a nudge, not a gate.
process.exit(0);
