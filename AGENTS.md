# aibridge — AGENTS.md

`aibridge` is a TypeScript CLI that bridges tasks to **non-Claude AI CLIs** already installed and authed on this machine. Workspace driver packages (`proc`, `agy`, `grok`, `codex`, `claude`) maintain zero external runtime dependencies; app package dependencies (`@stricli/core`) are inlined into the committed skill bundle (`skills/aibridge/scripts/cli.mjs`), keeping the skill artifact self-contained. The codebase is organized as a pnpm monorepo under `packages/*`:

- **`node packages/cli/src/cli.ts plan`** (or skill artifact **`node skills/aibridge/scripts/cli.mjs plan`**) → a delegate model studies the repo and writes a detailed implementation plan to a FILE (default planner **`xai-grok/grok-4.5`**, off-budget). The orchestrator reads/edits/approves it — plans are passed between stages as paths, not content.
- **`node packages/cli/src/cli.ts implement`** → a delegate model implements a plan file in place, running the project's real typecheck/tests (default implementer **`google-antigravity/gemini-3.6-flash`** via `agy`, off-budget). Prints the delegate's summary + `git diff --stat`.
- **`node packages/cli/src/cli.ts review`** → a delegate model reviews the working-tree diff against a base ref — with `--plan <file>` as the contract, over-reach is a finding — writing the full report to a file; stdout is just the verdict line (`PASS` / `FINDINGS: …`) + path. With a clean tree and `--plan`, it reviews the plan itself (pre-implementation gate).
- **`node packages/cli/src/cli.ts subagent`** → delegate a self-contained task to another model through the canonical registry: default **`xai-grok/grok-4.5`** via the **Grok CLI** (off-budget on its xAI login; ~30 req/min + ~1k msgs/day caps, one run at a time); **`google-antigravity/gemini-3.6-flash`** via the **Antigravity CLI** (`agy`, off-budget) when grok is capped/dead; **`openai-codex/gpt-5.6-sol`** via the **Codex CLI** (off-budget, ChatGPT login); last-resort **`anthropic-claude/sonnet`** / **`anthropic-claude/opus`** via the **claude CLI** (bill the Claude subscription — for when the off-budget CLIs are quota-dead).
- **`node packages/cli/src/cli.ts image-gen`** → image generation via a model seat (`openai-codex/gpt-5.6-sol` → gpt-image-2, the default; `xai-grok/grok-4.5` → Imagine).

Model slugs are canonical `<vendor>-<cli>/<model>[-<effort>]` (e.g. `openai-codex/gpt-5.6-sol-high`); there are NO short aliases — always pass the full slug. Effort in the slug maps to each backend's own knob; an un-suffixed slug uses the backend's default.

It is the execution layer for the `aibridge` agent skill — one router skill with `plan` + `implement` + `review` + `subagent` + `image-gen` subskills (under [`skills/`](skills/), dispatched from `skills/aibridge/reference/`): the skill carries the *judgment / prompt-craft*, this CLI owns the *brittle execution* — driving the external CLIs and verifying their output. The skill ships a committed, self-contained ESM bundle at `skills/aibridge/scripts/cli.mjs` built with `pnpm build:skill`.

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
- **Planner / reviewer (grok by default)** — expands designs against the real
  codebase (`plan`) and pressure-tests diffs (`review`). Keep the reviewer
  cross-model from the implementer; treat findings as design input, not
  friction.
- **Implementer (gemini by default)** — a pure do-er. It executes
  fully-designed, self-contained plan files and does NOT need (and shouldn't
  be asked to hold) the bigger vision. If a plan requires vision context to
  implement correctly, the design work upstream was insufficient.

Corollary: architecture debt is CTO debt. When a slice ships fast and dirty,
say so unprompted and propose the cleanup — don't wait to be asked.

## Hard rules

- **Node 24.11+, native TypeScript in packages. NO build step for dev (`node packages/cli/src/cli.ts`), NO `tsx`, NO `ts-node`.** Run `.ts` files directly with `node` (type-stripping is on by default in Node 24). `tsc` is for type-checking only (`pnpm typecheck`).
- **Committed skill bundle (`skills/aibridge/scripts/cli.mjs`).** Generated via `pnpm build:skill` (`tsdown`), self-contained for Vercel skills copy deployment.
- **App runtime dependencies must be inlined in the skill bundle.** Any dependency of `@aibridge/cli` must be listed in `tsdown.config.ts` under `deps.alwaysBundle` so the generated `cli.mjs` remains fully self-contained. `onlyImport: []` enforces this in CI.
- **Erasable syntax only** — Node strips types, it does not transform them: no `enum`, no `namespace` with runtime members, no parameter properties, no decorators. `tsconfig` enforces this via `erasableSyntaxOnly`.
- **ESM with explicit `.ts` import extensions** (e.g. `import { app } from "./app.ts"`). `verbatimModuleSyntax` is on → use `import type` for type-only imports.
- **pnpm only, via corepack.** `corepack use pnpm@latest` manages the pinned `packageManager`. Don't use npm or yarn here.

## Commands

| | |
|---|---|
| Run the CLI (dev) | `node packages/cli/src/cli.ts <args>` or `pnpm aibridge <args>` |
| Run the skill bundle | `node skills/aibridge/scripts/cli.mjs <args>` |
| Help | `node packages/cli/src/cli.ts --help` |
| Build skill bundle | `pnpm build:skill` |
| Plan | `pnpm aibridge plan "<task prompt>" [--out <file>]` |
| Implement | `pnpm aibridge implement <plan.md>` |
| Review | `pnpm aibridge review [--plan <plan.md>] [--base <ref>]` |
| Subagent | `pnpm aibridge subagent "<prompt>" [--model <slug>]` |
| Monitor runs | `pnpm aibridge runs [--watch]` (logs in `~/.aibridge/runs`) |
| Quota (all backends) | `pnpm aibridge quota [--json]` — agy group windows (weekly+5h) & per-model, codex 5h/weekly, claude session/weekly. Check BEFORE delegating: agy quota is shared per model GROUP (all Gemini tiers drain together) |
| Check / Type-check / Repo / Test | `pnpm check` · `pnpm typecheck` · `pnpm repojj:check` · `pnpm test` |

## Architecture (@stricli/core + workspace packages)

Command orchestration uses **`@stricli/core`** (`buildCommand` / `buildRouteMap` / `buildApplication` / `run`). Strict layering — each layer only imports downward:

- `packages/cli/src/cli.ts` — thin entry: builds context and calls `runCli(buildContext(process), process.argv.slice(2))` (from `app.ts`).
- `packages/cli/src/app.ts` — defines route map and application (`buildApplication`), exports `app` and `runCli(ctx, argv)` wrapper which calls `run(app, argv, ctx)` and normalizes exit codes.
- `packages/cli/src/context.ts` — `LocalContext extends CommandContext`, carrying `process`.
- `packages/cli/src/exitCode.ts` — `normalizeExitCode`: normalizes stricli's negative `ExitCode`s to Unix-style exit codes (0/1/2/3).
- `packages/cli/src/commands/<name>/command.ts` — command entry: exports stricli `buildCommand({ func, parameters, docs })` spec.
- `packages/cli/src/commands/<name>/impl.ts` — the implementation `function (this: LocalContext, flags, ...args)`. Impls own *policy* (prompt-craft, stdout contracts, exit codes) and contain ZERO backend process switches.
- `packages/cli/src/driver.ts` — structural `AgentCliDriver` interface.
- `packages/cli/src/drivers.ts` — map `Backend` → `AgentCliDriver` implementations.
- `packages/cli/src/delegate.ts` — thin delegation engine calling `driver.run(task)`.
- `packages/{proc,agy,grok,codex,claude}` — workspace packages driving each backend CLI independently (zero external runtime dependencies).

### Adding a subagent model

Edit `packages/cli/src/models.ts`: add an entry to `MODELS` mapping a canonical slug → `{ backend, backendModel, efforts, defaultEffort?, brief }`. Every command surface (`--model <slug>`) picks it up automatically.

## Further reading — research & implementation notes

Full verified findings and per-command implementation recipes live in [`docs/`](docs/):

- [`docs/decisions.md`](docs/decisions.md) — architecture & why skill+CLI (not MCP) & monorepo restructure.
- [`docs/subagent-agy.md`](docs/subagent-agy.md) — agy facts + how to implement `subagent`.
- [`docs/image-gen-codex.md`](docs/image-gen-codex.md) — codex facts + how to implement `image-gen`.
- [`docs/plan-codex.md`](docs/plan-codex.md) — the SUPERSEDED three-tier `plan` gate findings.

## Critical runtime gotchas (read before implementing the impls)

- **`agy` stdout capture — no TTY workaround needed (re-verified agy 1.0.6).** An earlier note claimed `agy -p` only emits to a TTY and hangs when piped/redirected (Antigravity issue #76). Re-tested on agy 1.0.6 from this repo: **false here** — agy emits clean text to a piped, redirected, or fully-headless stdout (`runCaptured` in `@aibridge/proc`). See [`docs/subagent-agy.md`](docs/subagent-agy.md).
- **Verify codex image renders.** A real gpt-image-2 PNG is hundreds of KB–MB; a code-drawn (PIL) substitute is tiny (~10–30 KB). Always check output file size (> ~100 KB) before declaring success; raw renders are cached under `~/.codex/generated_images/<uuid>/ig_*.png`.
- **agy quota death shows up as an empty answer.** An exhausted model makes `agy -p` return an empty answer after ~6s (the CLI exits 0). Quota preflight is the guard: `preflightModel` refuses before spawning when agy snapshot says model group is exhausted.

## Git — commit & push anytime

This repo's remote is **`git@github.com:fishballapp/aibridge.git`** (branch `main`).

**After any meaningful change, commit and push — you do not need to ask.** Keep commits small and messages clear.

- **The global skill install auto-refreshes on commit.** A `post-commit` hook re-runs `pnpm skill:install` (backgrounded, logged to `/tmp/aibridge-skill-install.log`) whenever a commit touches `skills/aibridge/`; run it manually to sync uncommitted edits. Hooks are wired on `pnpm install` via the `prepare` script: a `pre-commit` hook runs `biome check` and `build-skill` on staged files, and a `pre-push` hook runs `pnpm typecheck`.

End commit messages with a `Co-Authored-By` trailer naming the agent/model that did the work, e.g.:

```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```
