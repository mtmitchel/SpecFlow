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
  ["openrouter", "OpenRouter"],
  ["prd", "PRD"],
  ["pwa", "PWA"],
  ["react", "React"],
  ["rust", "Rust"],
  ["sql", "SQL"],
  ["tauri", "Tauri"],
  ["ui", "UI"],
  ["ux", "UX"],
  ["vite", "Vite"]
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
  "with"
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
  "workspace"
]);

const WORD_PATTERN = /[A-Za-z0-9]+(?:[/-][A-Za-z0-9]+)*/g;
const WRAPPING_QUOTES_PATTERN = /^["“”'`]+|["“”'`]+$/g;
const TRAILING_PUNCTUATION_PATTERN = /[.!?]+$/;

const normalizeWhitespace = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

const stripWrappingQuotes = (value: string): string =>
  value.replace(WRAPPING_QUOTES_PATTERN, "").trim();

const stripTrailingPunctuation = (value: string): string =>
  value.replace(TRAILING_PUNCTUATION_PATTERN, "").trim();

const stripTrailingEllipsis = (value: string): string =>
  value.replace(/\.\.\.$/, "").trim();

const looksLikeDescriptionSnippet = (title: string, description: string): boolean => {
  const normalizedTitle = normalizeWhitespace(stripTrailingEllipsis(title)).toLowerCase();
  const normalizedDescription = normalizeWhitespace(description).toLowerCase();

  return normalizedTitle.length >= 12 && normalizedDescription.startsWith(normalizedTitle);
};

const deriveLegacyInitiativeTitle = (description: string): string => {
  const compact = normalizeWhitespace(description);
  if (!compact) {
    return "Untitled project";
  }

  return compact.length > 32 ? `${compact.slice(0, 29).trimEnd()}...` : compact;
};

const applySpecialCases = (value: string): string => {
  let normalized = value;

  for (const [lowercase, styled] of TITLE_SPECIAL_CASES.entries()) {
    normalized = normalized.replace(
      new RegExp(`\\b${lowercase}\\b`, "gi"),
      styled
    );
  }

  return normalized;
};

const toSentenceCase = (input: string): string => {
  const normalized = stripTrailingPunctuation(stripWrappingQuotes(normalizeWhitespace(input)));
  if (!normalized) {
    return normalized;
  }

  return applySpecialCases(normalized.toLowerCase()).replace(
    /(^|:\s+|\/)([a-z])/g,
    (_, prefix: string, character: string) => `${prefix}${character.toUpperCase()}`
  );
};

export const deriveReadableInitiativeTitle = (description: string): string => {
  const compact = normalizeWhitespace(description);
  if (!compact) {
    return "Untitled project";
  }

  const withoutLeadIn = compact.replace(
    /^(?:i|we)\s+(?:want|need)\s+to\s+(?:build|create|make|ship)\s+|^(?:build|create|make|ship)\s+/i,
    ""
  );

  const splitMarkers = [". ", "? ", "! ", " that's ", " that ", " which ", " in terms of ", " inspired by "];
  const firstMarkerIndex = splitMarkers
    .map((marker) => withoutLeadIn.toLowerCase().indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  const rawTitle = (firstMarkerIndex === undefined ? withoutLeadIn : withoutLeadIn.slice(0, firstMarkerIndex))
    .replace(/^(?:a|an|the)\s+/i, "")
    .trim();

  if (!rawTitle) {
    return deriveLegacyInitiativeTitle(description);
  }

  const titleWords = (rawTitle.match(WORD_PATTERN) ?? []).map((token) => token.toLowerCase());
  const filteredWords = titleWords.filter((token) => !TITLE_LEADIN_WORDS.has(token));
  const contentWords =
    filteredWords.filter((token) => !GENERIC_PRODUCT_WORDS.has(token)).length >= 2
      ? filteredWords.filter((token) => !GENERIC_PRODUCT_WORDS.has(token))
      : filteredWords;
  const conciseWords = (contentWords.length > 0 ? contentWords : titleWords).slice(0, 3);
  const fallback = conciseWords.length > 0 ? conciseWords.join(" ") : "Untitled project";
  return toSentenceCase(fallback);
};

export const getInitiativeDisplayTitle = (title: string, description: string): string => {
  const derived = deriveReadableInitiativeTitle(description);
  const legacy = deriveLegacyInitiativeTitle(description);
  const trimmedTitle = title.trim();

  if (!trimmedTitle || trimmedTitle === legacy || trimmedTitle === description.trim() || looksLikeDescriptionSnippet(trimmedTitle, description)) {
    return derived;
  }

  return trimmedTitle;
};
