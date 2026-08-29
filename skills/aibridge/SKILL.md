---
name: aibridge
description: >-
  Use authenticated AI CLIs on this machine as delegates. Supports one-shot
  tasks, cross-model review, a plan → implement → review workflow, and raster
  image generation through Grok, Gemini, Codex, or Claude seats. Use it for
  well-defined delegation, sizeable or risky implementation, second opinions,
  red-team review, long-context analysis, and image generation or editing.
  Delegate with canonical model slugs such as `xai-grok/grok-4.6` and pass plan
  file paths—not their contents—between stages. Prefer a backend that does not
  share the current agent's quota.
argument-hint: "[plan|implement|review|subagent|image-gen|runs|quota] [options]"
user-invocable: true
allowed-tools:
  - Bash(aibridge *)
  - Bash(npx -y @aibridge/cli *)
---

# aibridge

Use other providers' authenticated AI CLIs as delegates. You choose the task,
model, and prompt; aibridge runs the backend and validates its output. Each run
spends the selected backend's quota.

For rationale, see [reference/why.md](reference/why.md). Read it only when a rule
appears unsuitable.

## Running it

```bash
aibridge <command> [options]              # if `aibridge` is on PATH
npx -y @aibridge/cli <command> [options]  # zero-install, works everywhere
```

Requires Node 24.11 or later. The reference docs use `aibridge`; substitute the
`npx` form when it is not on `PATH`.

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

- Put permanent project assets in their final location, such as
  `--out public/icons/settings.png`.
- Put plans, reviews, and drafts in `<repo root>/.aibridge/`. Outside a
  repository, use `.aibridge/` under the current directory.
- Name files by topic. Promote a draft to its real path once it is the keeper.
- Once per session, before the first write: `git check-ignore -q .aibridge/`
  Keep the trailing slash so a directory-only rule matches before the directory
  exists. If the command fails, ask to add `.aibridge/` to `.gitignore`.
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

`--model` is required on every command that spends a delegate (`plan`,
`implement`, `review`, `subagent`, `image-gen`); nothing is chosen for you.
`quota`, `models` and `runs` take no `--model`. Starting points, not
benchmarks:

| slug | plan | implement | review | image-gen |
|---|---|---|---|---|
| `xai-grok/grok-4.6` | ✅ small–mid, well-scoped | ○ | ✅ | ○ JPEG |
| `xai-grok/grok-4.5` | ○ | ✅ any fidelity | ○ | ○ JPEG |
| `openai-codex/gpt-5.6-sol` | ✅ mid–big, ambiguous | ○ | ✅ | ✅ PNG |
| `anthropic-claude/opus-5` | ✅ mid–big, ambiguous | ○ | ✅ | ✗ |
| `google-antigravity/gemini-3.7-flash` | ○ | ✅ needs high–xhigh detail | ○ | ○ JPEG |
| `anthropic-claude/sonnet-5` | ○ | ✅ needs high detail | ○ | ✗ |

✅ recommended · ○ supported · ✗ unsupported. For `plan`, the qualifier describes
how much ambiguity the model can resolve. For `implement`, it describes how
detailed the plan must be.
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

In tools mode, delegates can read files, write files, and run shell commands at
your trust level. The selected provider receives the prompt and any content the
delegate reads. Use `--no-tools` for untrusted input; it disables file and shell
access.
