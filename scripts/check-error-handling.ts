import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_DIRS = [
  path.join(ROOT, "packages/app/src"),
  path.join(ROOT, "packages/client/src"),
];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const CATCH_OK_MARKER = "catch-ok:";

// Patterns for swallowed promise catches: .catch(() => undefined), .catch(() => null), .catch(() => {})
const PROMISE_CATCH_PATTERNS = [
  /\.catch\(\s*\(\)\s*=>\s*undefined\s*\)/,
  /\.catch\(\s*\(\)\s*=>\s*null\s*\)/,
  /\.catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/,
  /\.catch\(\s*\(_[^)]*\)\s*=>\s*undefined\s*\)/,
  /\.catch\(\s*\(_[^)]*\)\s*=>\s*null\s*\)/,
  /\.catch\(\s*\(_[^)]*\)\s*=>\s*\{\s*\}\s*\)/,
];

// Patterns for bare catch blocks that return nothing useful
// Matches: catch { return null; }, catch { return undefined; }, catch { return ""; }, catch { }
const BARE_CATCH_PATTERNS = [
  /catch\s*(?:\([^)]*\))?\s*\{\s*\n?\s*return\s+null\s*;?\s*\n?\s*\}/,
  /catch\s*(?:\([^)]*\))?\s*\{\s*\n?\s*return\s+undefined\s*;?\s*\n?\s*\}/,
  /catch\s*(?:\([^)]*\))?\s*\{\s*\n?\s*return\s+""\s*;?\s*\n?\s*\}/,
];

function isSourceFile(filePath: string): boolean {
  return Array.from(SOURCE_EXTENSIONS).some((ext) => filePath.endsWith(ext));
}

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (entry === "node_modules" || entry === "dist") continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (isSourceFile(full)) {
      results.push(full);
    }
  }
  return results;
}

function hasAnnotation(lines: string[], lineIndex: number): boolean {
  // Check the same line and the line before for catch-ok annotation
  const currentLine = lines[lineIndex] || "";
  if (currentLine.includes(CATCH_OK_MARKER)) return true;
  if (lineIndex > 0) {
    const prevLine = lines[lineIndex - 1] || "";
    if (prevLine.includes(CATCH_OK_MARKER)) return true;
  }
  return false;
}

interface Violation {
  file: string;
  line: number;
  text: string;
}

const violations: Violation[] = [];

for (const dir of SOURCE_DIRS) {
  try {
    statSync(dir);
  } catch {
    continue;
  }
  for (const file of collectFiles(dir)) {
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    const rel = path.relative(ROOT, file);

    // Check single-line promise catch patterns
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (hasAnnotation(lines, i)) continue;
      for (const pattern of PROMISE_CATCH_PATTERNS) {
        if (pattern.test(line)) {
          violations.push({ file: rel, line: i + 1, text: line.trim() });
          break;
        }
      }
    }

    // Check multi-line bare catch blocks
    for (const pattern of BARE_CATCH_PATTERNS) {
      let match: RegExpExecArray | null;
      const multilinePattern = new RegExp(pattern.source, "gm");
      while ((match = multilinePattern.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split("\n").length;
        if (hasAnnotation(lines, lineNum - 1)) continue;
        const snippet = match[0].replace(/\n\s*/g, " ").trim();
        violations.push({ file: rel, line: lineNum, text: snippet });
      }
    }
  }
}

if (violations.length > 0) {
  process.stderr.write("Swallowed exceptions or silent fallbacks found:\n");
  for (const v of violations) {
    process.stderr.write(`  ${v.file}:${v.line} ${v.text}\n`);
  }
  process.stderr.write(
    `\n${violations.length} finding(s). Fix each by logging the error or add '// catch-ok: <reason>' if intentional.\n`,
  );
  process.exit(1);
} else {
  process.stdout.write("Error handling check passed.\n");
}
