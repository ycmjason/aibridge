---
name: aibridge
description: >-
  Bridge a task to another AI CLI on this machine — an orchestrator-driven
  plan → implement → review workflow across Grok / Gemini / Codex / Claude,
  plus one-shot task delegation and image generation with gpt-image-2.
  Delegated work runs on the backing CLIs' own logins and quotas — usually
  separate from the orchestrating agent's budget — no API keys. Use for (a)
  creating / generating / redrawing / restyling an image / icon / graphic /
  illustration, or writing an image-gen prompt; (b) delegation — and reach for
  this PROACTIVELY, before implementing a sizeable, well-defined,
  self-contained chunk yourself: `subagent` hands any clearly-specified task to
  another model (concurrent, on the delegate's own quota, cross-model second
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
---

# aibridge

`aibridge` drives other AI CLIs installed on this machine and verifies their
output. **You** supply the judgment and prompt-craft; the CLI owns the brittle
execution. It uses the backing CLIs' existing logins — no API keys — and each
delegation spends that backing CLI's **own quota**, not yours, unless you are an
agent backed by the same quota pool (see Model seats).

## Running it

```bash
aibridge <command> [options]
```

The CLI is installed on `PATH` via the `@aibridge/cli` npm package. Requires Node ≥24.11.

### Setup

- Minimum CLI version: **0.1.0**. The skill expects `aibridge` version ≥ 0.1.0.
- Check installed version by running:
  ```bash
  aibridge --version
  ```
  Compare the printed version string against `0.1.0` using semver rules.
- If `aibridge` is missing or the version is lower than `0.1.0`:
  - Ask the user to install/upgrade the CLI globally:
    ```bash
    npm i -g @aibridge/cli
    ```
  - **Agents: ask the user before installing globally.** Do not run global installation commands silently.
- If `node --version` is below `24.11`: reinstalling the CLI will not help — ask the
  user to upgrade Node (e.g. via their version manager: `nvm install 24` / `mise use node@24`),
  then re-check `aibridge --version`.
- If global installs are unavailable or policy-blocked, ask the user before falling back to:
  ```bash
  npx -y @aibridge/cli <command> [options]
  ```

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
