# aibridge — AGENTS.md

`aibridge` is a TypeScript CLI for delegating work to authenticated AI CLIs on
the same machine. It is a pnpm monorepo under `packages/*`. The CLI, process
utilities, and backend drivers are published under `@aibridge/*`.

## Delegation workflow

- Small edits may stay with the orchestrator.
- Use `subagent` for a well-defined, self-contained task.
- Use `plan` → read and approve → `implement` → `review` for sizeable or risky
  implementation.
- Keep the reviewer in a different model family from the implementer.

The evergreen loader at [`skills/aibridge/SKILL.md`](skills/aibridge/SKILL.md)
loads canonical routing and prompt guidance from the current CLI package. Do not
duplicate model recommendations here. During repository development, run the
source CLI directly with `node packages/cli/src/cli.ts`; do not test through the
published package.

## Working style: act as Jason's CTO

The orchestrating agent owns architecture. For sizeable or risky implementation,
it drives `plan` → read and approve → `implement` → `review`.

- **Orchestrator:** define module boundaries, interfaces, data flow, and naming
  before delegation. The plan is the contract. Resolve every structural
  question before `implement`; use `review --plan` for large or risky designs.
  Do not leave unresolved product or structural decisions to the implementer.
- **Planner and reviewer:** expand the design against the repository and test
  the resulting diff. Grok is recommended. The reviewer must use a different
  model family from the implementer.
- **Implementer:** execute a complete, self-contained plan. It may choose local
  names, helper boundaries, and equivalent implementation mechanics. If it
  needs product or structural direction, the plan is incomplete.

Architecture debt belongs to the orchestrator. If a change ships with known
debt, state it and propose the cleanup.

## Hard rules

- **Node 24.11+, native TypeScript in packages for dev. NO build step for dev (`node packages/cli/src/cli.ts`), NO `tsx`, NO `ts-node`.** Run `.ts` files directly with `node` (type-stripping is on by default in Node 24). `tsc` is for type-checking only (`pnpm typecheck`).
- **Erasable syntax only** — Node strips types, it does not transform them: no `enum`, no `namespace` with runtime members, no parameter properties, no decorators. `tsconfig` enforces this via `erasableSyntaxOnly`.
- **ESM with explicit `.ts` import extensions** (e.g. `import { app } from "./app.ts"`). `verbatimModuleSyntax` is on → use `import type` for type-only imports.
- **pnpm only, no corepack.** The version is pinned in `devEngines.packageManager`; pnpm 11 downloads and re-execs that version itself (`onFail: download`). Install pnpm standalone (`curl -fsSL https://pnpm.io/install.sh | sh -`), upgrade with `pnpm self-update` + bump the pin. Don't use npm or yarn here.
- **Published packages use real `dependencies`.** Dependencies use `workspace:*` / `catalog:` in workspace manifests and are rewritten to concrete versions on publish.
- **Per-package `dist/` builds.** Each package builds to `dist/` via tsdown. `publishConfig` overrides exports and bin for published packages.
- **Root stays `private: true`. Version bump = release trigger** for the OIDC publish workflow on `main`.
- **The installed skill is an evergreen prose-only loader.** Canonical skill
  instructions ship in `@aibridge/cli`; executable logic remains in the CLI.
- **`--out` goes to the asset's real home if the project keeps it** (e.g. an icon straight into `public/icons/`); otherwise `<repo root>/.aibridge/` — the sketchpad for plans, reviews, and draft images, in the repo the user is already in. Keep it gitignored (this repo does) and never commit its contents.

## Commands

| | |
|---|---|
| Run CLI (dev) | `node packages/cli/src/cli.ts <args>` or `pnpm aibridge <args>` |
| Run CLI (global link) | `aibridge <args>` after one-time `pnpm link --global` from `packages/cli` |
| Run CLI (published) | `aibridge <args>` or `npx -y @aibridge/cli <args>` |
| Help | `node packages/cli/src/cli.ts --help` |
| Build all dists | `pnpm build` |
| Plan | `pnpm aibridge plan --model xai-grok/grok-4.6 --out .aibridge/plan.md "<task prompt>"` |
| Implement | `pnpm aibridge implement --model google-antigravity/gemini-3.7-flash .aibridge/plan.md` |
| Review | `pnpm aibridge review --model xai-grok/grok-4.6 --out .aibridge/review.md [--plan .aibridge/plan.md] [--base <ref>]` |
| Subagent | `pnpm aibridge subagent --model xai-grok/grok-4.6 "<prompt>"` |
| Models | `pnpm aibridge models [--json]` — list every model seat in the registry (efforts, image format, pinned backend model id) |
| Monitor runs | `pnpm aibridge runs [--watch]` (logs in `~/.aibridge/runs`) |
| Quota (all backends) | `pnpm aibridge quota [--json]` — inspect quota before a multi-stage pipeline; individual commands preflight automatically |
| Skill instructions | `pnpm aibridge skill [plan|implement|review|subagent|image-gen|why]` |
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
- `packages/cli/src/transparency.ts` — the `--transparent` mechanism: the per-strategy prompt clauses plus `chromaKeyToPng` (sharp). Pure mechanism — no backend switches, no stdout; the impl decides which strategy a seat gets from `imageAlphaFor`.
- `packages/proc` + `packages/driver-{agy,grok,codex,claude}` — workspace packages driving each backend independently (zero external runtime dependencies). Usually that means spawning its CLI. `driver-grok` also talks to `api.x.ai` over HTTP directly for images and quota, because those are single requests and the CLI's agent loop only added failure modes (see docs/decisions.md). Keeping these packages dependency-free is a real constraint: it is why `generateImage.ts` sends reference images uncompressed instead of pulling in `sharp`.

### Adding a subagent model

Edit `packages/cli/src/models.ts`: add an entry to `MODELS` mapping a canonical slug → `{ backend, backendModel, efforts, defaultEffort?, brief }`. Every command surface (`--model <slug>`) picks it up automatically.

## Further reading — research & implementation notes

Full verified findings and per-command implementation recipes live in [`docs/`](docs/):

- [`docs/decisions.md`](docs/decisions.md) — active decisions + one-liner history.
- [`docs/backends.md`](docs/backends.md) — operational backend facts (agy workspace/TTY/quota, codex sandbox/redraw/schema, grok/claude caps).

## Runtime behavior

Backend-specific behavior belongs in [`docs/backends.md`](docs/backends.md) and
must be enforced by drivers or tests where possible. Read that document before
changing a driver, quota handling, output capture, or image generation.

## Git — commit & push anytime

This repo's remote is **`git@github.com:ycmjason/aibridge.git`** (branch `main`).

Commit completed, meaningful changes without asking. Push only after the
relevant checks pass. Keep commits small and messages clear.

- **The global skill install auto-refreshes on commit.** A `post-commit` hook re-runs `pnpm skill:install` (backgrounded, logged to `/tmp/aibridge-skill-install.log`) whenever a commit touches `skills/aibridge/`; run it manually to sync uncommitted edits. Hooks are wired on `pnpm install` via the `prepare` script: a `pre-commit` hook runs `biome check` on staged files, and a `pre-push` hook runs `pnpm typecheck`.
