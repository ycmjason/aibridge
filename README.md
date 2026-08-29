<div align="center">
  <img src="assets/logo.png" alt="aibridge logo" width="140" />

  # aibridge

  **Let your coding agent use the other AI CLIs on your machine.** Plan, implement, review, red-team, and generate images with Grok, Gemini, Codex, and Claude. No API keys.

  [![skills.sh](https://skills.sh/b/ycmjason/aibridge)](https://skills.sh/ycmjason/aibridge)
  [![npm](https://img.shields.io/npm/v/%40aibridge%2Fcli)](https://www.npmjs.com/package/@aibridge/cli)
  [![node](https://img.shields.io/node/v/%40aibridge%2Fcli)](https://www.npmjs.com/package/@aibridge/cli)
  [![license](https://img.shields.io/github/license/ycmjason/aibridge)](LICENSE)

  Works in **Claude Code**, **Cursor**, **Codex**, **Gemini CLI**, **OpenCode**, and 70+ other agents via [the skills CLI](https://github.com/vercel-labs/skills).
</div>

---

Your coding agent uses one model. Your machine may already have others available
through `grok`, `agy` (Antigravity), `codex`, or `claude`. **aibridge** lets your
agent use those models as planners, implementers, reviewers, one-shot delegates,
and image generators. Each model runs through its existing CLI login.

## Install

Install the skill into your agent:

```bash
npx skills add ycmjason/aibridge
```

The skill runs the CLI on demand with `npx -y @aibridge/cli`. Ask your agent to
"use aibridge", or run a command directly:

```bash
npx -y @aibridge/cli subagent --model xai-grok/grok-4.6 "summarize the architecture of this repo"
```

<sup>Optional: install `aibridge` on your PATH with `npm i -g @aibridge/cli`.</sup>

## Commands

| Command | Use when |
|---|---|
| `aibridge plan --model xai-grok/grok-4.6 --out plan.md "<task>"` | Study the repo and write a detailed plan file |
| `aibridge implement --model google-antigravity/gemini-3.7-flash <plan.md>` | Execute an approved plan and run the project's checks |
| `aibridge review --model xai-grok/grok-4.6 --out review.md [--plan <plan.md>] [--base <ref>]` | Review a diff or, on a clean tree, a plan |
| `aibridge subagent --model xai-grok/grok-4.6 "<task>"` | Delegate a self-contained task or request a second opinion |
| `aibridge image-gen --model openai-codex/gpt-5.6-sol --out out.png "<prompt>"` | Generate and verify a raster image |
| `aibridge models [--json]` | List registered models and their capabilities |
| `aibridge quota` | Show quota remaining for every backend |
| `aibridge runs` | Inspect or watch run logs in `~/.aibridge/runs` |

Use `plan`, `implement`, and `review` as one controlled workflow:

```
aibridge plan --model xai-grok/grok-4.6 --out plan.md "add rate limiting to the API"   # delegate writes plan.md
# → your agent reads, edits, approves the plan
aibridge implement --model google-antigravity/gemini-3.7-flash plan.md                 # another model executes it, runs your gates
aibridge review --model xai-grok/grok-4.6 --out review.md --plan plan.md               # a third seat cross-checks the diff
```

Only the plan path passes between stages, which keeps the plan out of the
orchestrator's conversation context.

## How it works

- **The skill decides; the CLI executes.** The skill covers routing and prompt
  design. The CLI starts the backend, captures output, validates known failure
  modes, and logs the run.
- **Review stays cross-model.** The recommended workflow uses Grok to plan and
  review, and Gemini to implement.
- **Existing logins, no API keys.** Each backend uses its CLI login and quota.
- **Every model has a canonical slug:**
  `<vendor>-<cli>/<model>[-<effort>]`, such as `xai-grok/grok-4.6` or
  `openai-codex/gpt-5.6-sol-high`. There are no aliases. Run
  `aibridge <command> --help` for the current list.

## Tell your agent when to reach for it

aibridge does not decide when to delegate. Put a routing rule in the instructions
file your agent reads (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, and so on):

```markdown
## Delegation gate — decide before you implement

The moment a task becomes implementation you could fully specify, say the call out
loud — **solo** or **aibridge** — plus one line of why. Delegating is the default.
Stay solo only when the edit is smaller than the spec would be, or the work needs
live judgment, your own session's tools, or tight back-and-forth. Never default to
solo silently.

Route by size and risk:

- tiny → solo
- clearly specified and self-contained → `aibridge subagent`
- large or risky → `aibridge plan` → read and approve the plan file →
  `aibridge implement` → `aibridge review`

Delegated work is yours to verify: re-run the real gates before trusting a diff.
Prefer a reviewer from a different model family than whoever implemented.
```

Adjust the models and thresholds for your quotas. Make the routing decision before
implementation starts.

## Requirements

- **Node ≥ 24.11**
- At least one authenticated backend CLI on `PATH`:
  [`grok`](https://github.com/superagent-ai/grok-cli), `agy` (Antigravity),
  [`codex`](https://github.com/openai/codex), or
  [`claude`](https://claude.com/claude-code). Missing CLIs produce install hints.

## Packages

Packages use the [`@aibridge`](https://www.npmjs.com/org/aibridge) scope:
[`@aibridge/cli`](https://www.npmjs.com/package/@aibridge/cli),
`@aibridge/proc`, and one reusable driver for each backend:
`driver-agy`, `driver-grok`, `driver-codex`, and `driver-claude`.

## Security

In tools mode, delegates can read files, write files, and run shell commands with
the same access as the invoking agent. Task content is sent to the selected
provider. Use `--no-tools` for untrusted input. Packages are published from this
public repository through OIDC with
[SLSA provenance](https://www.npmjs.com/package/@aibridge/cli) and no install-time
scripts.

## Contributing & development

Dev docs, architecture, and the working agreements for coding agents live in [`AGENTS.md`](AGENTS.md); design history in [`docs/`](docs/). Quick loop:

```bash
pnpm install
pnpm check && pnpm typecheck && pnpm test
node packages/cli/src/cli.ts --help
```

## License

[MIT](LICENSE) © Jason Yu
