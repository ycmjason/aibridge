<div align="center">
  <img src="assets/logo.png" alt="aibridge logo" width="140" />

  # aibridge

  **Let your coding agent drive the other AIs on your machine.** Cross-provider agent-to-agent delegation — plan, implement, review, red-team, and generate images across Grok, Gemini, Codex & Claude through the CLIs you already have. No API keys.

  [![skills.sh](https://skills.sh/b/ycmjason/aibridge)](https://skills.sh/ycmjason/aibridge)
  [![npm](https://img.shields.io/npm/v/%40aibridge%2Fcli)](https://www.npmjs.com/package/@aibridge/cli)
  [![node](https://img.shields.io/node/v/%40aibridge%2Fcli)](https://www.npmjs.com/package/@aibridge/cli)
  [![license](https://img.shields.io/github/license/ycmjason/aibridge)](LICENSE)

  Works in **Claude Code**, **Cursor**, **Codex**, **Gemini CLI**, **OpenCode**, and 70+ other agents via [the skills CLI](https://github.com/vercel-labs/skills).
</div>

---

Your agent is one model, from one provider. Your machine probably has several more sitting behind CLIs you already use — `grok`, `agy` (Antigravity), `codex`, `claude`. **aibridge** turns them into seats your agent can drive: a planner that studies your repo, an implementer that edits it and runs your real tests, a reviewer from a *different* model family that cross-checks the diff against the plan, concurrent one-shot delegates — and capabilities your agent's own provider may not offer at all, like real image generation (gpt-image-2, Grok Imagine).

## Install

One step — install the skill into your agent(s):

```bash
npx skills add ycmjason/aibridge
```

That's it. The skill runs the CLI on demand via `npx -y @aibridge/cli` — nothing else to install. Ask your agent to "use aibridge", or try it yourself:

```bash
npx -y @aibridge/cli subagent "summarize the architecture of this repo"
```

<sup>Want the `aibridge` command on your PATH for manual use? `npm i -g @aibridge/cli` (optional).</sup>

## Commands

| Command | Use when |
|---|---|
| `aibridge plan "<task>"` | You want a delegate model to study the repo and expand a task into a detailed, reviewable **plan file** before any code is written |
| `aibridge implement <plan.md>` | You have an approved plan file and want it executed in place — with your project's **real typecheck and tests** run until green |
| `aibridge review [--plan <plan.md>]` | You want a **different model** to pressure-test the working-tree diff against the plan contract (over-reach is a finding) — or to review the plan itself before implementing |
| `aibridge subagent "<task>"` | A self-contained task deserves a concurrent delegate, a cross-model second opinion, or a red-team pass |
| `aibridge image-gen "<prompt>"` | You need a real raster image — gpt-image-2 (default) or Grok Imagine, with render verification |
| `aibridge quota` | Two-second check of every backend's remaining quota before you pipeline work |
| `aibridge runs` | Inspect or watch past delegation runs (`~/.aibridge/runs`) |

The three verbs compose into an orchestrator-driven loop your agent stays in charge of:

```
aibridge plan "add rate limiting to the API"   # delegate writes plan.md
# → your agent reads, edits, approves the plan
aibridge implement plan.md                     # another model executes it, runs your gates
aibridge review --plan plan.md                 # a third seat cross-checks the diff
```

Plan files — not their contents — travel between stages, so the loop is nearly free on your agent's context.

## How it works

- **The skill carries judgment; the CLI owns execution.** The skill teaches your agent prompt-craft, seat selection, and when to gate; the CLI deterministically drives the backing CLIs, captures their output, verifies results (a "generated image" under 100 KB is a code-drawn fake, an empty answer is a quota death), and logs every run.
- **Seats stay cross-model by default.** Grok plans and reviews, Gemini implements — a model never reviews its own diff, and independent eyes catch what shared blind spots miss.
- **No API keys.** Delegation runs on the backing CLIs' existing logins, each spending its own quota. (The skill treats a backend that shares your agent's own quota pool as a last resort.)
- **Models are canonical slugs**: `<vendor>-<cli>/<model>[-<effort>]` — e.g. `xai-grok/grok-4.5`, `google-antigravity/gemini-3.6-flash`, `openai-codex/gpt-5.6-sol-high`, `anthropic-claude/opus-5`. No aliases — not short ones, and not moving vendor aliases like `opus`: every seat pins an exact model version. `aibridge <command> --help` lists every seat.

## Requirements

- **Node ≥ 24.11**
- The backing CLIs you want to use, on `PATH` and authed: [`grok`](https://github.com/superagent-ai/grok-cli), `agy` (Antigravity), [`codex`](https://github.com/openai/codex), [`claude`](https://claude.com/claude-code) — any subset works; commands fail fast with install hints for missing ones.

## Packages

Everything is published under the [`@aibridge`](https://www.npmjs.com/org/aibridge) scope: [`@aibridge/cli`](https://www.npmjs.com/package/@aibridge/cli) (the command), `@aibridge/proc` (spawn/capture), and one driver per backing CLI — `@aibridge/driver-agy`, `@aibridge/driver-grok`, `@aibridge/driver-codex`, `@aibridge/driver-claude` — reusable if you want to drive a single CLI from your own code.

## Security

aibridge executes real delegation — that's the product, and security scanners rightly notice: backing CLIs read/write files and run shell in tools mode, **at the same trust level as the agent you already run**. Nothing gains more access than you granted your agent and those CLIs when you installed them. Task content goes to the delegate's provider (use `--no-tools` for untrusted input — reasoning only, no file/shell access). All packages publish from this public repo via OIDC with [SLSA provenance](https://www.npmjs.com/package/@aibridge/cli), with no install-time scripts.

## Contributing & development

Dev docs, architecture, and the working agreements for coding agents live in [`AGENTS.md`](AGENTS.md); design history in [`docs/`](docs/). Quick loop:

```bash
pnpm install
pnpm check && pnpm typecheck && pnpm test
node packages/cli/src/cli.ts --help
```

## License

[MIT](LICENSE) © Jason Yu
