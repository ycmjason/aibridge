---
name: aibridge
description: >-
  Drive models from OTHER providers as your delegates — bridge a task to
  another AI CLI on this machine: an orchestrator-driven plan → implement →
  review workflow across Grok / Gemini / Codex / Claude, one-shot cross-model
  delegation, and capabilities your own provider may lack, like real image
  generation with gpt-image-2 or Grok Imagine. Runs on the backing CLIs'
  existing logins — no API keys. Use for (a)
  creating / generating / redrawing / restyling an image / icon / graphic /
  illustration, or writing an image-gen prompt; (b) delegation — and reach for
  this PROACTIVELY, before implementing a sizeable, well-defined,
  self-contained chunk yourself: `subagent` hands any clearly-specified task to
  another model (concurrent, with different training and blind spots than
  yours — cross-model second
  opinion / red-team / long-context analysis); (c) sizeable or risky
  implementation work — `plan` has a model expand your intent into a detailed
  plan FILE against the real codebase, you read/approve/edit it, `implement`
  executes it in place running the real gates, and `review` cross-checks the
  resulting diff against the plan contract (over-reach is a finding) or
  pre-reviews the plan before any code is written. File PATHS, not contents,
  travel between stages — cheap on your output tokens. Models use canonical
  effort-aware slugs (`xai-grok/grok-4.5`,
  `google-antigravity/gemini-3.6-flash`, `openai-codex/gpt-5.6-sol-high`, …) —
  no short aliases, always the full slug. Quota is relative to whoever runs
  this skill: a backend that shares YOUR own quota (`anthropic-claude/*` for
  Claude-based agents — it bills the claude CLI's subscription —
  `google-antigravity/*` for Antigravity-based agents, …) is a last resort;
  say so when you reach for it.
argument-hint: "[plan|implement|review|subagent|image-gen|runs|quota] [options]"
user-invocable: true
allowed-tools:
  - Bash(aibridge *)
  - Bash(npx -y @aibridge/cli *)
---

# aibridge

`aibridge` lets you drive models from other providers: it spawns the AI CLIs
installed on this machine and verifies their output. **You** supply the judgment
and prompt-craft; the CLI owns the brittle execution. Delegates bring what you
may not have — different training and blind spots (real cross-checking), image
rendering, heavyweight reasoning seats — and run concurrently on the backing
CLIs' existing logins, no API keys. Each delegation spends that backing CLI's
own quota (see Model seats for the one case where that quota is yours).

## Running it

```bash
aibridge <command> [options]              # if `aibridge` is on PATH
npx -y @aibridge/cli <command> [options]  # zero-install — works everywhere
```

No installation step is required: the second form fetches the CLI on demand from
npm. The reference docs below write every command as `aibridge <command>` — if
`aibridge` is not on PATH, substitute `npx -y @aibridge/cli` for `aibridge`;
everything else is identical. Requires Node ≥24.11.

### Setup (a one-time probe, not an install)

- Minimum CLI version: **0.1.0**.
- Probe: run `aibridge --version`; if the command is missing, run
  `npx -y @aibridge/cli --version` and use the npx form from then on. Compare
  the printed version against `0.1.0` (semver).
- Below minimum via npx (stale cache): re-run as `npx -y @aibridge/cli@latest`.
  Below minimum via a global install: suggest the user update with
  `npm i -g @aibridge/cli`.
- If `node --version` is below `24.11`: the CLI cannot run — ask the user to
  upgrade Node (e.g. `nvm install 24` / `mise use node@24`).
- Optional, for users who want the `aibridge` command directly on PATH:
  `npm i -g @aibridge/cli`. **Ask the user before running global installs.**

Requires the backing CLIs on `PATH` and authed: **`grok`** (default planner/reviewer), **`agy`** (default implementer), **`codex`** (image-gen + `openai-codex/*` delegation), and optionally **`claude`** for the `anthropic-claude/*` delegation tier.

## Subcommands

| Command | Description | Reference |
|---|---|---|
| `plan` | Expand a task into a detailed implementation plan file | [reference/plan.md](reference/plan.md) |
| `implement` | Implement a plan file in place (edits the working tree, runs real gates) | [reference/implement.md](reference/implement.md) |
| `review` | Review the working-tree diff (or a plan) against a plan contract | [reference/review.md](reference/review.md) |
| `subagent` | Delegate a self-contained task to another model | [reference/subagent.md](reference/subagent.md) |
| `image-gen` | Generate a raster image via a model seat (codex backend → gpt-image-2, grok backend → Imagine) | [reference/image-gen.md](reference/image-gen.md) |
| `runs` | Monitor and inspect execution runs | — |
| `quota` | Show backend quota and reset times (agy, codex, claude) | — |

## Routing

1. **First word is a subcommand name** → load that reference file and follow it.
   **This is non-negotiable**: the reference holds the prompt-craft that makes the
   output good — skipping it produces generic results.
2. **No subcommand given** → infer from the request:
   - an image / icon / graphic to make → `image-gen`;
   - a clearly-specified, self-contained task to hand to another model, or a
     cross-model second opinion / red-team → `subagent`;
   - a **sizeable or risky** piece of implementation work → the three-verb
     workflow: `plan` → *you read, edit, and approve the plan file* →
     `implement` → `review --plan <file>`. For high-risk designs, add a
     pre-implementation gate: `review --plan` on a clean tree reviews the plan
     itself.

   If genuinely ambiguous, show the table above and ask.
3. **Unsure of the current flags?** Run `aibridge <command> --help` — the surface grows over time (new models, new flags).

## Model seats (defaults encode this — keep it)

- **Planner / reviewer seat: grok** (`xai-grok/grok-4.5`) — default for `plan`
  and `review`. Runs on its own xAI login, but aggressively capped (~30
  req/min, ~1k msgs/day, no local usage probe): run ONE grok stage at a time.
- **Implementer seat: gemini** (`google-antigravity/gemini-3.6-flash`, effort
  high) — default for `implement`. A pure do-er for fully-specified plans.
- **Keep the reviewer cross-model from the implementer** — a model reviewing
  its own diff shares its own blind spots. The defaults already differ; if you
  override one seat, check the other. The same logic applies to you: for work
  you authored yourself, prefer a reviewer outside your own model family.
- **Quota is orchestrator-relative.** Every backend spends its own CLI's
  login/quota. A backend that shares the quota of the agent running this skill
  (`anthropic-claude/*` for Claude-based agents — it bills the claude CLI's
  subscription — `google-antigravity/*` for Antigravity-based agents, …) is a
  LAST RESORT: say so before using it.
- **Swap seats on quota**: `openai-codex/gpt-5.6-sol[-<effort>]` (own ChatGPT
  login) is the usual alternate for any seat.
- Quota preflight runs automatically before every delegation;
  `aibridge quota` is the manual two-second check when planning a pipeline.
