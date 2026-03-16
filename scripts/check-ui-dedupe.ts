import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const TARGET_DIRECTORIES = [
  path.join(ROOT, "packages/client/src"),
  path.join(ROOT, "packages/app/src/planner"),
];
const TARGET_FILE_EXTENSIONS = new Set([".ts", ".tsx"]);
const INTERACTIVE_TAGS = new Set(["button", "summary", "h1", "h2", "h3", "h4", "h5", "h6", "label", "span", "p"]);
const LABEL_PROPERTY_NAMES = new Set([
  "label",
  "title",
  "actionLabel",
  "primaryActionLabel",
  "detailsOpenLabel",
  "detailsCloseLabel",
  "overrideActionLabel",
  "cancelOverrideLabel",
  "overrideConfirmLabel",
]);
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "before",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "this",
  "to",
  "with",
  "when",
]);

interface Violation {
  file: string;
  line: number;
  message: string;
}

interface RenderCopyEntry {
  component: string;
  file: string;
  kind: "text" | "expr";
  line: number;
  sourceText: string;
  normalized: string;
}

const walk = (dir: string): string[] => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    if (TARGET_FILE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
};

const normalizeToken = (token: string): string => {
  if (token === "answer" || token === "answers" || token === "question" || token === "questions" || token === "input" || token === "inputs") {
    return "input";
  }

  if (token === "change" || token === "update" || token === "refresh") {
    return "change";
  }

  if (token === "view" || token === "open") {
    return "open";
  }

  if (token === "issue" || token === "issues" || token === "gap" || token === "gaps") {
    return "issue";
  }

  return token.endsWith("s") && token.length > 3 ? token.slice(0, -1) : token;
};

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token))
    .map(normalizeToken)
    .join(" ");

const getSimilarity = (left: string, right: string): number => {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  const union = new Set([...leftTokens, ...rightTokens]);
  const intersectionSize = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return union.size === 0 ? 0 : intersectionSize / union.size;
};

const getLine = (sourceFile: ts.SourceFile, position: number): number =>
  sourceFile.getLineAndCharacterOfPosition(position).line + 1;

const getPropertyName = (node: ts.ObjectLiteralElementLike): string | null => {
  if (!ts.isPropertyAssignment(node) && !ts.isShorthandPropertyAssignment(node)) {
    return null;
  }

  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) {
    return node.name.text;
  }

  return null;
};

const getStringLiteral = (expression: ts.Expression): string | null => {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text.trim();
  }

  return null;
};

const getJsxTagName = (node: ts.JsxOpeningLikeElement): string | null => {
  if (ts.isIdentifier(node.tagName)) {
    return node.tagName.text;
  }

  return null;
};

const getNearestComponentName = (node: ts.Node): string => {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) {
      return current.name.text;
    }

    if (
      ts.isVariableDeclaration(current) &&
      ts.isIdentifier(current.name) &&
      current.initializer &&
      (ts.isArrowFunction(current.initializer) || ts.isFunctionExpression(current.initializer))
    ) {
      return current.name.text;
    }

    current = current.parent;
  }

  return "(module)";
};

const collectDirectText = (node: ts.JsxElement | ts.JsxSelfClosingElement, sourceFile: ts.SourceFile): string | null => {
  const tagName = ts.isJsxElement(node) ? getJsxTagName(node.openingElement) : getJsxTagName(node);
  if (!tagName || !INTERACTIVE_TAGS.has(tagName) || ts.isJsxSelfClosingElement(node)) {
    return null;
  }

  const parts: string[] = [];
  for (const child of node.children) {
    if (ts.isJsxText(child)) {
      const text = child.getText(sourceFile).replace(/\s+/g, " ").trim();
      if (text) {
        parts.push(text);
      }
      continue;
    }

    if (ts.isJsxExpression(child) && child.expression) {
      if (ts.isStringLiteral(child.expression) || ts.isNoSubstitutionTemplateLiteral(child.expression)) {
        const text = child.expression.text.replace(/\s+/g, " ").trim();
        if (text) {
          parts.push(text);
        }
      }
    }
  }

  return parts.length > 0 ? parts.join(" ") : null;
};

const violations: Violation[] = [];

for (const directory of TARGET_DIRECTORIES) {
  if (!statSync(directory).isDirectory()) {
    continue;
  }

  for (const file of walk(directory)) {
    const sourceText = readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const renderCopyEntries: RenderCopyEntry[] = [];

    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAssignment(node)) {
        const propertyName = getPropertyName(node);
        if (propertyName === "options" && ts.isArrayLiteralExpression(node.initializer)) {
          const optionEntries = node.initializer.elements
            .map((element) =>
              ts.isStringLiteral(element) || ts.isNoSubstitutionTemplateLiteral(element)
                ? {
                    text: element.text.trim(),
                    normalized: normalizeText(element.text),
                    line: getLine(sourceFile, element.getStart(sourceFile)),
                  }
                : null
            )
            .filter((entry): entry is { text: string; normalized: string; line: number } => Boolean(entry));

          for (let index = 0; index < optionEntries.length; index += 1) {
            for (let otherIndex = index + 1; otherIndex < optionEntries.length; otherIndex += 1) {
              if (optionEntries[index].normalized.length === 0 || optionEntries[otherIndex].normalized.length === 0) {
                continue;
              }

              if (optionEntries[index].normalized === optionEntries[otherIndex].normalized) {
                violations.push({
                  file,
                  line: optionEntries[otherIndex].line,
                  message: `Duplicate option label "${optionEntries[otherIndex].text}" in the same choice set.`,
                });
              }
            }
          }
        }

        if (LABEL_PROPERTY_NAMES.has(propertyName ?? "") && ts.isArrayLiteralExpression(node.parent.parent)) {
          // handled by array literal pass below
        }
      }

      if (ts.isArrayLiteralExpression(node)) {
        const labelEntries = node.elements
          .map((element) => {
            if (!ts.isObjectLiteralExpression(element)) {
              return null;
            }

            const labelProperty = element.properties.find(
              (property) => ts.isPropertyAssignment(property) && getPropertyName(property) === "label"
            );
            if (!labelProperty || !ts.isPropertyAssignment(labelProperty)) {
              return null;
            }

            const text = getStringLiteral(labelProperty.initializer);
            if (!text) {
              return null;
            }

            return {
              text,
              normalized: normalizeText(text),
              line: getLine(sourceFile, labelProperty.getStart(sourceFile)),
            };
          })
          .filter((entry): entry is { text: string; normalized: string; line: number } => Boolean(entry));

        if (labelEntries.length > 1) {
          for (let index = 0; index < labelEntries.length; index += 1) {
            for (let otherIndex = index + 1; otherIndex < labelEntries.length; otherIndex += 1) {
              const left = labelEntries[index];
              const right = labelEntries[otherIndex];
              if (!left.normalized || !right.normalized) {
                continue;
              }

              if (left.normalized === right.normalized || getSimilarity(left.normalized, right.normalized) >= 0.75) {
                violations.push({
                  file,
                  line: right.line,
                  message: `Near-duplicate action labels "${left.text}" and "${right.text}" in the same control group.`,
                });
              }
            }
          }
        }
      }

      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const directText = collectDirectText(node, sourceFile);
        if (directText) {
          renderCopyEntries.push({
            component: getNearestComponentName(node),
            file,
            kind: "text",
            line: getLine(sourceFile, node.getStart(sourceFile)),
            sourceText: directText,
            normalized: normalizeText(directText),
          });
        }
      }

      if (ts.isJsxExpression(node) && node.expression) {
        const parentTag =
          ts.isJsxElement(node.parent?.parent) ? getJsxTagName(node.parent.parent.openingElement) :
          ts.isJsxSelfClosingElement(node.parent?.parent) ? getJsxTagName(node.parent.parent) :
          null;

        if (parentTag && INTERACTIVE_TAGS.has(parentTag) && !ts.isStringLiteral(node.expression) && !ts.isNoSubstitutionTemplateLiteral(node.expression)) {
          const expressionText = node.expression.getText(sourceFile).trim();
          if (expressionText) {
            renderCopyEntries.push({
              component: getNearestComponentName(node),
              file,
              kind: "expr",
              line: getLine(sourceFile, node.getStart(sourceFile)),
              sourceText: expressionText,
              normalized: expressionText,
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    for (let index = 0; index < renderCopyEntries.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < renderCopyEntries.length; otherIndex += 1) {
        const left = renderCopyEntries[index];
        const right = renderCopyEntries[otherIndex];
        if (left.component !== right.component || Math.abs(left.line - right.line) > 40) {
          continue;
        }

        if (!left.normalized || !right.normalized) {
          continue;
        }

        if (
          left.kind === "text" &&
          right.kind === "text" &&
          (left.normalized.split(" ").length < 2 || right.normalized.split(" ").length < 2)
        ) {
          continue;
        }

        if (left.normalized === right.normalized) {
          violations.push({
            file,
            line: right.line,
            message: `Duplicate UI copy or expression "${right.sourceText}" rendered near line ${left.line}.`,
          });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error("UI dedupe check failed:");
  for (const violation of violations) {
    console.error(`- ${path.relative(ROOT, violation.file)}:${violation.line} ${violation.message}`);
  }
  process.exit(1);
}

console.log("UI dedupe check passed.");
