# Prompt 2: Security and input validation review

You are reviewing the current repository checkout for SpecFlow.

You are performing a security review of a local-first desktop application. SpecFlow now runs through a Tauri shell, a Rust bridge, and a persistent Node sidecar. It makes outbound calls to LLM APIs (Anthropic, OpenAI, OpenRouter) and GitHub's API.

## Runtime configuration facts

- There is no user-facing Fastify or browser fallback runtime in the current desktop app
- Desktop mode routes UI requests through Tauri IPC to the Node sidecar and does not require an HTTP port for normal usage
- Renderer-callable sidecar methods are validated against the shared method catalog and Rust supervisor allowlist
- Native path access flows through approved-path tokens and desktop save/open commands in the Tauri bridge
- Mutating CLI commands run locally against the shared runtime and store; they do not delegate to a localhost server
- See `packages/app/src/validation.ts`, `packages/app/src/sidecar/dispatcher.ts`, `packages/app/src/runtime/handlers/*.ts`, and `packages/tauri/src-tauri/src/lib.rs`

## Key files to read from the repo

- `packages/app/src/validation.ts` -- all input validators
- `packages/app/src/runtime/handlers/import-handlers.ts` -- GitHub issue import
- `packages/app/src/runtime/handlers/run-audit-handlers.ts` -- audit with diff sources
- `packages/app/src/runtime/handlers/run-query-handlers.ts` -- serves run details and bundle downloads from disk
- `packages/app/src/runtime/handlers/ticket-handlers.ts` -- ticket CRUD, export, capture, verify
- `packages/app/src/runtime/handlers/initiative-handlers.ts` -- project CRUD and planning flow actions
- `packages/app/src/runtime/handlers/operation-handlers.ts` -- operation state
- `packages/app/src/llm/client.ts` -- outbound LLM API calls
- `packages/app/src/llm/sse-parser.ts` -- SSE stream parsing
- `packages/app/src/verify/diff-engine.ts` -- delegates to git commands
- `packages/app/src/verify/diff/git-strategy.ts` -- executes git diff
- `packages/app/src/sidecar/dispatcher.ts` -- sidecar method routing and notifications
- `packages/tauri/src-tauri/src/lib.rs` -- desktop commands and bridge registration

## Critical code (inline for reference)

### validation.ts

```typescript
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
```

### import-handlers.ts -- GitHub issue import

```typescript
const parseGithubIssueUrl = (
  raw: string
): { owner: string; repo: string; number: number } | null => {
  try {
    const parsed = new URL(raw);
    if (parsed.hostname !== "github.com") {
      return null;
    }
    const parts = parsed.pathname.replace(/^\//, "").split("/");
    if (parts.length < 4 || parts[2] !== "issues") {
      return null;
    }
    const num = parseInt(parts[3], 10);
    if (Number.isNaN(num) || num <= 0) {
      return null;
    }
    return { owner: parts[0], repo: parts[1], number: num };
  } catch {
    return null;
  }
};

// Later in the route handler:
const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? process.env.GITHUB_TOKEN ?? "";
const headers: Record<string, string> = {
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "SpecFlow/1.0"
};
if (token) {
  headers.Authorization = `Bearer ${token}`;
}

githubReply = await fetchImpl(
  `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
  { headers }
);
```

### run-query-handlers.ts -- bundle.zip download (path construction)

```typescript
app.get("/api/runs/:runId/attempts/:attemptId/bundle.zip", async (request, reply) => {
  const params = request.params as { runId: string; attemptId: string };

  if (!isValidEntityId(params.runId) || !isValidEntityId(params.attemptId)) {
    await reply.code(400).send({ error: "Bad Request", message: "Invalid runId or attemptId format" });
    return;
  }

  const bundleDir = path.join(rootDir, "specflow", "runs", params.runId, "attempts", params.attemptId, "bundle");

  if (!isContainedPath(path.join(rootDir, "specflow", "runs"), bundleDir)) {
    await reply.code(400).send({ error: "Bad Request", message: "Path traversal detected" });
    return;
  }

  // ... serves zip of bundleDir
});
```

### LLM client -- outbound calls with API keys

```typescript
private async requestAnthropic(request: LlmRequest, signal: AbortSignal, onToken?: LlmTokenHandler): Promise<string> {
  const response = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": request.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: request.model,
      system: request.systemPrompt,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream: true,
      messages: [{ role: "user", content: request.userPrompt }]
    })
  });

  if (!response.ok) {
    const raw = await response.text();
    throw classifyProviderError(response.status, raw);
  }

  return parseStreamingSse(response, ANTHROPIC_SSE_CONFIG, onToken);
}
```

## Analyze the following specifically

1. **SSRF via GitHub import**: The import handler constructs a GitHub API URL from parsed `owner`/`repo`/`number` values. Can an attacker craft input that makes the sidecar fetch an internal resource? Consider: what if `owner` contains URL-encoded characters or path separators? What if the URL path contains `../`? Trace both GitHub issue URL parsing and direct owner/repo/issue inputs.

2. **Path traversal**: `isContainedPath` uses `path.resolve()`. Are there any runtime handlers or desktop commands that construct file paths from user input without calling `isContainedPath` or the approved-path helpers? Check bundle ZIP flows, audit handlers, run detail reads, project-root selection, and desktop save commands.

3. **Command injection via git**: The diff engine delegates to `git-strategy.ts`. Read that file. If `scopePaths` or git refs contain shell metacharacters, could they escape into a command? Note that `isValidGitRef` allows slashes, dots, and hyphens. What about `scopePaths` -- are those validated anywhere before being passed to git?

4. **Privileged desktop boundary**: There is no localhost Fastify surface now. Review the Tauri command boundary, sidecar method allowlist, approved-path flows, and external-link handling. Could a malicious renderer payload, compromised notification, or newly added method escape the intended privilege boundary?

5. **Renderer trust assumptions**: The desktop client is still untrusted input at the privilege boundary. Identify any paths that assume renderer-supplied strings, IDs, or file selections are already safe before validation at the sidecar dispatcher or Rust bridge.

6. **API key handling**: The LLM client receives API keys from the server config. Trace the key from `config.yaml` / `.env` through to the outbound request. Are there any code paths where the key could leak into logs, error messages, or client responses? Check `classifyProviderError` -- does it include the raw response text (which might echo the key back)?

7. **findingId parameter**: Review the current audit and ticket handlers to confirm `findingId` uses the correct validator and does not fall back to unchecked string matching. Is the `findingId` format different from entity IDs, and is that handled consistently?

## Output format

For each finding, provide:
- **Severity** (Critical / High / Medium / Low)
- **Attack scenario** (who, how, from where)
- **Whether it's exploitable given the localhost default**
- **Suggested fix** (specific code change, not "add input validation")
