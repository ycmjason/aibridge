# ai-bridge

A tiny, zero-dependency TypeScript CLI that bridges tasks to non-Claude AI CLIs installed on your machine. The skill is self-contained, with the CLI shipped inside it:

- `node skills/ai-bridge/scripts/cli.ts plan "<prompt>"` — produce a detailed implementation plan file for a task prompt.
- `node skills/ai-bridge/scripts/cli.ts implement <plan.md>` — execute an implementation plan file with real typecheck + tests.
- `node skills/ai-bridge/scripts/cli.ts review [--plan <plan.md>]` — review working tree diffs or plan contracts for over-reach and defects.
- `node skills/ai-bridge/scripts/cli.ts subagent "<prompt>" [--model <slug>]` — delegate a self-contained task to another model.
- `node skills/ai-bridge/scripts/cli.ts image-gen "<prompt>"` — generate an image via a model seat (`openai-codex/gpt-5.6-sol` → gpt-image-2, the default; `xai-grok/grok-4.5` → Imagine).

Models are named by canonical, effort-aware slugs — `<vendor>-<cli>/<model>[-<effort>]`, e.g. `xai-grok/grok-4.5` (default planner/reviewer, via the **Grok CLI**), `google-antigravity/gemini-3.6-flash` (default implementer, via the **Antigravity CLI**, `agy`), `openai-codex/gpt-5.6-sol-high`, `anthropic-claude/opus`. There are no short aliases — always pass the full canonical slug.

It's the execution layer behind the `ai-bridge` Claude Code skill — one router skill with `plan`, `implement`, `review`, `subagent`, and `image-gen` subskills (see [`skills/`](skills/)): the skill carries the judgment and prompt-craft, this CLI owns the brittle execution (driving the external CLIs and verifying their output).

## Requirements

- **Node 24+** — TypeScript runs directly, no build step.
- **pnpm via corepack**: `corepack enable && corepack use pnpm@latest`.
- The backing CLIs on `PATH` and authed (no API keys): `agy`, `grok`, `codex`, `claude`.

## Installing the skill (this repo is private)

This repo is **private**, so the [`skills`](https://skills.sh) CLI **cannot** fetch it from GitHub —
`skills add fishballapp/ai-bridge` and `skills update` fail with `Failed to fetch tree` (the CLI hits the
GitHub tree API unauthenticated; it does **not** read `GITHUB_TOKEN` / `GH_TOKEN` / your `gh` login).
Install from this **local clone** instead:

```bash
# Copies the skill into ~/.agents/skills/ai-bridge. The -a list pins the install to the
# agents you use (space-separated allow-list); without it ALL agents are targeted and
# PromptScript prints a harmless error (see caveats). Re-run verbatim to refresh after edits.
npx skills add /absolute/path/to/ai-bridge -g -y \
  -a amp antigravity antigravity-cli cline codex cursor deepagents gemini-cli \
     github-copilot kimi-code-cli opencode warp zed claude-code
```

Caveats, so this doesn't trip you up later:

- A **global (`-g`) local install is not lock-tracked** — it's an untracked copy. `skills list` won't
  show it and `skills update` won't manage it (it just skips it cleanly — no more fetch error). To pick
  up edits, the copy refreshes automatically via a `post-commit` hook when a commit touches `skills/ai-bridge/`; run `pnpm skill:install` (the single source of truth for the `-a` allow-list) to sync uncommitted edits. Note that git hooks are configured using lefthook (wired on `pnpm install` via the `prepare` script): a `pre-commit` hook runs `biome check` to format and lint staged files, and a `pre-push` hook runs `pnpm typecheck` to verify TypeScript types.
- **Why pin `-a`?** `PromptScript` is the one agent target that can't be installed globally — with no
  `-a`, the install targets every agent and prints `does not support global skill installation`
  (harmless, but noisy). The `-a` allow-list above omits it. To add/drop an agent, edit that list; pass
  an unknown name and `skills` prints the full set of valid agent ids.
- If you ever make the repo **public**, the normal `skills add/update fishballapp/ai-bridge` flow works and
  *is* lock-tracked + auto-updatable — the local-copy dance above is only needed while it's private.

## Develop

```bash
pnpm install
pnpm check && pnpm typecheck && pnpm repojj:check && pnpm test
node skills/ai-bridge/scripts/cli.ts --help
```

## Usage

```bash
# Produce a detailed implementation plan file for a task prompt
node skills/ai-bridge/scripts/cli.ts plan "<prompt>" [--model <slug>] [--out plan.md] [--timeout <seconds>]

# Execute an implementation plan file
node skills/ai-bridge/scripts/cli.ts implement <plan-file> [--model <slug>] [--timeout <seconds>]

# Review working tree diff or plan contract
node skills/ai-bridge/scripts/cli.ts review [--plan <plan-file>] [--base HEAD] [--out review.md] [--model <slug>]

# Delegate a self-contained task to another model
node skills/ai-bridge/scripts/cli.ts subagent "<prompt>" [--model <slug>] [--timeout <seconds>] [--no-tools] [--json]

# Generate an image (default seat: gpt-image-2 via codex; pass --model xai-grok/grok-4.5 for Imagine)
node skills/ai-bridge/scripts/cli.ts image-gen "<prompt>" [--model <slug>] [--out out.png] [--size 1024x1024] [--quality high]
```

The three verbs compose into an orchestrator-driven workflow: `plan` writes a plan file, the orchestrating agent reads and approves it, `implement` executes it, and `review` cross-checks the resulting diff against the plan contract (over-reach is a finding). File paths — not file contents — travel between stages. `subagent` and delegation-backed verbs let the delegate read/write files and run shell by default (auto-approved); `subagent --no-tools` restricts it to reasoning-only, e.g. for untrusted input. `image-gen` takes the same `--model` slugs as other commands (image seats: `openai-codex/gpt-5.6-sol`, `xai-grok/grok-4.5`); the codex path verifies a real gpt-image-2 render (> 100 KB), not a tiny code-drawn substitute.

> Status: **implemented & live-tested** — the commands drive their backing CLIs and verify output. See [`CLAUDE.md`](CLAUDE.md) and [`docs/`](docs/).
