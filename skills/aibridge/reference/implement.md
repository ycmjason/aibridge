# implement — execute an implementation plan file

`aibridge implement` hands a plan FILE to an implementer model that edits the
working tree in place and runs the project's real gates. Stage three of
**`plan` → you read/approve → `implement` → `review`**.

## When to use

- You have a plan file you have READ and approved (from `aibridge plan`, or
  written yourself). The implementer is a pure do-er: if the plan needs vision
  or context to execute correctly, the plan is not done — fix the plan, don't
  brief the implementer.

## Usage

```bash
aibridge implement [options] <plan-file>
  --model <slug>       implementer model (default: google-antigravity/gemini-3.6-flash)
  --timeout <secs>     max seconds for implementation (default: 1800)
  --no-preflight       skip the backend quota preflight check
```

## Behavior

1. The plan file must exist (resolved against the cwd); the delegate is
   prompted to implement it EXACTLY — edit only files it names, run the REAL
   typecheck/test gates until green, never commit/push or delete unrelated
   files.
2. The delegate runs with full tools at the repo root.
3. After the run: `git diff --stat` + untracked-file count are printed so you
   can decide whether to inspect before reviewing.

## Output

```
<delegate's short summary>

 <git diff --stat>
untracked files: <count>
run: <run id>
```

Exit 0: completed with working-tree changes. Exit 1: delegate failed, timed
out, no usable answer, or **zero tree changes** (an implement run that changed
nothing is a failure by definition). Exit 2: bad args / missing plan file.
Exit 3: quota preflight refusal.

## After it returns — your job

- The summary's "gates green" claim is **delegate-reported**. Re-run the real
  gates yourself before trusting the diff.
- Then `aibridge review --plan <plan-file>` for the cross-model check
  (defaults already make reviewer ≠ implementer).

## Gotchas

- Keep the implementer cross-model from whoever reviews: gemini implements,
  grok reviews (the defaults). If you override `--model`, check the other seat.
- agy quota is shared per model GROUP — two concurrent agy-heavy implements
  drain the same window. `aibridge quota` before pipelining.
- Timeout is for the WHOLE implementation incl. gate-fixing loops; raise it for
  big plans rather than letting a near-done run get killed.
