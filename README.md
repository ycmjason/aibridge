# aibridge

A TypeScript CLI that bridges tasks to non-Claude AI CLIs installed on your machine. Organized as a pnpm monorepo under `packages/*` and published to npm under `@aibridge/*`:

- `aibridge plan "<prompt>"` — produce a detailed implementation plan file for a task prompt.
- `aibridge implement <plan.md>` — execute an implementation plan file with real typecheck + tests.
- `aibridge review [--plan <plan.md>]` — review working tree diffs or plan contracts for over-reach and defects.
- `aibridge subagent "<prompt>" [--model <slug>]` — delegate a self-contained task to another model.
- `aibridge image-gen "<prompt>"` — generate an image via a model seat (`openai-codex/gpt-5.6-sol` → gpt-image-2, the default; `xai-grok/grok-4.5` → Imagine).

Models are named by canonical, effort-aware slugs — `<vendor>-<cli>/<model>[-<effort>]`, e.g. `xai-grok/grok-4.5` (default planner/reviewer, via the **Grok CLI**), `google-antigravity/gemini-3.6-flash` (default implementer, via the **Antigravity CLI**, `agy`), `openai-codex/gpt-5.6-sol-high`, `anthropic-claude/opus`. There are no short aliases — always pass the full canonical slug.

It's the execution layer behind the `aibridge` Claude Code skill — one router skill with `plan`, `implement`, `review`, `subagent`, and `image-gen` subskills (see [`skills/`](skills/)): the skill carries the judgment and prompt-craft, this CLI owns the brittle execution (driving the external CLIs and verifying their output).

## Packages

| Package | Description |
|---|---|
| `@aibridge/proc` | Process helpers (spawn/capture/timeout) for aibridge backend drivers |
| `@aibridge/agy` | Antigravity (`agy`) CLI driver for aibridge |
| `@aibridge/grok` | xAI Grok CLI driver for aibridge |
| `@aibridge/codex` | OpenAI Codex CLI driver for aibridge |
| `@aibridge/claude` | Anthropic Claude CLI driver for aibridge |
| `@aibridge/cli` | CLI orchestration and commands (`aibridge`) |

## Requirements

- **Node 24.11+** — TypeScript runs directly in packages for dev.
- **pnpm via corepack**: `corepack enable && corepack use pnpm@latest`.
- The backing CLIs on `PATH` and authed (no API keys): `agy`, `grok`, `codex`, `claude`.

## Installation

### 1. Install the CLI

```bash
npm i -g @aibridge/cli
```

*(Alternatively, run on demand with `npx -y @aibridge/cli <command>`)*

### 2. Install the Skill

```bash
npx skills add fishballapp/aibridge -g -y \
  -a amp antigravity antigravity-cli cline codex cursor deepagents gemini-cli \
     github-copilot kimi-code-cli opencode warp zed claude-code
```

Or from a local clone:

```bash
npx skills add /absolute/path/to/aibridge -g -y \
  -a amp antigravity antigravity-cli cline codex cursor deepagents gemini-cli \
     github-copilot kimi-code-cli opencode warp zed claude-code
```

## Develop

```bash
pnpm install
pnpm check && pnpm typecheck && pnpm repojj:check && pnpm test
pnpm build
node packages/cli/src/cli.ts --help
aibridge --help
```

## Usage

```bash
# Produce a detailed implementation plan file for a task prompt
aibridge plan "<prompt>" [--model <slug>] [--out plan.md] [--timeout <seconds>]

# Execute an implementation plan file
aibridge implement <plan-file> [--model <slug>] [--timeout <seconds>]

# Review working tree diff or plan contract
aibridge review [--plan <plan-file>] [--base HEAD] [--out review.md] [--model <slug>]

# Delegate a self-contained task to another model
aibridge subagent "<prompt>" [--model <slug>] [--timeout <seconds>] [--no-tools] [--json]

# Generate an image (default seat: gpt-image-2 via codex; pass --model xai-grok/grok-4.5 for Imagine)
aibridge image-gen "<prompt>" [--model <slug>] [--out out.png] [--size 1024x1024] [--quality high]
```

The three verbs compose into an orchestrator-driven workflow: `plan` writes a plan file, the orchestrating agent reads and approves it, `implement` executes it, and `review` cross-checks the resulting diff against the plan contract (over-reach is a finding). File paths — not file contents — travel between stages. `subagent` and delegation-backed verbs let the delegate read/write files and run shell by default (auto-approved); `subagent --no-tools` restricts it to reasoning-only, e.g. for untrusted input. `image-gen` takes the same `--model` slugs as other commands (image seats: `openai-codex/gpt-5.6-sol`, `xai-grok/grok-4.5`); the codex path verifies a real gpt-image-2 render (> 100 KB), not a tiny code-drawn substitute.

> Status: **implemented & live-tested** — the commands drive their backing CLIs and verify output. See [`AGENTS.md`](AGENTS.md) and [`docs/`](docs/).
