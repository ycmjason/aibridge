# implement — execute a plan file

An implementer model edits the working tree in place and runs the project's real
gates. Stage three of **`plan` → you read/approve → `implement` → `review`**.

Only run it on a plan you have READ and approved. The implementer is a pure
do-er: if the plan needs vision to execute correctly, fix the plan.

## Usage

```bash
aibridge implement --model <slug> <plan-file>
  --model <slug>       implementer model (required, e.g. google-antigravity/gemini-3.7-flash)
  --timeout <secs>     max seconds (default: 1800)
  --no-preflight       skip the quota preflight
```

## Behaviour

The delegate runs with full tools at the repo root, prompted to implement the
plan EXACTLY: edit only the files it names, run the real typecheck and test
gates until green, never commit, push, or delete unrelated files.

## Output

```
<delegate's short summary>

 <git diff --stat>
untracked files: <count>
run: <run id>
```

Exit 0: completed with tree changes. Exit 1: delegate failed, timed out, gave no
usable answer, or changed nothing (a no-op implement is a failure). Exit 2: bad
args or missing plan file. Exit 3: quota preflight refusal.

## After it returns

1. The summary's "gates green" claim is delegate-reported. **Re-run the real
   gates yourself.**
2. Then `aibridge review --model xai-grok/grok-4.6 --plan <plan-file> --out .aibridge/review.md`.

## Gotchas

- Keep the implementer a different model family from the reviewer. The
  recommended seats (gemini implements, grok reviews) comply; if you override
  one, check the other.
- agy quota is shared per model GROUP: two concurrent agy-heavy implements drain
  the same window. Run `aibridge quota` before pipelining.
- The timeout covers the whole run including gate-fixing loops. Raise it for big
  plans rather than letting a near-done run get killed.
