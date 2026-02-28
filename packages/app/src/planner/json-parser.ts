const extractJsonFromFence = (text: string): string | null => {
  const fencePattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null = null;

  while ((match = fencePattern.exec(text)) !== null) {
    const candidate = match[1]?.trim();
    if (!candidate) {
      continue;
    }

    if (candidate.startsWith("{") || candidate.startsWith("[")) {
      return candidate;
    }
  }

  return null;
};

const extractBalancedJson = (text: string): string | null => {
  const openingChars = ["{", "["];

  for (let startIndex = 0; startIndex < text.length; startIndex += 1) {
    if (!openingChars.includes(text[startIndex] ?? "")) {
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = startIndex; index < text.length; index += 1) {
      const char = text[index] ?? "";

      if (inString) {
        if (!escaped && char === "\\") {
          escaped = true;
          continue;
        }

        if (!escaped && char === '"') {
          inString = false;
        }

        escaped = false;
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{" || char === "[") {
        depth += 1;
      }

      if (char === "}" || char === "]") {
        depth -= 1;
        if (depth === 0) {
          return text.slice(startIndex, index + 1);
        }
      }
    }
  }

  return null;
};

export const parseJsonEnvelope = <T>(rawText: string): T => {
  const candidate = extractJsonFromFence(rawText) ?? extractBalancedJson(rawText);

  if (!candidate) {
    throw new Error("Planner response did not contain a JSON envelope");
  }

  return JSON.parse(candidate) as T;
};
