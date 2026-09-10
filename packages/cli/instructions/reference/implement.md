# implement — execute a plan file

An implementer edits the working tree and runs the project's checks. This is the
third step in **`plan` → read and approve → `implement` → `review`**.

Run this only after reading and approving the plan. If the implementer would
need to make a product or architecture decision, fix the plan first.

## Usage

```bash
aibridge implement --model <slug> <plan-file>
  --model <slug>       implementer model (required, e.g. {{implement}})
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
2. Then `aibridge review --model {{review}} --plan <plan-file> --out .aibridge/review.md`.

## Gotchas

- Keep the implementer a different model family from the reviewer. The seats
  named above differ when more than one backend is installed; with a single
  backend they cannot, so say so and ask before reviewing.
<!-- if:agy -->
- agy quota is shared by model group. Two concurrent agy-heavy runs drain
  the same window. Run `aibridge quota` before pipelining.
<!-- endif -->
- The timeout covers the whole run including gate-fixing loops. Raise it for big
  plans rather than letting a near-done run get killed.
