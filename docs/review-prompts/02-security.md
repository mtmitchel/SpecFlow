# Prompt 2: Security & Input Validation Review

You are reviewing the current repository checkout for SpecFlow.

You are performing a security review of a local-first desktop-first application. SpecFlow now runs primarily through a Tauri shell and a persistent Node sidecar, with a retained Fastify fallback runtime for legacy web mode and compatible CLI delegation. It makes outbound calls to LLM APIs (Anthropic, OpenAI, OpenRouter) and GitHub's API.

## Runtime configuration facts

- Fastify with `{ logger: false, bodyLimit: 1_048_576 }` (1 MB)
- `@fastify/static` serves the client build
- **No CORS plugin** -- no CORS headers set
- **No Helmet** -- no security headers (CSP, X-Frame-Options, etc.)
- **No rate limiting** -- no `@fastify/rate-limit`
- **No authentication or session management**
- The legacy Fastify fallback listens on `127.0.0.1:3141` by default (host is configurable)
- Desktop mode routes UI requests through Tauri IPC to the Node sidecar and does not require an HTTP port for normal usage
- See `packages/app/src/server/create-server.ts`, `packages/app/src/sidecar.ts`, and `packages/tauri/src-tauri/src/lib.rs`

## Key files to read from the repo

- `packages/app/src/server/validation.ts` -- all input validators
- `packages/app/src/server/routes/import-routes.ts` -- GitHub issue import
- `packages/app/src/server/routes/run-audit-routes.ts` -- audit with diff sources
- `packages/app/src/server/routes/run-query-routes.ts` -- serves files from disk
- `packages/app/src/server/routes/ticket-routes.ts` -- ticket CRUD, export, capture
- `packages/app/src/server/routes/initiative-routes.ts` -- initiative CRUD
- `packages/app/src/server/routes/operation-routes.ts` -- operation state
- `packages/app/src/llm/client.ts` -- outbound LLM API calls
- `packages/app/src/llm/sse-parser.ts` -- SSE stream parsing
- `packages/app/src/verify/diff-engine.ts` -- delegates to git commands
- `packages/app/src/verify/diff/git-strategy.ts` -- executes git diff
- `packages/app/src/server/create-server.ts` -- server composition root

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

### import-routes.ts -- GitHub issue import

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

### run-query-routes.ts -- bundle.zip download (path construction)

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

1. **SSRF via GitHub import**: The import route constructs a URL from user-supplied `owner`/`repo`/`number`. Can an attacker craft input that makes the server fetch an internal resource? Consider: what if `owner` contains URL-encoded characters? What if the URL path contains `../`? The route uses both URL parsing and string interpolation paths (the `body.owner`/`body.repo` path skips `parseGithubIssueUrl`).

2. **Path traversal**: `isContainedPath` uses `path.resolve()`. Are there any routes that construct file paths from user input WITHOUT calling `isContainedPath`? Check the bundle.zip route, audit routes, run detail route (which reads `diff-primary.patch` and `diff-drift.patch` from disk using `run.committedAttemptId`), and any path that uses route params to build filesystem paths. Look at ALL route files.

3. **Command injection via git**: The diff engine delegates to `git-strategy.ts`. Read that file. If `scopePaths` or git refs contain shell metacharacters, could they escape into a command? Note that `isValidGitRef` allows slashes, dots, and hyphens. What about `scopePaths` -- are those validated anywhere before being passed to git?

4. **Missing security headers**: No Helmet, no CSP, no X-Frame-Options on the retained Fastify fallback. Given that legacy web mode still runs on localhost when explicitly used, what is the realistic attack surface? Consider: can a malicious website in the user's browser make requests to `localhost:3141`? (DNS rebinding, CSRF via form POST, `fetch` with `no-cors` mode). Enumerate specific attack scenarios, not generic risks.

5. **Localhost assumption**: The legacy server binds to `127.0.0.1` by default but the host is configurable via `config.yaml`. If a user sets host to `0.0.0.0`, what additional attack surface opens up? Is there anything in the code that assumes localhost-only access?

6. **API key handling**: The LLM client receives API keys from the server config. Trace the key from `config.yaml` / `.env` through to the outbound request. Are there any code paths where the key could leak into logs, error messages, or client responses? Check `classifyProviderError` -- does it include the raw response text (which might echo the key back)?

7. **findingId parameter**: In `run-audit-routes.ts`, the `findingId` param is used in `report.findings.find()` but is NOT validated with `isValidEntityId()`. Is the `findingId` format different from entity IDs? Could a malicious `findingId` cause issues? Check how finding IDs are generated.

## Output format

For each finding, provide:
- **Severity** (Critical / High / Medium / Low)
- **Attack scenario** (who, how, from where)
- **Whether it's exploitable given the localhost default**
- **Suggested fix** (specific code change, not "add input validation")
