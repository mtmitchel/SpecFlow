const ABSOLUTE_PATH_PATTERN =
  /(?:[A-Za-z]:\\[^\s"'`]+|\/(?:[^/\s"'`]+\/)+[^/\s"'`]+)/g;

const UNSUPPORTED_BRIDGE_METHOD_PATTERN =
  /desktop bridge method is not allowed: [^\s]+/gi;

export const sanitizeVisibleErrorMessage = (
  message: string | null | undefined,
  fallback = "Something went wrong."
): string => {
  const trimmed = message?.trim();
  if (!trimmed) {
    return fallback;
  }

  const sanitized = trimmed
    .replace(UNSUPPORTED_BRIDGE_METHOD_PATTERN, "The desktop runtime rejected an unsupported request.")
    .replace(/desktop bridge/gi, "desktop runtime")
    .replace(ABSOLUTE_PATH_PATTERN, "[redacted path]");

  return sanitized.trim() || fallback;
};
