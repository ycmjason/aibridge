# plan — write a detailed implementation plan file

A planner studies the codebase and writes a detailed plan to a file. This is the
first step in **`plan` → read and approve → `implement` → `review`**. Pass the
file path—not its contents—between stages.

Use it for sizeable or risky work. For small, fully-specified chunks use
`subagent`, or just do them.

## Usage

```bash
aibridge plan --model <slug> --out <file> "<task prompt>"
  --model <slug>       planner model (required, e.g. xai-grok/grok-4.6)
  --out <file>         where to write the plan (required)
  --timeout <secs>     max seconds (default: 1800)
  --no-preflight       skip the quota preflight
```

The positional argument is the task prompt, not a file path.

## Writing the task prompt

The planner can read the code. Do not paste file contents. Provide only what it
cannot infer:

- the goal and the user-visible behaviour change;
- hard constraints (APIs to keep stable, zero-dep rules, style conventions);
- scope boundaries and non-goals;
- architectural calls you have already made, since the planner details your
  design rather than overruling it;
- starting files, if the repo is large.

## Behaviour

- The planner writes exactly one file (`--out`). Any other change to the working
  tree fails the run (exit 1, paths listed). An `--out` inside the repo is
  exempt.
- The plan must end with `## Open questions` (`None.` when confident). The count
  prints on stdout.

## Output

```
plan: /abs/path/to/plan.md
open questions: 2
run: <run id>
```

Exit 0 even with open questions. Exit 1: plan missing, empty, no open-questions
section, tree dirtied, delegate failure or timeout. Exit 2: bad arguments.
Exit 3: quota preflight refusal.

## After it returns

1. **Read the plan file.** It is the implementation contract.
2. Resolve every open question: edit the file directly, or re-run `plan` with a
   sharpened prompt.
3. High-risk design? Gate it first:
   `aibridge review --model xai-grok/grok-4.6 --plan <file> --out .aibridge/review.md`
   on a clean tree.
4. Then `aibridge implement --model google-antigravity/gemini-3.7-flash <file>`.

## Gotchas

- `--out` belongs in `.aibridge/` (see [SKILL.md](../SKILL.md)); check it is
  gitignored once per session.
- grok is capped at ~30 req/min, ~1k msgs/day, one run at a time. Never run two
  grok stages concurrently.
