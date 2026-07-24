# subagent — delegate a task to another model

`aibridge` owns the brittle execution; you supply the judgment. This reference covers
**(A)** calling it and available models, **(B)** delegating one task well, **(C)** scaling up via the three-verb flow, **(D)** when to stay native, and **(E)** driving delegates from orchestration tools.

## A. Calling it & Available Models

```bash
aibridge subagent "<self-contained prompt>" [--model <slug>] [--timeout 600] [--no-tools] [--no-preflight] [--json]
```

Pass a canonical slug to `--model` (no short aliases):

| Canonical Slug | Backend | Description |
|---|---|---|
| `xai-grok/grok-4.5` | grok | xAI Grok 4.5 via grok CLI — DEFAULT; own xAI login |
| `google-antigravity/gemini-3.6-flash` | agy | Google Gemini 3.6 Flash via agy (default effort: high); own Antigravity login |
| `google-antigravity/claude-sonnet-4-6` | agy | Claude Sonnet 4.6 (thinking) via agy; own Antigravity login |
| `google-antigravity/claude-opus-4-6-thinking` | agy | Claude Opus 4.6 (thinking) via agy; own Antigravity login — heavyweight |
| `google-antigravity/gpt-oss-120b-medium` | agy | GPT-OSS 120B (medium) via agy; own Antigravity login |
| `openai-codex/gpt-5.6-sol` | codex | OpenAI Codex gpt-5.6-sol via codex CLI |
| `anthropic-claude/sonnet-5` | claude | Claude Sonnet 5 via claude CLI — bills your Claude subscription |
| `anthropic-claude/opus-5` | claude | Claude Opus 5 via claude CLI (default effort: high) — bills subscription |
| `anthropic-claude/opus-5-1m` | claude | Claude Opus 5, 1M context via claude CLI — long-context work; bills subscription |

Effort suffixes can be appended to slugs supporting them (e.g. `xai-grok/grok-4.5-medium`, `google-antigravity/gemini-3.6-flash-low`, `anthropic-claude/sonnet-5-max`).

Every seat pins an exact model version — no vendor aliases like `opus`, which move under you when a new release lands.

- `--json` emits machine-readable JSON using the **canonical** slug (e.g. `{"model": "grok-4.5", "slug": "xai-grok/grok-4.5", ...}`).
- `--timeout <seconds>` sets max execution time (default: 600).
- **Tools are on by default**: the delegate can read/write files and run shell commands. Pass `--no-tools` for reasoning-only tasks.
- `--no-preflight` skips backend quota checks.

## B. When & how to delegate one task well

**The point is reach: another provider's model, working concurrently.** A delegate sees the task with different training, different blind spots, and its own tools — use it for cross-model second opinions, red-teaming, long-context analysis, and fanning out well-defined, self-contained work. Default to delegating such work.

Write prompts for a capable stranger:
1. **Self-contained** — paste the code/spec to act on; never reference "what we discussed".
2. **Specify approach, not code** — define design, interfaces, files to touch, and constraints.
3. **State constraints** — run real typecheck + tests until green; write code only (no commit/push/deploy/delete); reply with a short summary.
4. **Always review results** — re-run real gates and verify output against specifications.

## C. Scaling up — Plan → Implement → Review

For large or multi-file tasks, use the three-verb workflow instead of raw subagent calls:

1. **`aibridge plan "<prompt>"`**: Produces a detailed plan file (`plan.md`) listing files to touch, design decisions, and verification gates.
2. **`aibridge implement <plan.md>`**: Reads the plan file, implements changes, runs typecheck + tests, and returns a diff summary.
3. **`aibridge review [--plan <plan.md>]`**: Inspects working tree diffs and verifies implementation against plan contracts.

## D. When to stay native instead

Keep work native when it requires:
- Session-specific tools/skills or MCP servers not available to subagents.
- Complex conversational context or interactive user guidance.
- Strict schema validation or guaranteed multi-step orchestration retry logic.

## E. Driving delegates from an orchestration tool

When running from an orchestrator, pass prompts to `aibridge subagent` via thin passthrough agents to run implementation work on other providers' models while maintaining native control.
