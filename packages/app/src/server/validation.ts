import path from "node:path";

/** ID format: prefix-{8 hex chars} */
export const isValidEntityId = (id: string): boolean =>
  /^[a-z]+-[a-f0-9]{8}$/.test(id);

/** Path containment: resolved target must be under root */
export const isContainedPath = (root: string, target: string): boolean => {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget.startsWith(resolvedRoot + path.sep) || resolvedTarget === resolvedRoot;
};

/** Git ref: alphanumeric, slashes, dots, hyphens, underscores; no leading dash */
export const isValidGitRef = (ref: string): boolean =>
  /^[a-zA-Z0-9][a-zA-Z0-9/_.\-]*$/.test(ref);

/** SSE event name: strip anything except safe chars */
export const sanitizeSseEventName = (event: string): string =>
  event.replace(/[^a-zA-Z0-9_-]/g, "_");
