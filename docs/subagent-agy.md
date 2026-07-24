# `subagent` → agy (Antigravity CLI) — findings & implementation

> Provenance: live-tested on this machine 2026-06-08 unless marked **[web]**.

## What agy is

`agy` is Google's terminal agentic coding agent — the **successor to the
deprecated Gemini CLI** (Google reportedly stops serving Gemini CLI for AI
Pro/Ultra/free tiers ~2026-06-18, pushing users to agy) **[web]**. It's
multi-model and a *full agent* (reads/writes files, runs shell).

- Binary: `~/.local/bin/agy` (on `PATH` as `agy`), Go, **v1.0.6** [verified].
- **Auth: the user's Google login** (OS keyring) — **NO API key** [verified:
  `GEMINI_API_KEY`/`GOOGLE_API_KEY` both unset, calls still succeed]. Config under
  `~/.gemini/antigravity-cli/`.

## Models

`agy models` [verified agy 1.0.6, 2026-07-24] →

```
gemini-3.6-flash-high | gemini-3.6-flash-medium | gemini-3.6-flash-low
gemini-3.5-flash-high | gemini-3.5-flash-medium | gemini-3.5-flash-low
gemini-3.1-pro-high | gemini-3.1-pro-low
claude-sonnet-4-6
claude-opus-4-6-thinking
gpt-oss-120b-medium
```

- Select with `--model <id>` using the id form above — reasoning effort is BAKED
  INTO the model id (there is no un-suffixed `gemini-3.6-flash`). Probed live:
  `agy -p ... --model gemini-3.6-flash-low` answers fine.
- The registry (`packages/cli/src/models.ts`) stores the effort-less base id
  (`gemini-3.6-flash`) + a `defaultEffort`; `backendModelId()` appends the
  effort suffix for agy. Canonical slug
  `google-antigravity/gemini-3.6-flash[-<effort>]`, default effort `high`.
- ⚠️ Model self-identification is unreliable (an LLM will misstate its own name);
  the `--model` value is what's authoritative, not what the reply claims.

## Headless invocation

`agy -p "PROMPT"` (aliases `--print`, `--prompt`) — one-shot, prints, exits.
Useful flags:

- `--model '<name>'`
- `--dangerously-skip-permissions` — auto-approve all tool prompts (needed if the
  task touches files/shell, incl. reading; pure Q&A needs none)
- `--sandbox` — terminal restrictions
- `--add-dir <dir>` — add a workspace dir (repeatable)
- `--print-timeout <dur>` — **default 5m**; raise for long tasks or output cuts off
- `--continue`/`-c` resumes the **most-recent conversation GLOBALLY** → concurrent
  runs cross-contaminate. Avoid for parallel calls.

There is **no JSON output** (it was removed in agy). Output is plain text, possibly
with ANSI/TUI chrome. A harmless `Shell cwd was reset to <home>` notice goes to
stderr.

## stdout capture: no TTY workaround needed (re-verified agy 1.0.6)

An earlier draft of this doc claimed `agy -p` only emits when **stdout is a TTY**,
and that piping/redirecting it hangs. **Re-tested 2026-06-08 on agy 1.0.6 from
this repo — that is NOT true here.** agy emits cleanly to a non-TTY stdout:

| invocation (stdin = `/dev/null`) | result |
|---|---|
| `agy -p "…" > out.txt` (stdout = plain file) | prints, exit 0 (~4–5s), clean text ✓ |
| stdout = pipe, captured into a JS variable | exit 0, clean text, **no ANSI** ✓ |
| stdout **and** stderr both piped (fully headless) | exit 0, clean text ✓ |

So `aibridge subagent` just spawns agy with `stdio: ["ignore", "pipe", "pipe"]`
and reads stdout (see `runCaptured` in [`packages/proc/src/proc.ts`](../packages/proc/src/proc.ts)).
**No `node-pty`, no `/dev/tty`, no temp-file dance, no native dependency.** Output
in this mode carries no ANSI chrome, but we still `stripAnsi` + drop the stray
`Shell cwd was reset…` notice defensively.

> If a future agy build regresses to the old TTY trap, the symptom is: agy hangs
> until `--print-timeout` and emits 0 bytes. The fix then is a pseudo-TTY
> (`node-pty`) or having agy write its answer to a file via `--add-dir <dir>` +
> an explicit "write to `<file>`" instruction, then reading it back. Not needed today.

## ⚠️ Workspace: agy ignores its spawn cwd — pass the repo as the FIRST `--add-dir`

**Found live 2026-07-01 while dogfooding `plan`.** agy **resets its own working
directory** (it emits the `Shell cwd was reset to <home>` notice) and treats its
`--add-dir` *workspace* as "the current directory" — it does **not** honour the cwd of
the process that spawned it. So an early `subagent` that only added a throwaway temp
dir (for the answer file) had the delegate write ALL its edits into that temp dir; the
files never reached the caller's repo and were then deleted with it. Symptom: the
delegate cheerfully reports "created `src/foo`" but the repo is untouched.

Fix (in [`packages/cli/src/commands/subagent/impl.ts`](../packages/cli/src/commands/subagent/impl.ts)):
in tools mode, pass the caller's cwd as the **first** `--add-dir` (its primary
workspace), the temp answer dir **second**, spawn agy with `cwd: workDir`, and anchor
the prompt ("you are working in the repository rooted at `<workDir>`; make ALL file
edits there"). Then relative paths land in the real repo. This matters doubly for
`plan`, where codex delegates a real implementation to the delegate via `subagent`.

## Session resume — conversation IDs (live-verified 2026-07-02, agy 1.0.6)

Session resume rests on these facts:

- `agy --conversation <uuid> -p "…"` resumes a prior conversation **fully
  headless**, from **any cwd**, with conversation context retained (verified via
  codeword round-trip).
- **ID discovery:** agy writes `~/.gemini/antigravity-cli/cache/last_conversations.json`,
  a map of **spawn cwd → conversation UUID**. The key is the process **cwd**,
  NOT the first `--add-dir` (verified with distinct dirs). So to get a resumable
  ref for a fresh headless session: spawn `agy -p` with a **unique per-session
  cwd**, then read the map entry for that cwd after the run exits.
- Unknown: how long conversation refs stay resumable. Treat resume failure as
  session rotation (memory-flush turn on old ref where possible, fresh session
  from a rebuilt context bundle).

## Quotas / cost [web]

agy injects ~24k tokens of system prompt + tools **per request** → quota drains
fast on Pro/Ultra. Don't loop fresh sessions for trivia. Context window ~1M.
Env toggles: `AGY_CLI_HIDE_ACCOUNT_INFO`, `AGY_CLI_DISABLE_AUTO_UPDATE`,
`AGY_CLI_DISABLE_LATEX`.

## Implementation — `packages/cli/src/commands/subagent/impl.ts` (done)

- [x] Resolve `model` from the registry; unknown slug → exit 2.
- [x] Build args: `["-p", prompt, "--model", model.backendModel, "--print-timeout", "<t>s"]`.
      The `--tools` flag appends `--dangerously-skip-permissions` for tasks that
      need agy to read/write files or run shell (auto-approves its tools).
- [x] Spawn via `runCaptured` (`stdio: ignore/pipe/pipe`); our kill timeout
      (`--timeout` seconds + 20s slack) is the real ceiling.
- [x] `stripAnsi` + drop the `Shell cwd was reset` line; trim.
- [x] Timeout → clear error + exit 1. agy missing (ENOENT) → clear error + exit 1.
- [x] `--json` → `{ model, slug, response, exitCode }`; else print the answer.
- [x] Exit codes: 0 ok, 1 backend failure/empty/timeout, 2 unknown model.

## Sources [web]

- https://antigravity.google/docs/cli-overview · /docs/cli-using
- https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/
- https://github.com/google-antigravity/antigravity-cli — issues #76, #115 (non-TTY empty stdout)
