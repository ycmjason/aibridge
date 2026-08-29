# implement — execute a plan file

An implementer edits the working tree and runs the project's checks. This is the
third step in **`plan` → read and approve → `implement` → `review`**.

Run this only after reading and approving the plan. If the implementer would
need to make a product or architecture decision, fix the plan first.

## Usage

```bash
aibridge implement --model <slug> <plan-file>
  --model <slug>       implementer model (required, e.g. google-antigravity/gemini-3.7-flash)
  --timeout <secs>     max seconds (default: 1800)
  --no-preflight       skip the quota preflight
```

## Behaviour

The delegate runs with full tools at the repository root. It must follow the
plan, edit only named files, run the specified checks until they pass, and avoid
commits, pushes, and unrelated deletions.

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

1. **Re-run the checks yourself.** The summary reports the delegate's claim.
2. Then `aibridge review --model xai-grok/grok-4.6 --plan <plan-file> --out .aibridge/review.md`.

## Gotchas

- Keep the implementer a different model family from the reviewer. The
  recommended seats (gemini implements, grok reviews) comply; if you override
  one, check the other.
- agy quota is shared by model group. Two concurrent agy-heavy runs drain
  the same window. Run `aibridge quota` before pipelining.
- The timeout covers the whole run including gate-fixing loops. Raise it for big
  plans rather than letting a near-done run get killed.
