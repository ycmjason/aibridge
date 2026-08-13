# plan — produce a detailed implementation plan file

`aibridge plan` hands a task prompt to a model that studies the real codebase
and writes an expanded, detailed implementation plan to a FILE. It is stage one
of the orchestrator-driven workflow: **`plan` → you read/approve → `implement`
→ `review`**. The plan file is the contract for every later stage — pass its
PATH around, never re-emit its contents.

## When to use

- A sizeable or risky implementation task where you want a second model to work
  out the detail against the actual code before anything is edited.
- NOT for small, fully-specified chunks — hand those straight to `subagent`
  (or just do them).

## Usage

```bash
aibridge plan --model <slug> --out <file> "<task prompt>"
  --model <slug>       planner model (required, e.g. xai-grok/grok-4.6)
  --out <file>         where to write the plan file (required)
  --timeout <secs>     max seconds for planning (default: 1800)
  --no-preflight       skip the backend quota preflight check
```

## Prompt-craft — what to put in the task prompt

The planner runs WITH tools at your repo root and reads the code itself, so do
NOT paste file contents. Do give it what it cannot infer:

- the goal and the user-visible behavior change;
- hard constraints (APIs to keep stable, zero-dep rules, style conventions);
- scope boundaries and NON-goals (the single best over-reach preventer);
- any architectural calls you have already made — the planner details your
  design, it does not overrule it;
- pointers to starting files if the repo is large.

## Behavior

1. The positional argument is the **task prompt** (a string), not a file path.
2. The planner writes **exactly one file** (`--out`) and must leave the working
   tree otherwise untouched — enforced: `git status --porcelain` is compared
   before/after and any unexpected path fails the run (exit 1, paths listed).
3. The plan must end with a `## Open questions` section (`None.` when
   confident). The question count is surfaced on stdout.

## Output

```
plan: /abs/path/to/plan.md
open questions: 2
run: <run id>
```

Exit 0 even when open questions > 0 — they are data for you, not failure.
Exit 1: plan missing/empty/section missing, tree dirtied, delegate failure or
timeout. Exit 2: bad arguments. Exit 3: quota preflight refusal.

## After it returns — your job

1. **Read the plan file.** This sign-off is the entire point of the split; an
   unread plan is an unreviewed contract.
2. Resolve every open question — edit the file directly or re-run `plan` with
   a sharpened prompt.
3. For high-risk designs, add a cross-model gate before building:
   `aibridge review --model xai-grok/grok-4.6 --plan <file> --out review.md` on a clean tree reviews the plan itself.
4. Then `aibridge implement --model google-antigravity/gemini-3.7-flash <file>`.

## Gotchas

- Pass an explicit `--out` (e.g. `plan.md` or `docs/plans/feature.md`) for where to store the plan file.
- An `--out` inside the repo is allowed (it shows up untracked and is exempted
  from the cleanliness check); everything else dirty fails the run.
- grok (the recommended planner) is capped ~30 req/min, ~1k msgs/day, one run at a
  time — never run two grok stages concurrently.
