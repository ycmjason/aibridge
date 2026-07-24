# `plan` → codex (the three-tier plan gate) — findings & implementation

> **Note:** The old welded plan-gate described in early iterations has been replaced by the decoupled three-verb flow (`plan` → `implement` → `review`). The sandbox and CLI findings below remain authoritative reference.

> Provenance: live-tested on this machine 2026-07-01 (codex-cli 0.142.4, agy 1.0.13).

## What `plan` is

`ai-bridge plan` is the planning verb of the three-verb flow: **`plan` → `implement` → `review`**. Claude writes a high-level prompt or plan; `ai-bridge plan "<prompt>"` hands it to a model, which reviews it against the real codebase and produces an expanded implementation plan file (`plan.md`).

## The key discovery — codex's sandbox blocks the hand-off; you must bypass it

For codex to delegate to Gemini, it runs a shell command that spawns our own CLI →
`agy`, which needs **network** (Google's API) and **its own credentials** (OS keyring /
`~/.gemini`). Codex's sandbox denies both. Verified matrix:

| codex exec mode | shell network | agy auth reachable | result |
|---|---|---|---|
| `--full-auto` (workspace-write sandbox) | ❌ `ENOTFOUND` | ❌ | agy falls into a hanging OAuth prompt |
| `--full-auto` + `-c sandbox_workspace_write.network_access=true` | ✅ `200` | ❌ still can't read keyring | still hangs on login |
| `--dangerously-bypass-approvals-and-sandbox` | ✅ | ✅ | **works** — Gemini answers, codex relays |

So tools-mode codex runs with **`--dangerously-bypass-approvals-and-sandbox`** — full
machine access, the **same trust level Claude Code already runs `agy` at**. This is
mandatory, not optional; document it loudly. `image-gen` keeps `--full-auto` (its
`image_gen` tool is a codex-internal call, not a sandboxed shell, so the sandbox is
fine there).

## Structured verdict — `--output-schema` + `--output-last-message`

codex `exec` can enforce a JSON Schema on its final message (`--output-schema <file>`)
and write that message verbatim to a file (`--output-last-message <file>`).

⚠️ **Strict-mode schema gotcha (hit live).** codex enforces the schema via OpenAI
*strict* structured outputs, which reject a schema unless **`additionalProperties:
false`** AND **every property is listed in `required`**. Optional fields must therefore
be made **nullable** (`"type": ["array", "null"]`), not omitted from `required`. A
lax schema fails fast with `400 … "param": "text.format.schema"`.

- Requires a newer codex than `image-gen` does — `MIN_CODEX_STRUCTURED = 0.142.0`
  (`--output-schema` is recent) vs `MIN_CODEX_IMAGE = 0.135.0`.

## Sources

- `codex exec --help` (0.142.4) — `--output-schema`, `--output-last-message`,
  `--dangerously-bypass-approvals-and-sandbox`, `-C`.
- OpenAI structured outputs strict-mode requirements (all-keys-required + no additional
  properties).
