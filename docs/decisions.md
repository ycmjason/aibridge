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

- **node:util parseArgs** for command orchestration; a native argument parser and router layer, run directly as `node skills/ai-bridge/scripts/cli.ts <command>`.
- **Node 24+ native TypeScript** — `.ts` run directly, no `tsx`/build step. See
  `CLAUDE.md` for the hard rules (erasable syntax only, `.ts` import extensions).
- **Canonical Model Registry** (`skills/ai-bridge/scripts/lib/models.ts`) — mapping canonical provider slugs (e.g. `xai-grok/grok-4.5`, `google-antigravity/gemini-3.6-flash`, `openai-codex/gpt-5.6-sol`) to backend CLI execution specifications.
- **Skills live in-repo** (`skills/`) as the single source; wire them into
  `~/.claude/skills/` (symlink) once the impls land.
- **Zero-dependency, skill-internal CLI** — dropped `@stricli/core` to build the command orchestration layer entirely on Node's native `node:util` `parseArgs`, and moved the CLI code directly inside the skill (`skills/ai-bridge/scripts/`). This makes the skill a self-contained, no-build, no-PATH, portable deliverable ready to open-source. The tradeoff is hand-rolled argument parsing and manual help text generation vs. using a framework, which is acceptable since the CLI surface is small. Note that backing CLIs (`agy`, `grok`, `codex`, `claude`) remain external machine prerequisites, so absolute "zero external tools" was never the goal.
- **Three-verb reshape** (2026-07-24) — the welded `plan` gate (reviewer reviews + expands + recursively delegates the build in ONE codex/grok call) was replaced by orchestrator-driven `plan` → `implement` → `review`. Rationale: the orchestrating agent never saw the expanded plan before code was written, and review was welded to the pre-implementation position (no post-implementation cross-model review existed). Stages now pass FILE PATHS, not content — the orchestrator's output tokens are the scarce resource. Same change introduced the canonical effort-aware slugs (`<vendor>-<cli>/<model>[-<effort>]`, effort mapped per backend: agy bakes it into the model id, grok `--reasoning-effort`, claude `--effort`, codex `-c model_reasoning_effort=`), the shared `lib/delegate.ts` engine (impls contain zero backend switches), and codex as a first-class delegation backend instead of a special-cased reviewer.

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
  historical findings). The new verbs share `lib/delegate.ts` and were smoke-tested
  live (grok reviewing a real working-tree diff against a plan contract).

Shared plumbing lives in `skills/ai-bridge/scripts/lib/` (`proc.ts` spawn/capture/timeout + version
gate; `parsers.ts` validating flag parsers; `models.ts` the canonical registry; `delegate.ts` the
delegation engine; `agy.ts` / `grok.ts` / `claude.ts` / `codex.ts` the per-CLI drivers).
