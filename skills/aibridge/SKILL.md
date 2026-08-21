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
  effort-aware slugs (`xai-grok/grok-4.6`,
  `google-antigravity/gemini-3.7-flash`, `openai-codex/gpt-5.6-sol-high`, …) —
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

Spawn the other providers' AI CLIs on this machine as delegates. You supply the
judgment and prompt-craft; the CLI drives the backing CLI and verifies its
output. Each delegation spends that backing CLI's own login and quota.

Why the rules below exist: [reference/why.md](reference/why.md). Read it only
when a rule looks wrong for your case.

## Running it

```bash
aibridge <command> [options]              # if `aibridge` is on PATH
npx -y @aibridge/cli <command> [options]  # zero-install, works everywhere
```

Needs Node >=24.11. The reference docs all write `aibridge`; substitute the npx
form if it is not on PATH.

### One-time probe

1. Run `aibridge --version`. If the command is missing, run
   `npx -y @aibridge/cli --version` and use the npx form from then on.
2. Below `0.1.0`: re-run as `npx -y @aibridge/cli@latest` (stale npx cache), or
   ask the user to `npm i -g @aibridge/cli` (global install).
3. `node --version` below `24.11`: stop and ask the user to upgrade
   (`nvm install 24` / `mise use node@24`).
4. **Ask before running any global install.**

Backing CLIs must be on `PATH` and authed: `grok`, `agy` (Antigravity), `codex`,
`claude`. Any subset works; commands fail fast with install hints.

## Where `--out` goes

- A file the project keeps goes to its real home: `--out public/icons/settings.png`.
- Everything else goes to `<repo root>/.aibridge/`: `--out .aibridge/auth-plan.md`,
  `.aibridge/auth-review.md`, `.aibridge/hero-draft.png`. Outside a repo, use
  `.aibridge/` under the cwd.
- Name files by topic. Promote a draft to its real path once it is the keeper.
- Once per session, before the first write: `git check-ignore -q .aibridge/`
  (keep the trailing slash, or the check misses a dir-only rule while the
  directory does not exist yet). Non-zero means tell the user to add `.aibridge/` to
  `.gitignore`, and offer to do it.
- An explicit path from the user wins over all of this.

## Subcommands

| Command | Description | Reference |
|---|---|---|
| `plan` | Expand a task into a detailed implementation plan file | [reference/plan.md](reference/plan.md) |
| `implement` | Implement a plan file in place (edits the working tree, runs real gates) | [reference/implement.md](reference/implement.md) |
| `review` | Review a diff (working tree, or any commit range via `--base`) or a plan against a plan contract | [reference/review.md](reference/review.md) |
| `subagent` | Delegate a self-contained task to another model | [reference/subagent.md](reference/subagent.md) |
| `image-gen` | Generate a raster image via a model seat (codex, agy, or grok backend) | [reference/image-gen.md](reference/image-gen.md) |
| `runs` | Monitor and inspect execution runs | — |
| `quota` | Show backend quota and reset times (grok, agy, codex, claude) | — |
| `models` | List every model seat in the registry (slug, efforts, image format) | — |

`plan`, `review` and `image-gen` require `--out` and print only a verdict/path
line. `subagent` and `implement` have no `--out`; they print the delegate's
answer to stdout, and `subagent --out foo.md` exits 2 with
`No flag registered for --out`. Redirect if you want that answer in a file.

## Routing

1. **First word is a subcommand** → load that reference file and follow it. This
   is non-negotiable: the reference holds the prompt-craft. Skipping it produces
   generic results.
2. **No subcommand** → infer:
   - an image, icon or graphic to make → `image-gen`;
   - a self-contained task, cross-model second opinion, or red-team → `subagent`;
   - sizeable or risky implementation work → `plan` → *you read, edit and
     approve the plan file* → `implement` → `review --plan <file>`. For
     high-risk designs only, add a gate before any code is written:
     `review --plan` on a clean tree.

   If genuinely ambiguous, show the table above and ask.
3. **Unsure of the current flags?** Run `aibridge <command> --help`.

## Model seats

`--model` is required everywhere; nothing is chosen for you. Starting points,
not benchmarks:

| slug | plan | implement | review | image-gen |
|---|---|---|---|---|
| `xai-grok/grok-4.6` | ✅ small–mid, well-scoped | ○ | ✅ | ○ JPEG |
| `xai-grok/grok-4.5` | ○ | ✅ any fidelity | ○ | ○ JPEG |
| `openai-codex/gpt-5.6-sol` | ✅ mid–big, ambiguous | ○ | ✅ | ✅ PNG |
| `anthropic-claude/opus-5` | ✅ mid–big, ambiguous | ○ | ✅ | ✗ |
| `google-antigravity/gemini-3.7-flash` | ○ | ✅ needs high–xhigh detail | ○ | ○ JPEG |
| `anthropic-claude/sonnet-5` | ○ | ✅ needs high detail | ○ | ✗ |

✅ recommended · ○ works · ✗ not supported. For `plan` the qualifier is how much
ambiguity the seat absorbs; for `implement` it is how specified the plan must be.
**If the task fits no row, or the user has said how they want work routed, ask
rather than guess.**

Also registered: `openai-codex/gpt-5.6-terra` / `-luna` (cheaper coding tiers),
`anthropic-claude/fable-5` (hardest, longest-running work),
`anthropic-claude/haiku-4-5` (quick answers),
`google-antigravity/gemini-3.6-flash`, `google-antigravity/gemini-3.1-pro`
(`-high`/`-low` only), and agy's `claude-sonnet-4-6` /
`claude-opus-4-6-thinking` / `gpt-oss-120b-medium`. Run `aibridge models
[--json]` for exact per-seat facts, or `aibridge <command> --help` for the list.

- **One grok stage at a time.** ~30 req/min, ~1k msgs/day, and both tiers share
  that budget.
- **`grok-4.6` plans and reviews, `grok-4.5` implements.** They are different
  seats, not old and new.
- **The reviewer must be a different model family from whoever implemented**,
  including when that was you.
- **A backend that shares YOUR quota is a last resort**: `anthropic-claude/*`
  for Claude-based agents, `google-antigravity/*` for Antigravity-based agents.
  Say so when you reach for it.
- **Swap on quota**: `openai-codex/gpt-5.6-sol[-<effort>]` is the usual alternate.
- Preflight runs before every delegation. `aibridge quota` is the manual check
  before you pipeline several stages.

## Trust

Delegates run at your trust level: in tools mode they read/write files and run
shell. The prompt, plus whatever the delegate reads, goes to that provider. Do
not delegate content the user would not send there. Pass `--no-tools` for
untrusted input, which leaves the delegate reasoning only, with no file or shell
access.
