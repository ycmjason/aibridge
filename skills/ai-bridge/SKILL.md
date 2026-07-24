---
name: ai-bridge
description: >-
  Bridge a task to a non-Claude AI CLI on this machine — an orchestrator-driven
  plan → implement → review workflow across Grok / Gemini / Codex, plus one-shot
  task delegation and image generation with gpt-image-2. Delegated work runs on
  the backing CLIs' existing logins, OFF your own token budget — no API keys.
  Use for (a) creating / generating / redrawing / restyling an image / icon /
  graphic / illustration, or writing an image-gen prompt; (b) delegation — and
  reach for this PROACTIVELY, before implementing a sizeable, well-defined,
  self-contained chunk yourself: `subagent` hands any clearly-specified task to
  another model (concurrent, off-budget, cross-model second opinion / red-team /
  long-context analysis); (c) sizeable or risky implementation work — `plan` has
  a model expand your intent into a detailed plan FILE against the real
  codebase, you read/approve/edit it, `implement` executes it in place running
  the real gates, and `review` cross-checks the resulting diff against the plan
  contract (over-reach is a finding) or pre-reviews the plan before any code is
  written. File PATHS, not contents, travel between stages — cheap on your
  output tokens. Models use canonical effort-aware slugs
  (`xai-grok/grok-4.5`, `google-antigravity/gemini-3.6-flash`,
  `openai-codex/gpt-5.6-sol-high`, …) — no short aliases, always the full
  slug. The `anthropic-claude/*` slugs BILL the user's
  Claude subscription — last resort for when the off-budget CLIs are
  quota-dead; say so when you reach for them.
argument-hint: "[plan|implement|review|subagent|image-gen|runs|quota] [options]"
user-invocable: true
allowed-tools:
  - Bash(node *)
---

# ai-bridge

`ai-bridge` drives non-Claude AI CLIs and verifies their output. **You** supply the
judgment and prompt-craft; the CLI owns the brittle execution. It uses the backing
CLIs' existing logins — no API keys, and the delegated work runs **off your own
token budget**.

## Running it

The CLI ships **inside this skill** as a committed, self-contained ESM bundle that
**Node ≥24** runs directly with zero dependencies. Invoke it from this
skill's own directory:

```bash
node <skill-dir>/scripts/cli.mjs <command> [options]
```

`<skill-dir>` is the directory this `SKILL.md` lives in (resolve it to an absolute
path). For brevity the reference files below write the command as
`ai-bridge <command> …` — **substitute the `node <skill-dir>/scripts/cli.mjs`
invocation**. Requires the backing CLIs on `PATH` and authed: **`grok`** (default
planner/reviewer), **`agy`** (default implementer), **`codex`** (image-gen +
`openai-codex/*` delegation), and optionally **`claude`** for the on-budget
fallback tier.

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
3. **Unsure of the current flags?** Run `node <skill-dir>/scripts/cli.mjs <command>
   --help` — the surface grows over time (new models, new flags).

## Model seats (defaults encode this — keep it)

- **Planner / reviewer seat: grok** (`xai-grok/grok-4.5`) — default for `plan`
  and `review`. Off-budget on its xAI login, but aggressively capped (~30
  req/min, ~1k msgs/day, no local usage probe): run ONE grok stage at a time.
- **Implementer seat: gemini** (`google-antigravity/gemini-3.6-flash`, effort
  high) — default for `implement`. A pure do-er for fully-specified plans.
- **Keep the reviewer cross-model from the implementer** — a model reviewing
  its own diff shares its own blind spots. The defaults already differ; if you
  override one seat, check the other.
- **Swap seats on quota**: `openai-codex/gpt-5.6-sol[-<effort>]` is the
  off-budget alternate for any seat; `anthropic-claude/sonnet|opus` BILL the
  Claude subscription — last resort, and say so.
- Quota preflight runs automatically before every delegation;
  `ai-bridge quota` is the manual two-second check when planning a pipeline.
