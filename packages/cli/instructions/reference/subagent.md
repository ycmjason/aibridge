# subagent — delegate a task to another model

Delegate one self-contained task to another provider's model. Use this for a
second opinion, red-team review, long-context analysis, or a clearly specified
piece of work.

## Usage

```bash
aibridge subagent --model <slug> "<self-contained prompt>" [options]
  --model <slug>       required, canonical slug (no short aliases)
  --timeout <secs>     max seconds (default: 600)
  --no-tools           reasoning only: no file or shell access
  --no-preflight       skip the quota preflight
  --json               machine-readable, e.g. {"model": "grok-4.6", "slug": "xai-grok/grok-4.6", ...}
```

The answer prints to stdout. There is no `--out`; redirect if you want a file.

Effort suffixes work on seats that support them
(`xai-grok/grok-4.6-medium`, `google-antigravity/gemini-3.7-flash-low`,
`anthropic-claude/sonnet-5-max`). The seat table is in [SKILL.md](../SKILL.md);
`aibridge subagent --help` prints the live list.

**Tools are ON by default** — the delegate reads/writes files and runs shell.

## Writing the prompt

Write for a capable model with no conversation context:

1. **Self-contained.** Paste the code or spec to act on. Never reference "what
   we discussed".
2. **Specify the approach.** Include design decisions, interfaces, files, and
   constraints without prescribing every line of code.
3. **State the constraints.** Run the real typecheck and tests until green;
   write code only, no commit/push/deploy/delete; reply with a short summary.
4. **Verify the result.** Re-run the real gates yourself.

## When to stay native instead

- The task needs session-specific tools, skills, or MCP servers.
- It needs conversational context or live user guidance.
- It needs strict schema validation or guaranteed retry orchestration.

## Scaling up

For large or multi-file work, use the three verbs instead of raw subagent calls:
[plan](plan.md) → you approve → [implement](implement.md) → [review](review.md).
