import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function fileContent(relativePath: string): string | null {
  try {
    return readFileSync(path.join(ROOT, relativePath), "utf8");
  } catch {
    return null;
  }
}

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").substring(0, 12);
}

function extractSyncHash(content: string): string | null {
  const match = content.match(/<!--\s*sync:\s*AGENTS\.md\s*@\s*(\S+)\s*-->/);
  return match ? match[1] : null;
}

// Adapter files that should track AGENTS.md via sync markers.
// Each entry: [file path, display name]
const ADAPTERS: [string, string][] = [
  ["CLAUDE.md", "CLAUDE.md"],
  ["GEMINI.md", "GEMINI.md"],
  [".github/copilot-instructions.md", ".github/copilot-instructions.md"],
  [".cursor/rules/core.mdc", ".cursor/rules/core.mdc"],
];

const agentsMd = fileContent("AGENTS.md");
if (!agentsMd) {
  process.stderr.write("AGENTS.md not found. Cannot check adapter drift.\n");
  process.exit(1);
}

const currentHash = contentHash(agentsMd);
const stale: string[] = [];

for (const [filePath, displayName] of ADAPTERS) {
  const content = fileContent(filePath);
  if (!content) continue; // Adapter does not exist yet -- skip

  const syncHash = extractSyncHash(content);
  if (!syncHash) {
    stale.push(`${displayName}: no sync marker found`);
    continue;
  }
  if (syncHash === "PENDING") {
    stale.push(`${displayName}: sync marker is PENDING (never synced)`);
    continue;
  }
  if (syncHash !== currentHash) {
    stale.push(
      `${displayName}: sync marker ${syncHash} does not match current AGENTS.md ${currentHash}`,
    );
  }
}

if (stale.length > 0) {
  process.stderr.write("Adapter drift detected:\n");
  for (const s of stale) {
    process.stderr.write(`  ${s}\n`);
  }
  process.stderr.write(
    `\nUpdate the sync marker in each stale adapter to: <!-- sync: AGENTS.md @ ${currentHash} -->\n`,
  );
  process.exit(1);
} else {
  process.stdout.write("Adapter drift check passed.\n");
}
