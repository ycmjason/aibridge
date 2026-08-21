# review — cross-model review of a diff or a plan

A reviewer model inspects a diff against a plan contract and writes the report
to a FILE. stdout is one verdict line plus paths.

## Usage

```bash
aibridge review --model <slug> --out <file> [options]
  --model <slug>       reviewer model (required, e.g. xai-grok/grok-4.6)
  --plan <file>        plan contract; over-reach against it is a finding
  --base <ref>         git ref or range to diff (default: HEAD, working tree only)
  --out <file>         full report destination (required)
  --timeout <secs>     max seconds (default: 1200)
  --no-preflight       skip the quota preflight
```

## Picking the diff

`--base` is passed straight to `git diff`, so any ref or range git accepts
works: `HEAD~3`, a branch, a SHA, a tag, `v1.2.0..HEAD`.

```bash
# uncommitted work only (the default base, HEAD)
aibridge review --model xai-grok/grok-4.6 --out .aibridge/review.md

# the 3 commits you just made
aibridge review --model xai-grok/grok-4.6 --base HEAD~3 --out .aibridge/review.md

# the whole branch, against the plan contract
aibridge review --model xai-grok/grok-4.6 --base main \
  --plan .aibridge/plan.md --out .aibridge/review.md
```

Reviewing commits is the normal end-of-session case. Never copy a diff into a
file and hand it to `subagent`; that is what `--base` is for. Uncommitted work
on top is included unless the range pins both ends.

## Modes (detected before any model spend)

1. **Diff review** — anything differs from `--base`, committed or not, or
   untracked files exist. With `--plan`, any change the contract never asked for
   is over-reach: major, or critical if harmful.
2. **Plan review** — nothing differs from `--base` and `--plan` is given.
   Reviews the plan for soundness, edge cases, safety, feasibility. Use it as a
   pre-implementation gate on high-risk designs.
3. Nothing differs and no `--plan` → `nothing to review`, exit 2.

## Output & exit codes

```
PASS                                  | FINDINGS: 1 critical, 0 major, 3 minor
review: /abs/path/to/review.md
run: <run id>
```

- `0`: PASS, or minor-only findings.
- `1`: critical or major findings; unparseable verdict (raw answer + paths still
  print); missing or empty report file; delegate failure or timeout.
- `2`: bad flags, missing plan file, nothing to review, bad base ref.
- `3`: quota preflight refusal.

## After it returns

- `PASS` → proceed (commit, or report done).
- Findings → read the report, then judge. Over-reach findings can be scope you
  added deliberately: the reviewer flags, you decide. Fix what is real, re-run.
- Never let a model review its own diff. The recommended seats (grok reviews,
  gemini implements) already comply; if you override one, check the other.

## Gotchas

- The report file is required even for PASS. Missing or empty fails the run.
- Verdict parsing accepts the line first, last, or at the end of a narration
  blob (grok concatenates progress prose). If it still fails, you get exit 1
  with the raw answer plus the report path on stdout.
- A bad `--base` ref is a hard error (exit 2), not a silent dirty-tree fallback.
