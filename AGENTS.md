# ai-bridge — AGENTS.md

`ai-bridge` is a small, zero-dependency TypeScript CLI that bridges tasks to **non-Claude AI CLIs** already installed and authed on this machine. The CLI lives inside the skill (`skills/ai-bridge/scripts/`):

- **`node skills/ai-bridge/scripts/cli.ts plan`** → a delegate model studies the repo and writes a detailed implementation plan to a FILE (default planner **`xai-grok/grok-4.5`**, off-budget). The orchestrator reads/edits/approves it — plans are passed between stages as paths, not content.
- **`node skills/ai-bridge/scripts/cli.ts implement`** → a delegate model implements a plan file in place, running the project's real typecheck/tests (default implementer **`google-antigravity/gemini-3.6-flash`** via `agy`, off-budget). Prints the delegate's summary + `git diff --stat`.
- **`node skills/ai-bridge/scripts/cli.ts review`** → a delegate model reviews the working-tree diff against a base ref — with `--plan <file>` as the contract, over-reach is a finding — writing the full report to a file; stdout is just the verdict line (`PASS` / `FINDINGS: …`) + path. With a clean tree and `--plan`, it reviews the plan itself (pre-implementation gate).
- **`node skills/ai-bridge/scripts/cli.ts subagent`** → delegate a self-contained task to another model through the canonical registry: default **`xai-grok/grok-4.5`** via the **Grok CLI** (off-budget on its xAI login; ~30 req/min + ~1k msgs/day caps, one run at a time); **`google-antigravity/gemini-3.6-flash`** via the **Antigravity CLI** (`agy`, off-budget) when grok is capped/dead; **`openai-codex/gpt-5.6-sol`** via the **Codex CLI** (off-budget, ChatGPT login); last-resort **`anthropic-claude/sonnet`** / **`anthropic-claude/opus`** via the **claude CLI** (bill the Claude subscription — for when the off-budget CLIs are quota-dead).
- **`node skills/ai-bridge/scripts/cli.ts image-gen`** → image generation via a model seat (`openai-codex/gpt-5.6-sol` → gpt-image-2, the default; `xai-grok/grok-4.5` → Imagine).

Model slugs are canonical `<vendor>-<cli>/<model>[-<effort>]` (e.g. `openai-codex/gpt-5.6-sol-high`); there are NO short aliases — always pass the full slug. Effort in the slug maps to each backend's own knob; an un-suffixed slug uses the backend's default.

It is the execution layer for the `ai-bridge` agent skill — one router skill with `plan` + `implement` + `review` + `subagent` + `image-gen` subskills (under [`skills/`](skills/), dispatched from `skills/ai-bridge/reference/`): the skill carries the *judgment / prompt-craft*, this CLI owns the *brittle execution* — driving the external CLIs and verifying their output.

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

- **Node 24+, native TypeScript. NO build step, NO `tsx`, NO `ts-node`.** Run `.ts` files directly with `node` (type-stripping is on by default in Node 24). `tsc` is for type-checking only (`pnpm typecheck`).
- **Erasable syntax only** — Node strips types, it does not transform them: no `enum`, no `namespace` with runtime members, no parameter properties, no decorators. `tsconfig` enforces this via `erasableSyntaxOnly`.
- **ESM with explicit `.ts` import extensions** (e.g. `import { app } from "./app.ts"`). `verbatimModuleSyntax` is on → use `import type` for type-only imports.
- **pnpm only, via corepack.** `corepack use pnpm@latest` manages the pinned `packageManager`. Don't use npm or yarn here.

## Commands

| | |
|---|---|
| Run the CLI | `node skills/ai-bridge/scripts/cli.ts <args>` or `pnpm ai-bridge <args>` |
| Help | `node skills/ai-bridge/scripts/cli.ts --help` |
| Plan | `pnpm ai-bridge plan "<task prompt>" [--out <file>]` |
| Implement | `pnpm ai-bridge implement <plan.md>` |
| Review | `pnpm ai-bridge review [--plan <plan.md>] [--base <ref>]` |
| Subagent | `pnpm ai-bridge subagent "<prompt>" [--model <slug>]` |
| Monitor runs | `pnpm ai-bridge runs [--watch]` (logs in `~/.ai-bridge/runs`) |
| Quota (all backends) | `pnpm ai-bridge quota [--json]` — agy group windows (weekly+5h) & per-model, codex 5h/weekly, claude session/weekly. Check BEFORE delegating: agy quota is shared per model GROUP (all Gemini tiers drain together) |
| Check / Type-check / Repo / Test | `pnpm check` · `pnpm typecheck` · `pnpm repojj:check` · `pnpm test` |

## Architecture (node:util parseArgs)

Command orchestration uses Node's built-in **`node:util` `parseArgs`** (zero external dependencies). Strict layering — each layer only imports downward:

- `skills/ai-bridge/scripts/cli.ts` — thin entry: builds the context and calls `runCli(context, process.argv.slice(2))` (from `app.ts`).
- `skills/ai-bridge/scripts/app.ts` — routes to the subcommands (`runCli(ctx, argv)`).
- `skills/ai-bridge/scripts/context.ts` — `LocalContext`, the `this` handed to every command. Extend it as commands need more (loggers, injected runners for tests).
- `skills/ai-bridge/scripts/commands/<name>/command.ts` — command entry: exports `run<Command>(ctx, argv)` which parses arguments using Node's `parseArgs`, validates them using `lib/parsers.ts`, and calls the implementation.
- `skills/ai-bridge/scripts/commands/<name>/impl.ts` — the implementation `function (this: LocalContext, flags, prompt)`. Impls own *policy* (prompt-craft, stdout contracts, exit codes) and contain ZERO backend switches.
- `skills/ai-bridge/scripts/lib/models.ts` — the canonical model registry + resolution (`resolveModel`, `backendModelId`). Shared by `plan`/`implement`/`review`/`subagent`.
- `skills/ai-bridge/scripts/lib/delegate.ts` — the ONE delegation engine: backend dispatch, the agy answer-file protocol, codex `--output-last-message` capture, run logging. All four verb commands call it.
- `skills/ai-bridge/scripts/lib/{agy,grok,claude,codex}.ts` — per-CLI drivers (arg builders + availability probes) over `lib/proc.ts` (spawn/capture).

- **Codex is driven through one shared module** — `skills/ai-bridge/scripts/lib/codex.ts` (version gate + `codex exec` arg builder). `image-gen` and `delegate` go through it; the axis is the sandbox/approval mode (`CodexApproval`): `image-gen` uses `full-auto`, delegation uses `bypass` (tools) or `read-only` (no-tools) — see the gotcha below.

### Adding a subagent model

Edit `skills/ai-bridge/scripts/lib/models.ts`: add an entry to `MODELS` mapping a canonical slug → `{ backend, backendModel, efforts, defaultEffort?, brief }`. Every command surface (`--model <slug>`) picks it up automatically.

## Further reading — research & implementation notes

Full verified findings and per-command implementation recipes live in [`docs/`](docs/):

- [`docs/decisions.md`](docs/decisions.md) — architecture & why skill+CLI (not MCP).
- [`docs/subagent-agy.md`](docs/subagent-agy.md) — agy facts + how to implement `subagent` (incl. the TTY capture problem).
- [`docs/image-gen-codex.md`](docs/image-gen-codex.md) — codex facts + how to implement `image-gen` (incl. real-vs-fake render verification).
- [`docs/plan-codex.md`](docs/plan-codex.md) — the SUPERSEDED three-tier `plan` gate (kept for the codex sandbox-bypass and `--output-schema` findings, which still back `lib/codex.ts`).

## Critical runtime gotchas (read before implementing the impls)

- **`agy` stdout capture — no TTY workaround needed (re-verified agy 1.0.6).** An earlier note claimed `agy -p` only emits to a TTY and hangs when piped/redirected (Antigravity issue #76). Re-tested on agy 1.0.6 from this repo: **false here** — agy emits clean text to a piped, redirected, or fully-headless stdout. So delegation just spawns agy with piped stdio and reads stdout (`runCaptured` in [`skills/ai-bridge/scripts/lib/proc.ts`](skills/ai-bridge/scripts/lib/proc.ts)). If a future agy regresses (symptom: hangs to `--print-timeout`, 0 bytes), fall back to `node-pty` or have agy write its answer to a file. See [`docs/subagent-agy.md`](docs/subagent-agy.md).
- **Verify codex image renders.** A real gpt-image-2 PNG is hundreds of KB–MB; a code-drawn (PIL) substitute is tiny (~10–30 KB). Always check the output file size (> ~100 KB) before declaring success; raw renders are cached under `~/.codex/generated_images/<uuid>/ig_*.png`.
- **agy quota death shows up as an empty answer.** An exhausted model makes `agy -p` return an empty answer after ~6s (the CLI exits 0). The quota preflight is the guard: `preflightModel` refuses before spawning when the agy snapshot says the model group is exhausted, and `pnpm ai-bridge quota` is the two-second manual check (see the quota mechanism headers in `skills/ai-bridge/scripts/lib/agyQuota.ts` / `codexQuota.ts` / `claudeQuota.ts`). Quota is per model GROUP (all Gemini tiers share weekly+5h windows).

## Git — commit & push anytime

This repo's remote is **`git@github.com:fishballapp/ai-bridge.git`** (branch `main`).

**After any meaningful change, commit and push — you do not need to ask.** Keep commits small and messages clear.

- **The global skill install auto-refreshes on commit.** A `post-commit` hook re-runs `pnpm skill:install` (backgrounded, logged to `/tmp/ai-bridge-skill-install.log`) whenever a commit touches `skills/ai-bridge/`; run it manually to sync uncommitted edits. Hooks are wired on `pnpm install` via the `prepare` script: a `pre-commit` hook runs `biome check` on staged files, and a `pre-push` hook runs `pnpm typecheck`. `allowBuilds` (in `pnpm-workspace.yaml`, the pnpm-11 home for settings — not the `package.json` `pnpm` field) permits lefthook's postinstall to fetch its binary.

End commit messages with a `Co-Authored-By` trailer naming the agent/model that did the work, e.g.:

```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```
