<div align="center">
  <img src="assets/logo.png" alt="aibridge logo" width="140" />

  # aibridge

  **Let your coding agent use the other AI CLIs on your machine.** Hand off tasks, get second opinions, and generate images with Grok, Gemini, Codex, and Claude. No API keys.

  [![skills.sh](https://skills.sh/b/ycmjason/aibridge)](https://skills.sh/ycmjason/aibridge)
  [![npm](https://img.shields.io/npm/v/%40aibridge%2Fcli)](https://www.npmjs.com/package/@aibridge/cli)
  [![node](https://img.shields.io/node/v/%40aibridge%2Fcli)](https://www.npmjs.com/package/@aibridge/cli)
  [![license](https://img.shields.io/github/license/ycmjason/aibridge)](LICENSE)

  Works in **Claude Code**, **Cursor**, **Codex**, **Gemini CLI**, **OpenCode**, and 70+ other agents via [the skills CLI](https://github.com/vercel-labs/skills).
</div>

---

Your coding agent uses one model. Your machine may already have others available
through `grok`, `agy` (Antigravity), `codex`, or `claude`. **aibridge** lets your
agent hand tasks to those models and generate images with them. Each model runs
through its existing CLI login.

## Install

Install the skill into your agent:

```bash
npx skills add ycmjason/aibridge
```

The installed skill is a small evergreen loader. It asks the latest CLI package
for canonical instructions, then pins that exact version for the rest of the
session. Instructions and executable behavior therefore update together.
Ask your agent to "use aibridge", or run a command directly:

```bash
npx -y @aibridge/cli subagent --model xai-grok/grok-4.6 "summarize the architecture of this repo"
```

<sup>Optional: install `aibridge` on your PATH with `npm i -g @aibridge/cli`.</sup>

## Commands

| Command | Use when |
|---|---|
| `aibridge subagent --model xai-grok/grok-4.6 "<task>"` | Delegate a self-contained task or request a second opinion |
| `aibridge image-gen --model openai-codex/gpt-5.6-sol --out out.png "<prompt>"` | Generate and verify a raster image |
| `aibridge image-cutout --model google-antigravity/gemini-3.7-flash --out out.png in.jpg ["<what to keep>"]` | Cut the background out into a PNG with real alpha |
| `aibridge models [--json]` | List registered models and their capabilities |
| `aibridge quota` | Show quota remaining for every backend |
| `aibridge runs` | Inspect or watch run logs in `~/.aibridge/runs` |
| `aibridge skill [topic]` | Print the canonical agent instructions bundled with this CLI version |

## How it works

- **One package owns instructions and execution.** The installed skill only
  bootstraps the latest package. That package supplies the instructions, starts
  the backend, validates known failure modes, and logs the run.
- **Existing logins, no API keys.** Each backend uses its CLI login and quota.
- **Every model has a canonical slug:**
  `<vendor>-<cli>/<model>[-<effort>]`, such as `xai-grok/grok-4.6` or
  `openai-codex/gpt-5.6-sol-high`. There are no aliases. Run
  `aibridge <command> --help` for the current list.

## Tell your agent when to reach for it

aibridge does not decide when to delegate, which model to use, or how your work
is staged. If you want your agent to reach for it on its own, say when and with
which models in the instructions file your agent reads (`AGENTS.md`,
`CLAUDE.md`, `.cursorrules`, and so on).

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
