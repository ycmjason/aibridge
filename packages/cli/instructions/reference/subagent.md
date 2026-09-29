# subagent — delegate a task to another model

Delegate one self-contained task to another provider's model. Use this for a
second opinion, red-team review, long-context analysis, or a clearly specified
piece of work.

## Usage

```bash
aibridge subagent --model <slug> "<self-contained prompt>" [options]
  --model <slug>       required, canonical slug (no short aliases)
  --timeout <secs>     max seconds (default: 1800)
  --no-tools           reasoning only: no file or shell access
  --no-preflight       skip the quota preflight
  --json               machine-readable: {"model": <backend id>, "slug": <canonical slug>, "response", "exitCode"}
```

The answer prints to stdout. There is no `--out`; redirect if you want a file.
The run id is also printed immediately on stderr as `aibridge: run <id>` so `aibridge runs <id>` works before the command finishes.

Effort suffixes work on models that support them (`<slug>-low`; `aibridge
models` lists each model's efforts). The model list is in [SKILL.md](../SKILL.md);
`aibridge subagent --help` prints the live list.

**Tools are ON by default** — the delegate reads/writes files and runs shell.

## Writing the prompt

Write for a capable model with no conversation context:

1. **Self-contained.** The delegate has none of your conversation. Give it the
   material, or say where to find it; never reference "what we discussed".
2. **Say what done looks like**, what it must not touch, and what to reply
   with.
3. **Verify the result** yourself before relying on it.

## When to stay native instead

- The task needs session-specific tools, skills, or MCP servers.
- It needs conversational context or live user guidance.
- It needs strict schema validation or guaranteed retry orchestration.
