# aibridge — AGENTS.md

`aibridge` is a TypeScript CLI that bridges tasks to **other AI CLIs** already installed and authed on this machine. Workspace driver packages (`proc`, `agy`, `grok`, `codex`, `claude`) and app package (`cli`) are published to npm under `@aibridge/*`. The codebase is organized as a pnpm monorepo under `packages/*`:

- **`node packages/cli/src/cli.ts plan`** (or installed **`aibridge plan`**) → a delegate model studies the repo and writes a detailed implementation plan to a FILE (recommended planner **`xai-grok/grok-4.5`**, own xAI login — pass `--model` and `--out` explicitly). The orchestrator reads/edits/approves it — plans are passed between stages as paths, not content.
- **`node packages/cli/src/cli.ts implement`** → a delegate model implements a plan file in place, running the project's real typecheck/tests (recommended implementer **`google-antigravity/gemini-3.6-flash`** via `agy`, own Antigravity login — pass `--model` explicitly). Prints the delegate's summary + `git diff --stat`.
- **`node packages/cli/src/cli.ts review`** → a delegate model reviews the working-tree diff against a base ref — with `--plan <file>` as the contract, over-reach is a finding — writing the full report to a file (pass `--model` and `--out` explicitly); stdout is just the verdict line (`PASS` / `FINDINGS: …`) + path. With a clean tree and `--plan`, it reviews the plan itself (pre-implementation gate).
- **`node packages/cli/src/cli.ts subagent`** → delegate a self-contained task to another model through the canonical registry (pass `--model` explicitly): recommended **`xai-grok/grok-4.5`** via the **Grok CLI** (own xAI login; ~30 req/min + ~1k msgs/day caps, one run at a time); **`google-antigravity/gemini-3.6-flash`** via the **Antigravity CLI** (`agy`, own Antigravity login) when grok is capped/dead; **`openai-codex/gpt-5.6-sol`** via the **Codex CLI** (own ChatGPT login); last-resort **`anthropic-claude/sonnet-5`** / **`anthropic-claude/opus-5`** (+ `-1m` for Opus 5's 1M context) via the **claude CLI** (bill the claude CLI's Claude subscription — last resort for agents whose own budget that is).
- **`node packages/cli/src/cli.ts image-gen`** → image generation via a model seat (pass `--model` explicitly; recommended `openai-codex/gpt-5.6-sol`; `google-antigravity/gemini-3.6-flash`; `xai-grok/grok-4.5`).

Model slugs are canonical `<vendor>-<cli>/<model>[-<effort>]` (e.g. `openai-codex/gpt-5.6-sol-high`); there are NO short aliases — always pass the full slug. Effort in the slug maps to each backend's own knob; an un-suffixed slug uses the backend's default.

It is the execution layer for the `aibridge` agent skill — one router skill with `plan` + `implement` + `review` + `subagent` + `image-gen` subskills (under [`skills/`](skills/), dispatched from `skills/aibridge/reference/`): the skill carries the *judgment / prompt-craft*, while the CLI on `PATH` (`@aibridge/cli`) owns the *brittle execution* — driving the external CLIs and verifying their output.

## Working style — act as Jason's CTO (orchestrated three-verb flow)

Jason's standing instruction (2026-07-02; flow reshaped 2026-07-24). In this
repo you (the orchestrating agent) are the **CTO**, not a coder-with-helpers. The orchestrator drives
each stage explicitly — `plan` → read/approve → `implement` → `review` — and
the seats are:

- **You (CTO / orchestrator)** — owns the architecture. Before ANY
  delegation, design it properly: module boundaries, interfaces, data flow,
  naming. The plan file is the contract — if a structural question is still
  open, the design isn't done; answer it (with a `review --plan` gate for
  large/risky designs) BEFORE `implement`. Never leave architectural calls as
  "implementer's choice". The orchestrator reads the plan file between `plan` and
  `implement` — that sign-off is the point of the split.
- **Planner / reviewer (grok recommended)** — expands designs against the real
  codebase (`plan`) and pressure-tests diffs (`review`). Keep the reviewer
  cross-model from the implementer; treat findings as design input, not
  friction.
- **Implementer (gemini recommended)** — a pure do-er. It executes
  fully-designed, self-contained plan files and does NOT need (and shouldn't
  be asked to hold) the bigger vision. If a plan requires vision context to
  implement correctly, the design work upstream was insufficient.

Corollary: architecture debt is CTO debt. When a slice ships fast and dirty,
say so unprompted and propose the cleanup — don't wait to be asked.

## Hard rules

- **Node 24.11+, native TypeScript in packages for dev. NO build step for dev (`node packages/cli/src/cli.ts`), NO `tsx`, NO `ts-node`.** Run `.ts` files directly with `node` (type-stripping is on by default in Node 24). `tsc` is for type-checking only (`pnpm typecheck`).
- **Erasable syntax only** — Node strips types, it does not transform them: no `enum`, no `namespace` with runtime members, no parameter properties, no decorators. `tsconfig` enforces this via `erasableSyntaxOnly`.
- **ESM with explicit `.ts` import extensions** (e.g. `import { app } from "./app.ts"`). `verbatimModuleSyntax` is on → use `import type` for type-only imports.
- **pnpm only, via corepack.** `corepack use pnpm@latest` manages the pinned `packageManager`. Don't use npm or yarn here.
- **Published packages use real `dependencies`.** Dependencies use `workspace:*` / `catalog:` in workspace manifests and are rewritten to concrete versions on publish.
- **Per-package `dist/` builds.** Each package builds to `dist/` via tsdown. `publishConfig` overrides exports and bin for published packages.
- **Root stays `private: true`. Version bump = release trigger** for the OIDC publish workflow on `main`.
- **Skill is prose-only.** The skill wraps the `aibridge` CLI on `PATH`.

## Commands

| | |
|---|---|
| Run CLI (dev) | `node packages/cli/src/cli.ts <args>` or `pnpm aibridge <args>` |
| Run CLI (global link) | `aibridge <args>` after one-time `pnpm link --global` from `packages/cli` |
| Run CLI (published) | `aibridge <args>` or `npx -y @aibridge/cli <args>` |
| Help | `node packages/cli/src/cli.ts --help` |
| Build all dists | `pnpm build` |
| Plan | `pnpm aibridge plan --model xai-grok/grok-4.5 --out plan.md "<task prompt>"` |
| Implement | `pnpm aibridge implement --model google-antigravity/gemini-3.6-flash <plan.md>` |
| Review | `pnpm aibridge review --model xai-grok/grok-4.5 --out review.md [--plan <plan.md>] [--base <ref>]` |
| Subagent | `pnpm aibridge subagent --model xai-grok/grok-4.5 "<prompt>"` |
| Monitor runs | `pnpm aibridge runs [--watch]` (logs in `~/.aibridge/runs`) |
| Quota (all backends) | `pnpm aibridge quota [--json]` — agy group windows (weekly+5h) & per-model, codex 5h/weekly, claude session/weekly. Check BEFORE delegating: agy quota is shared per model GROUP (all Gemini tiers drain together) |
| Check / Type-check / Repo / Test | `pnpm check` · `pnpm typecheck` · `pnpm repojj:check` · `pnpm test` |

## Dev-flow

- One-time from repo: `cd packages/cli && pnpm link --global` -> global `aibridge` bin points at `./src/cli.ts` (shebang). Node realpath escapes `node_modules`, so native type-stripping works with no rebuild loop.
- `pnpm aibridge` root script remains for repo-local invocation without a global link.
- `pnpm build` builds dist outputs for publish/CI smoke testing.
- `post-commit` hook refreshes global skill install when `skills/aibridge/` changes.

## Architecture (@stricli/core + workspace packages)

Command orchestration uses **`@stricli/core`** (`buildCommand` / `buildRouteMap` / `buildApplication` / `run`). Strict layering — each layer only imports downward:

- `packages/cli/src/cli.ts` — thin entry: builds context and calls `runCli(buildContext(process), process.argv.slice(2))` (from `app.ts`).
- `packages/cli/src/app.ts` — defines route map and application (`buildApplication`), exports `app` and `runCli(ctx, argv)` wrapper which calls `run(app, argv, ctx)` and normalizes exit codes. `@stricli/core` is a real runtime dependency of `@aibridge/cli`.
- `packages/cli/src/context.ts` — `LocalContext extends CommandContext`, carrying `process`.
- `packages/cli/src/exitCode.ts` — `normalizeExitCode`: normalizes stricli's negative `ExitCode`s to Unix-style exit codes (0/1/2/3).
- `packages/cli/src/commands/<name>/command.ts` — command entry: exports stricli `buildCommand({ func, parameters, docs })` spec.
- `packages/cli/src/commands/<name>/impl.ts` — the implementation `function (this: LocalContext, flags, ...args)`. Impls own *policy* (prompt-craft, stdout contracts, exit codes) and contain ZERO backend process switches.
- `packages/cli/src/driver.ts` — structural `AgentCliDriver` interface.
- `packages/cli/src/drivers.ts` — map `Backend` → `AgentCliDriver` implementations.
- `packages/cli/src/delegate.ts` — thin delegation engine calling `driver.run(task)`.
- `packages/proc` + `packages/driver-{agy,grok,codex,claude}` — workspace packages driving each backend CLI independently (zero external runtime dependencies).

### Adding a subagent model

Edit `packages/cli/src/models.ts`: add an entry to `MODELS` mapping a canonical slug → `{ backend, backendModel, efforts, defaultEffort?, brief }`. Every command surface (`--model <slug>`) picks it up automatically.

## Further reading — research & implementation notes

Full verified findings and per-command implementation recipes live in [`docs/`](docs/):

- [`docs/decisions.md`](docs/decisions.md) — active decisions + one-liner history.
- [`docs/backends.md`](docs/backends.md) — operational backend facts (agy workspace/TTY/quota, codex sandbox/redraw/schema, grok/claude caps).

## Critical runtime gotchas (read before implementing the impls)

- **`agy` stdout capture — no TTY workaround needed (re-verified agy 1.0.6).** An earlier note claimed `agy -p` only emits to a TTY and hangs when piped/redirected (Antigravity issue #76). Re-tested on agy 1.0.6 from this repo: **false here** — agy emits clean text to a piped, redirected, or fully-headless stdout (`runCaptured` in `@aibridge/proc`). See [`docs/backends.md`](docs/backends.md).
- **Verify codex image renders.** A real gpt-image-2 PNG is hundreds of KB–MB; a code-drawn (PIL) substitute is tiny (~10–30 KB). Always check output file size (> ~100 KB) before declaring success; raw renders are cached under `~/.codex/generated_images/<uuid>/ig_*.png`.
- **agy quota death shows up as an empty answer.** An exhausted model makes `agy -p` return an empty answer after ~6s (the CLI exits 0). Quota preflight is the guard: `preflightModel` refuses before spawning when agy snapshot says model group is exhausted.

## Git — commit & push anytime

This repo's remote is **`git@github.com:ycmjason/aibridge.git`** (branch `main`).

**After any meaningful change, commit and push — you do not need to ask.** Keep commits small and messages clear.

- **The global skill install auto-refreshes on commit.** A `post-commit` hook re-runs `pnpm skill:install` (backgrounded, logged to `/tmp/aibridge-skill-install.log`) whenever a commit touches `skills/aibridge/`; run it manually to sync uncommitted edits. Hooks are wired on `pnpm install` via the `prepare` script: a `pre-commit` hook runs `biome check` on staged files, and a `pre-push` hook runs `pnpm typecheck`.

End commit messages with a `Co-Authored-By` trailer naming the agent/model that did the work, e.g.:

```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```
