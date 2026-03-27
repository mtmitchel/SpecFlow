import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TEST_DIRS = [
  path.join(ROOT, "packages/app/test"),
  path.join(ROOT, "packages/client/src"),
];
const TEST_EXTENSIONS = new Set([".test.ts", ".test.tsx"]);

// Unconditional skip patterns. skipIf is intentionally excluded (conditional skips are legitimate).
const SKIP_PATTERNS = [
  /\btest\.skip\s*\(/,
  /\bit\.skip\s*\(/,
  /\bdescribe\.skip\s*\(/,
  /\bxit\s*\(/,
  /\bxdescribe\s*\(/,
  /\bxtest\s*\(/,
];

function isTestFile(filePath: string): boolean {
  return Array.from(TEST_EXTENSIONS).some((ext) => filePath.endsWith(ext));
}

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (entry === "node_modules" || entry === "dist") continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (isTestFile(full)) {
      results.push(full);
    }
  }
  return results;
}

const violations: string[] = [];

for (const dir of TEST_DIRS) {
  try {
    statSync(dir);
  } catch {
    continue;
  }
  for (const file of collectFiles(dir)) {
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of SKIP_PATTERNS) {
        if (pattern.test(line)) {
          const rel = path.relative(ROOT, file);
          violations.push(`${rel}:${i + 1} ${line.trim()}`);
        }
      }
    }
  }
}

if (violations.length > 0) {
  process.stderr.write("Unconditional test skips found:\n");
  for (const v of violations) {
    process.stderr.write(`  ${v}\n`);
  }
  process.stderr.write(
    "\nRemove test.skip / xit / xdescribe / xtest or convert to skipIf with a condition.\n",
  );
  process.exit(1);
} else {
  process.stdout.write("Test skip check passed.\n");
}
