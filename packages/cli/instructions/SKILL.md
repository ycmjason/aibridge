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

{{installed}}

Every model below runs on an installed CLI. A `--model` on a missing backend
exits 2 with an install hint before anything runs.

## Where `--out` goes

- Put permanent project assets in their final location, such as
  `--out public/icons/settings.png`.
- Put drafts and working files in `<repo root>/.aibridge/`. Outside a
  repository, use `.aibridge/` under the current directory.
- Name files by topic. Promote a draft to its real path once it is the keeper.
- Once per session, before the first write: `git check-ignore -q .aibridge/`
  Keep the trailing slash so a directory-only rule matches before the directory
  exists. If the command fails, ask to add `.aibridge/` to `.gitignore`.
- An explicit path from the user wins over all of this.

## Subcommands

| Command | Description |
|---|---|
| `subagent` | Delegate a self-contained task to another model |
| `image-gen` | Generate a raster image with an image-capable model |
| `image-cutout` | Cut the background out of an image into a PNG with real alpha |
| `runs` | Monitor and inspect execution runs |
| `quota` | Show backend quota and reset times |
| `models` | List registered models and capabilities |

`image-gen` and `image-cutout` require `--out` and print a result line.
`subagent` has no `--out`; it prints the delegate's answer to stdout, and
`subagent --out foo.md` exits 2 with `No flag registered for --out`. Redirect
if you want that answer in a file.

## Routing

1. **First word is a subcommand** → use the command-specific section appended
   to this output. If it is missing, run `aibridge skill <subcommand>` before
   taking action.
2. **No subcommand** → infer:
   - an image, icon or graphic to make → `image-gen`;
   - a transparent PNG from an existing image, or from a JPEG model's render →
     `image-cutout`;
   - anything else to hand to another model → `subagent`.

   If genuinely ambiguous, show the table above and ask.
3. **Unsure of the current flags?** Run `aibridge <command> --help`.

## Models

`--model` is required on every command that spends a delegate (`subagent`,
`image-gen`, `image-cutout`); nothing is chosen for you. `quota`, `models` and
`runs` take no `--model`. Installed models:

{{models}}

If the user has said which models to use, follow that. Otherwise pick from the
descriptions above; `aibridge models` lists each model's efforts.

<!-- if:grok -->
- **One grok run at a time.** ~30 req/min, ~1k msgs/day, and every grok model
  shares that budget.
<!-- endif -->
- **A backend on the same provider as the agent you orchestrate from is a last
  resort**: it spends the pool you are already burning. Say so when you reach
  for it.
- Preflight runs before every delegation. `aibridge quota` is the manual check
  before you start several runs.

## Trust

In tools mode, delegates can read files, write files, and run shell commands at
your trust level. The selected provider receives the prompt and any content the
delegate reads. Use `--no-tools` for untrusted input; it disables file and shell
access.
