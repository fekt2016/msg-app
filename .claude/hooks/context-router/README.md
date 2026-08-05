# Context Router

A Graphify-backed **context router** for Claude Code. It runs on the
`UserPromptSubmit` hook and, **before a coding task begins**, injects only the
minimal set of relevant files/skills/agents into the model's context — instead of
letting the model discover context by scanning the whole repository.

The goal is token reduction: turn a "read ~259 files" starting posture into a
"read ~15 ranked files" one, without the model having to decide what's relevant.

```
[Context Router]
Feature: OTP expiration
Graphify Query: OTP expiration
Files Loaded:
  backend/src/modules/auth/otpCode.model.ts
  backend/src/modules/auth/otp.repository.ts
  backend/src/modules/auth/auth.service.ts
  ...
Skills: eaz-authentication, eaz-backend-architecture
Agents: authentication, backend
Estimated Context: 15 files / 42.0 KB   (vs a full-repo read)
```

## How it works

Pipeline (each stage is its own module in `src/`):

1. **Detect** (`detect.ts`) — is this a coding task? A configured slash-command
   (`/implement`, `/plan`, `/fix`, …) is authoritative; plain prose is routed only
   if it matches conservative coding-intent regexes. Greetings, "explain …", and
   documentation questions are ignored. An explicit "scan the **entire repo**"
   request makes the router stand down entirely.
2. **Extract topic** (`detect.ts`) — strip the slash-command and leading imperative
   verbs: `"/implement Add OTP expiration"` → `OTP expiration`.
3. **Cache lookup** (`cache.ts`) — reuse the previous lookup for this feature until
   the graph changes (see _Caching_).
4. **Graphify** (`graphify.ts`) — `graphify query "<topic>" --budget N`, parsing the
   `NODE … [src=… loc=… community=…]` lines into a candidate file set.
5. **Classify** (`classify.ts`) — bucket each path into `source` / `doc` / `adr` /
   `skill` / `agent` / `command` by its location.
6. **Rank & bound** (`rank.ts`) — collapse graph nodes to unique files, score them
   (name-match ≫ hit-count ≫ traversal proximity), cap each bucket to its limit, and
   enforce a global byte budget, shedding the lowest-ranked source files first.
7. **Fallback** (`fallback.ts`) — on a Graphify miss: semantic content search
   (ripgrep), then filename search, both scoped to `fallback.searchGlobs`. It
   **never** falls back to a whole-repo read.
8. **Render & inject** (`contextPackage.ts`, `index.ts`) — write the bounded context
   package to stdout (Claude Code appends hook stdout to the model's context) and the
   `[Context Router]` summary to the log/stderr.

The hook is **fail-open**: any internal error is logged and the hook exits `0` with
no injected context, so a router bug can never block prompt submission.

## Installation

Already wired in `.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx --no-install tsx \"$CLAUDE_PROJECT_DIR/.claude/hooks/context-router/index.ts\" || true"
          }
        ]
      }
    ]
  }
}
```

`tsx` runs the TypeScript source directly — there is **no build step** to keep in
sync. `|| true` guarantees a clean exit even if `tsx` is missing. Requires `tsx`
available via `npx` (already present in this repo's toolchain) and the `graphify`
CLI on `PATH`.

## Configuration

Edit `.context-router.json` at the repo root. Every field is optional and
deep-merged over the defaults in `src/config.ts`; `schema.json` documents the full
shape. Key knobs:

| Field                                                                      | Purpose                                              |
| -------------------------------------------------------------------------- | ---------------------------------------------------- |
| `enabled`                                                                  | Master switch.                                       |
| `codingTriggers`                                                           | Slash-commands that count as coding tasks.           |
| `ignoreIntentPatterns` / `fullRepoOverridePatterns`                        | What to _not_ route.                                 |
| `limits.maxSourceFiles`, `limits.maxContextBytes`, `limits.graphifyBudget` | Size safeguards.                                     |
| `cache.ttlSeconds`                                                         | Max cache age (`0` = fingerprint-only invalidation). |
| `logging.level`, `logging.file`                                            | Diagnostics.                                         |
| `fallback.searchGlobs`                                                     | Directories the fallbacks are scoped to.             |

## Caching

Results are cached per **normalized feature** — `auth`, `login`, and `OTP` all map
to the `authentication` domain (see `DOMAIN_ALIASES` in `cache.ts`), so related
prompts share one lookup. Each entry is stamped with a **graph fingerprint**:

```
<git HEAD> :: <graph.json mtime>:<graph.json size>
```

The entry is invalid the moment the fingerprint changes — which happens exactly
when you commit / checkout (HEAD moves) or run `graphify update .` (the graph file
is rewritten). A `ttlSeconds` bound caps staleness from uncommitted edits.

Cache and logs live under `.cache/` (gitignored).

## Testing / running standalone

```bash
# via stdin (mimics the hook payload)
echo '{"prompt":"/implement Add OTP expiration"}' | npx tsx index.ts

# via arg
npx tsx index.ts --prompt "/fix presence socket disconnect bug"

# typecheck
npx tsc -p tsconfig.json
```

## Extending

- **New context type** → add a rule to `categorize()` and a bucket in `rank.ts`.
- **Different graph tool** → swap `graphify.ts` (keep the `GraphNode[]` contract).
- **Smarter topic extraction / detection** → `detect.ts` is pure and isolated.
- **New cache domain** → add an entry to `DOMAIN_ALIASES` in `cache.ts`.

## Module map

| File                    | Responsibility                                              |
| ----------------------- | ----------------------------------------------------------- |
| `index.ts`              | Hook entry: stdin → orchestrate → stdout. Fail-open.        |
| `src/config.ts`         | Defaults + `.context-router.json` merge + path resolution.  |
| `src/detect.ts`         | Coding-task detection + topic extraction + tokenization.    |
| `src/graphify.ts`       | `graphify query` adapter + `NODE` line parsing.             |
| `src/classify.ts`       | Path → category, reference naming.                          |
| `src/rank.ts`           | Scoring, per-bucket caps, global byte budget.               |
| `src/cache.ts`          | Feature normalization, graph fingerprint, read/write.       |
| `src/fallback.ts`       | Semantic (ripgrep) then filename fallback, scoped + capped. |
| `src/contextPackage.ts` | Renders injected context + `[Context Router]` log block.    |
| `src/logger.ts`         | Leveled file/stderr logger (never throws).                  |
| `src/types.ts`          | Shared types.                                               |
