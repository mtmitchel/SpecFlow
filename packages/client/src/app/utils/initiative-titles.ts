const TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "between",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with"
]);

const TITLE_SPECIAL_CASES = new Map<string, string>([
  ["api", "API"],
  ["cli", "CLI"],
  ["fedora", "Fedora"],
  ["github", "GitHub"],
  ["gtk", "GTK"],
  ["linux", "Linux"],
  ["llm", "LLM"],
  ["openai", "OpenAI"],
  ["openrouter", "OpenRouter"],
  ["prd", "PRD"],
  ["react", "React"],
  ["sql", "SQL"],
  ["tauri", "Tauri"],
  ["ui", "UI"],
  ["vite", "Vite"]
]);

const deriveLegacyInitiativeTitle = (description: string): string => {
  const compact = description.trim().replace(/\s+/g, " ");
  if (!compact) {
    return "Untitled Initiative";
  }

  return compact.length > 64 ? `${compact.slice(0, 61)}...` : compact;
};

const toTitleCase = (input: string): string => {
  const words = input.split(/\s+/).filter(Boolean);
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      const special = TITLE_SPECIAL_CASES.get(lower);
      if (special) {
        return special;
      }

      if (index > 0 && index < words.length - 1 && TITLE_STOP_WORDS.has(lower)) {
        return lower;
      }

      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
};

export const deriveReadableInitiativeTitle = (description: string): string => {
  const compact = description.trim().replace(/\s+/g, " ");
  if (!compact) {
    return "Untitled Initiative";
  }

  const withoutLeadIn = compact.replace(
    /^(?:i|we)\s+(?:want|need)\s+to\s+(?:build|create|make|ship)\s+|^(?:build|create|make|ship)\s+/i,
    ""
  );

  const splitMarkers = [". ", "? ", "! ", " that's ", " that ", " which ", " in terms of "];
  const firstMarkerIndex = splitMarkers
    .map((marker) => withoutLeadIn.toLowerCase().indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  const rawTitle = (firstMarkerIndex === undefined ? withoutLeadIn : withoutLeadIn.slice(0, firstMarkerIndex))
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!rawTitle) {
    return deriveLegacyInitiativeTitle(description);
  }

  const formatted = toTitleCase(rawTitle);
  return formatted.length > 64 ? `${formatted.slice(0, 61).trimEnd()}...` : formatted;
};

export const getInitiativeDisplayTitle = (title: string, description: string): string => {
  const derived = deriveReadableInitiativeTitle(description);
  const legacy = deriveLegacyInitiativeTitle(description);

  if (!title.trim() || title === legacy || title === description.trim()) {
    return derived;
  }

  return title;
};
