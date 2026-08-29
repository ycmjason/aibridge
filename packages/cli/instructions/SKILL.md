# aibridge

Use other providers' authenticated AI CLIs as delegates. You choose the task,
model, and prompt; aibridge runs the backend and validates its output. Each run
spends the selected backend's quota.

Load the `why` topic only when a rule appears unsuitable.

## Running it

The output header defines the exact command runner for this instruction set.
Examples below abbreviate that runner as `aibridge`; always substitute the exact
runner. This keeps instructions and executable behavior on the same version.

Requires Node 24.11 or later. If Node is older, ask the user to upgrade with
`nvm install 24` or `mise use node@24`. Ask before any global install.

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

| Command | Description |
|---|---|
| `plan` | Expand a task into a detailed implementation plan file |
| `implement` | Implement a plan file in place and run the real checks |
| `review` | Review a diff, commit range, or plan contract |
| `subagent` | Delegate a self-contained task to another model |
| `image-gen` | Generate a raster image with a Codex, Antigravity, or Grok seat |
| `runs` | Monitor and inspect execution runs |
| `quota` | Show backend quota and reset times |
| `models` | List registered model seats and capabilities |

`plan`, `review` and `image-gen` require `--out` and print only a verdict/path
line. `subagent` and `implement` have no `--out`; they print the delegate's
answer to stdout, and `subagent --out foo.md` exits 2 with
`No flag registered for --out`. Redirect if you want that answer in a file.

## Routing

1. **First word is a subcommand** → use the command-specific section appended
   to this output. If it is missing, run `aibridge skill <subcommand>` before
   taking action.
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
