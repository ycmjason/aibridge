---
name: aibridge
description: >-
  Drive models from OTHER providers as your delegates — bridge a task to
  another AI CLI on this machine: an orchestrator-driven plan → implement →
  review workflow across Grok / Gemini / Codex / Claude, one-shot cross-model
  delegation, and capabilities your own provider may lack, like real image
  generation on a Codex, Antigravity, or Grok seat. Runs on the backing CLIs'
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

Requires the backing CLIs on `PATH` and authed: **`grok`** (recommended planner/reviewer — pass it explicitly), **`agy`** (recommended implementer — pass it explicitly), **`codex`** (recommended image-gen seat — pass it explicitly, plus `openai-codex/*` delegation), and optionally **`claude`** for the `anthropic-claude/*` delegation tier.

## Subcommands

| Command | Description | Reference |
|---|---|---|
| `plan` | Expand a task into a detailed implementation plan file | [reference/plan.md](reference/plan.md) |
| `implement` | Implement a plan file in place (edits the working tree, runs real gates) | [reference/implement.md](reference/implement.md) |
| `review` | Review the working-tree diff (or a plan) against a plan contract | [reference/review.md](reference/review.md) |
| `subagent` | Delegate a self-contained task to another model | [reference/subagent.md](reference/subagent.md) |
| `image-gen` | Generate a raster image via a model seat (codex, agy, or grok backend) | [reference/image-gen.md](reference/image-gen.md) |
| `runs` | Monitor and inspect execution runs | — |
| `quota` | Show backend quota and reset times (grok, agy, codex, claude) | — |
| `models` | List every model seat in the registry (slug, efforts, image format) | — |

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

## Model seats (recommended choices — pass them explicitly)

`--model` is required on every command; nothing is chosen for you. Rough starting
points — **not** benchmarks, just what tends to work:

| slug | plan | implement | review | image-gen |
|---|---|---|---|---|
| `xai-grok/grok-4.5` | ✅ small–mid, well-scoped | ✅ any fidelity | ✅ | ○ JPEG |
| `openai-codex/gpt-5.6-sol` | ✅ mid–big, ambiguous | ○ | ✅ | ✅ PNG |
| `anthropic-claude/opus-5` | ✅ mid–big, ambiguous | ○ | ✅ | ✗ |
| `google-antigravity/gemini-3.6-flash` | ○ | ✅ needs high–xhigh detail | ○ | ○ JPEG |
| `anthropic-claude/sonnet-5` | ○ | ✅ needs high detail | ○ | ✗ |

✅ recommended · ○ works · ✗ not supported. For `plan` the qualifier is how much
ambiguity the seat absorbs; for `implement` it is how specified the plan must be.

**These are rough recommendations, not measurements. If the task doesn't clearly
fit a row — or the user has said how they want work routed — ask the user rather
than guessing.**

Other registered seats, same rules: `openai-codex/gpt-5.6-terra` / `-luna`
(cheaper coding tiers), `anthropic-claude/fable-5` (hardest, longest-running
work), `anthropic-claude/haiku-4-5` (quick answers),
`google-antigravity/gemini-3.1-pro` (`-high`/`-low` only), and agy's
`claude-sonnet-4-6` / `claude-opus-4-6-thinking` / `gpt-oss-120b-medium` —
Claude- and GPT-grade work on Antigravity's quota, which matters when the
same-provider seats are the ones you are avoiding. Run `aibridge models [--json]` for exact per-seat facts (accepted efforts, image format, pinned model ID). `aibridge <command> --help`
lists every seat.

- **grok is aggressively capped** (~30 req/min, ~1k msgs/day; `aibridge quota` tracks weekly credit usage): run ONE grok stage at a time. It is the only seat that tolerates a vague brief, so spend it where the input is unclear rather than where a detailed plan already exists.
- **Keep the reviewer cross-model from the implementer** — a model reviewing
  its own diff shares its own blind spots. The recommended seats already differ; if you
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

## Security & trust model

- aibridge performs real delegation by design: in tools mode the backing CLIs
  read/write files and run shell — at the SAME trust level as the agent
  running this skill. Nothing here grants more access than the user already
  granted their agent and those CLIs when they installed and authed them.
- Delegation sends the task prompt (and whatever the delegate chooses to read)
  to the backing CLI's provider. Do not delegate content the user would not
  send to that provider; use `--no-tools` for untrusted input — the delegate
  gets no file or shell access, reasoning only.
- The CLI is `@aibridge/cli` on npm, published with SLSA provenance via OIDC
  from the public repo (https://github.com/ycmjason/aibridge). Its packages
  have no install-time scripts and a single runtime dependency tree you can
  audit.
- Nothing runs until the user has installed this skill and the CLI executes
  via npx/npm under their own account.
