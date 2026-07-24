# Architecture & decisions

> Provenance: research + live testing on macOS (Darwin 24.5.0), 2026-06-08, by Claude (Opus 4.8). Findings marked **[verified]** were reproduced on this machine; **[web]** came from documentation research and may drift; **[skill]** carried over from the pre-existing `image-gen` skill.

## What this is

`ai-bridge` is the **execution layer** for the `ai-bridge` Claude Code skill — a
router skill (`skills/ai-bridge/`) exposing subskills (loaded on demand from `reference/`):

- `plan` → produce a detailed implementation plan file for a task prompt.
- `implement` → execute an implementation plan file with real typecheck + tests.
- `review` → review working tree diffs or plan contracts for over-reach and defects.
- `subagent` → delegate a self-contained task to a non-Claude model via canonical registry.
- `image-gen` → generate an image with gpt-image-2.

The skill carries the *judgment / prompt-craft*; this CLI owns the *brittle execution* (driving external CLIs and verifying their output).

> **Note:** The original welded plan-gate (which combined review, expansion, and implementation into one recursive codex call) was replaced by the decoupled three-verb workflow (`plan` → `implement` → `review`).

## Why a skill + bundled CLI, and NOT an MCP server

We evaluated three shapes: prose-only skill, **skill + bundled CLI** (the
`impeccable` / `seo-audit` pattern), and an MCP server. We chose skill + CLI.

| | prose-only | **skill + bundled CLI** | MCP server |
|---|---|---|---|
| Brittle logic in deterministic code | ✗ | ✓ (this CLI) | ✓ |
| Prompt-craft as rich, on-demand context | ✓ | ✓ (`skills/`) | ✗ tool descriptions only, always in context |
| Long-running (agy/codex take minutes) | ✓ Bash tool handles it | ✓ Bash tool handles it | ✗ needs timeout/progress engineering |
| Extra process / registration | none | none | yes |
| Reusable outside Claude Code | ✗ | ✗ | ✓ |

Decisive points:

- **MCP's default tool-call timeout is 60s** (`MCP_TOOL_TIMEOUT`) **[web]**; agy/codex
  routinely run minutes. Keeping a call alive needs the timeout raised *before*
  session start plus server-emitted progress notifications that Claude Code
  "displays but doesn't auto-extend the timeout" for — fragile. The Bash tool
  runs a multi-minute `node …` with no such ceremony.
- MCP's one unique win — cross-client reuse (Desktop/IDE) — isn't needed; these
  are Claude Code skills.
- Anthropic's own guidance matches the split **[web]**: *the Skill teaches HOW; the
  MCP provides tools/resources.* Prompt-craft belongs in the skill layer, never
  buried in a tool description.

If we ever want these tools in Claude Desktop / an IDE / another agent, wrap this
same CLI in a thin MCP server then — the execution core stays unchanged.

## Decisions worth knowing (easy to revisit)

- **`@stricli/core` for command orchestration** (superseded **node:util parseArgs**, 2026-07-24 — see the reversal entry below); run directly as `node packages/ai-bridge/src/cli.ts <command>`.
- **Node 24+ native TypeScript** — `.ts` run directly, no `tsx`/build step. See
  `AGENTS.md` for the hard rules (erasable syntax only, `.ts` import extensions).
- **Canonical Model Registry** (`packages/ai-bridge/src/models.ts`) — mapping canonical provider slugs (e.g. `xai-grok/grok-4.5`, `google-antigravity/gemini-3.6-flash`, `openai-codex/gpt-5.6-sol`) to backend CLI execution specifications.
- **Skills live in-repo** (`skills/`) as the single source; wire them into
  `~/.claude/skills/` (symlink) once the impls land.
- **Zero-dependency drivers + inlined stricli app** — workspace driver packages remain zero external runtime dependencies; command orchestration in `@aibridge/ai-bridge` uses `@stricli/core@1.3.0` inlined via `tsdown` into `skills/ai-bridge/scripts/cli.mjs`.
- **Three-verb reshape** (2026-07-24) — the welded `plan` gate (reviewer reviews + expands + recursively delegates the build in ONE codex/grok call) was replaced by orchestrator-driven `plan` → `implement` → `review`. Rationale: the orchestrating agent never saw the expanded plan before code was written, and review was welded to the pre-implementation position (no post-implementation cross-model review existed). Stages now pass FILE PATHS, not content — the orchestrator's output tokens are the scarce resource. Same change introduced the canonical effort-aware slugs (`<vendor>-<cli>/<model>[-<effort>]`, effort mapped per backend: agy bakes it into the model id, grok `--reasoning-effort`, claude `--effort`, codex `-c model_reasoning_effort=`), the shared `delegate.ts` engine (impls contain zero backend switches), and codex as a first-class delegation backend instead of a special-cased reviewer.
- **Monorepo split into workspace packages + committed skill bundle** (2026-07-24) — Split CLI into workspace packages under `packages/*` (`proc`, `agy`, `grok`, `codex`, `claude`, `ai-bridge`). `skills/ai-bridge/` remains a judgment-only skill directory containing a single committed, self-contained ESM bundle `scripts/cli.mjs` built with `tsdown`. Rationale: Vercel skills CLI copies only the skill directory from git, requiring a zero-node_modules bundle; monorepo structure cleanly separates driver mechanics from CLI orchestration via a structural `AgentCliDriver` contract. `AGY_CANONICAL_TO_NATIVE` lives in `@aibridge/agy` to avoid circular dependencies with quota fetchers.
- **Reverse drop of `@stricli/core` (2026-07-24).** Originally dropped so the skill-internal CLI stayed source-level zero-dep for Vercel copy. Monorepo + `tsdown` committed bundle removed that constraint: app depends on `@stricli/core@1.3.0` (catalog exact), inlined into the skill bundle via `alwaysBundle`; drivers/proc remain zero-dep; artifact remains self-contained (CI bare-copy smoke). Restored typed `buildCommand` routing, deleted hand-rolled help/`parseArgs`. Exit-code contract preserved via post-`run` normalization of stricli's negative `ExitCode`s to 2 (with operational failures mapped to 1). Unexpected positionals on `review` are now rejected (exit 2). Approved additive spellings from stricli's scanner: positive `--preflight` / `--tools`, `--flag=value` forms, and `--helpAll`/`--help-all`/`-H`; negation is suppressed (`withNegated: false`) on `json`/`watch`, so `--no-json`/`--no-watch` still exit 2.

## Status

- `subagent` (2026-06-08) drives `agy` and captures stdout directly — the old "agy
  needs a TTY" gotcha did **not** reproduce on agy 1.0.6 (see `subagent-agy.md`), so
  no `node-pty` / file-output workaround was needed. Verified: plain + `--json`.
  (2026-07-01: fixed a workspace bug — it now runs the delegate in the caller's repo,
  not a throwaway temp dir; see `subagent-agy.md`.)
- `image-gen` (2026-06-08) drives `codex exec`, attributes the render via a pre-spawn
  cache snapshot diff, and verifies a real (> 100 KB) gpt-image-2 PNG with one
  anti-redraw retry only on a genuine code-drawn substitute. Verified: a real
  1024×1024 ~600 KB render.
- `plan` / `implement` / `review` (2026-07-24) replaced the welded three-tier gate
  (2026-07-01, live-tested end-to-end in its day — see `plan-codex.md` for the
  historical findings). The new verbs share `delegate.ts` and were smoke-tested
  live (grok reviewing a real working-tree diff against a plan contract).

Shared plumbing lives in `packages/` (`proc` spawn/capture/timeout; `agy`, `grok`, `codex`, `claude` drivers; `ai-bridge` CLI and orchestration).
