const WRAPPING_QUOTES_PATTERN = /^["“”'`]+|["“”'`]+$/g;
const WORD_PATTERN = /[A-Za-z0-9]+(?:[/-][A-Za-z0-9]+)*/g;

const TITLE_SPECIAL_CASES = new Map<string, string>([
  ["ai", "AI"],
  ["api", "API"],
  ["claude", "Claude"],
  ["cli", "CLI"],
  ["codex", "Codex"],
  ["fedora", "Fedora"],
  ["github", "GitHub"],
  ["gpt", "GPT"],
  ["gtk", "GTK"],
  ["ios", "iOS"],
  ["json", "JSON"],
  ["linux", "Linux"],
  ["llm", "LLM"],
  ["macos", "macOS"],
  ["openai", "OpenAI"],
  ["opencode", "OpenCode"],
  ["prd", "PRD"],
  ["pwa", "PWA"],
  ["react", "React"],
  ["rust", "Rust"],
  ["sf", "SF"],
  ["sql", "SQL"],
  ["tauri", "Tauri"],
  ["ui", "UI"],
  ["ux", "UX"],
  ["vite", "Vite"],
  ["windows", "Windows"],
  ["yaml", "YAML"],
]);

const TITLE_LEADIN_WORDS = new Set([
  "a",
  "an",
  "and",
  "build",
  "building",
  "create",
  "creating",
  "fast",
  "for",
  "i",
  "lightweight",
  "make",
  "making",
  "modern",
  "need",
  "new",
  "offline-first",
  "secure",
  "ship",
  "shipping",
  "simple",
  "the",
  "to",
  "we",
  "want",
  "with",
]);

const GENERIC_PRODUCT_WORDS = new Set([
  "app",
  "application",
  "platform",
  "product",
  "project",
  "software",
  "solution",
  "system",
  "tool",
  "workspace",
]);

const TITLE_TRAILING_PUNCTUATION_PATTERN = /[.!?]+$/;

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeWhitespace = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

const stripWrappingQuotes = (value: string): string =>
  value.replace(WRAPPING_QUOTES_PATTERN, "").trim();

const stripTrailingPunctuation = (value: string): string =>
  value.replace(TITLE_TRAILING_PUNCTUATION_PATTERN, "").trim();

const countWords = (value: string): number =>
  (normalizeWhitespace(stripWrappingQuotes(value)).match(WORD_PATTERN) ?? []).length;

const applySpecialCases = (value: string): string => {
  let normalized = value;

  for (const [lowercase, styled] of TITLE_SPECIAL_CASES.entries()) {
    normalized = normalized.replace(
      new RegExp(`\\b${escapeRegExp(lowercase)}\\b`, "gi"),
      styled,
    );
  }

  return normalized;
};

const capitalizeSentenceStarts = (value: string): string =>
  value.replace(/(^|:\s+|\/)([a-z])/g, (_, prefix: string, character: string) => `${prefix}${character.toUpperCase()}`);

const normalizeRawTitle = (value: string): string =>
  stripTrailingPunctuation(stripWrappingQuotes(normalizeWhitespace(value)));

export const validateNoAmpersands = (value: string, kind: string): void => {
  if (value.includes("&")) {
    throw new Error(`${kind} must not use ampersands. Write "and" instead.`);
  }
};

export const toSentenceCaseLabel = (value: string): string => {
  const normalized = normalizeRawTitle(value);
  if (!normalized) {
    return normalized;
  }

  return capitalizeSentenceStarts(applySpecialCases(normalized.toLowerCase()));
};

export const normalizeInitiativeTitle = (value: string): string =>
  toSentenceCaseLabel(value);

export const normalizePhaseName = (value: string): string =>
  toSentenceCaseLabel(value);

export const normalizeTicketTitle = (value: string): string =>
  toSentenceCaseLabel(value);

interface TitleConstraints {
  kind: string;
  maxChars: number;
  minWords?: number;
  maxWords?: number;
}

const validateStyledTitle = (value: string, constraints: TitleConstraints): void => {
  const normalized = normalizeRawTitle(value);
  if (!normalized) {
    throw new Error(`${constraints.kind} must not be empty`);
  }

  validateNoAmpersands(normalized, constraints.kind);

  if (normalized.length > constraints.maxChars) {
    throw new Error(
      `${constraints.kind} must be ${constraints.maxChars} characters or fewer`,
    );
  }

  const wordCount = countWords(normalized);
  if (typeof constraints.minWords === "number" && wordCount < constraints.minWords) {
    throw new Error(
      `${constraints.kind} must be at least ${constraints.minWords} words`,
    );
  }

  if (typeof constraints.maxWords === "number" && wordCount > constraints.maxWords) {
    throw new Error(
      `${constraints.kind} must be ${constraints.maxWords} words or fewer`,
    );
  }

  const canonical = toSentenceCaseLabel(normalized);
  if (normalized !== canonical) {
    throw new Error(
      `${constraints.kind} must use sentence case. Use "${canonical}" instead of "${normalized}".`,
    );
  }
};

export const validateInitiativeTitle = (value: string): void => {
  validateStyledTitle(value, {
    kind: "Project title",
    minWords: 2,
    maxWords: 3,
    maxChars: 32,
  });
};

export const validatePhaseName = (value: string): void => {
  validateStyledTitle(value, {
    kind: "Phase name",
    minWords: 1,
    maxWords: 4,
    maxChars: 36,
  });
};

export const validateTicketTitle = (value: string): void => {
  validateStyledTitle(value, {
    kind: "Ticket title",
    minWords: 2,
    maxWords: 6,
    maxChars: 56,
  });
};

export const validateMarkdownHeadingsSentenceCase = (markdown: string): void => {
  const headings = Array.from(markdown.matchAll(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm));

  for (const match of headings) {
    const heading = stripWrappingQuotes(match[1] ?? "").trim();
    if (!heading) {
      continue;
    }

    const canonical = toSentenceCaseLabel(heading);
    if (heading !== canonical) {
      throw new Error(
        `Markdown heading "${heading}" must use sentence case. Use "${canonical}" instead.`,
      );
    }
  }
};

export const validateMarkdownNoAmpersands = (markdown: string): void => {
  const lines = markdown.split(/\r?\n/);
  let inCodeFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) {
      continue;
    }

    const withoutInlineCode = line.replace(/`[^`]*`/g, "");
    if (withoutInlineCode.includes("&")) {
      throw new Error(`Markdown must not use ampersands. Write "and" instead. Offending line: ${line.trim()}`);
    }
  }
};

export const deriveInitiativeTitle = (description: string): string => {
  const compact = normalizeWhitespace(description);
  if (!compact) {
    return "Untitled project";
  }

  const withoutLeadIn = compact.replace(
    /^(?:i|we)\s+(?:want|need)\s+to\s+(?:build|create|make|ship)\s+|^(?:build|create|make|ship)\s+/i,
    "",
  );

  const splitMarkers = [". ", "? ", "! ", " that's ", " that ", " which ", " in terms of ", " inspired by "];
  const firstMarkerIndex = splitMarkers
    .map((marker) => withoutLeadIn.toLowerCase().indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  const rawTitle = (firstMarkerIndex === undefined ? withoutLeadIn : withoutLeadIn.slice(0, firstMarkerIndex))
    .replace(/^(?:a|an|the)\s+/i, "")
    .trim();

  const titleWords = (rawTitle.match(WORD_PATTERN) ?? []).map((token) => token.toLowerCase());
  const filteredWords = titleWords.filter((token) => !TITLE_LEADIN_WORDS.has(token));
  const contentWords =
    filteredWords.filter((token) => !GENERIC_PRODUCT_WORDS.has(token)).length >= 2
      ? filteredWords.filter((token) => !GENERIC_PRODUCT_WORDS.has(token))
      : filteredWords;
  const conciseWords = (contentWords.length > 0 ? contentWords : titleWords).slice(0, 3);
  const fallback = conciseWords.length > 0 ? conciseWords.join(" ") : "Untitled project";

  return normalizeInitiativeTitle(fallback);
};
