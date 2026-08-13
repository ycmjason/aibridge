# review — cross-model review of a diff (or a plan) against a contract

`aibridge review` has a reviewer model inspect the working-tree diff — with a
plan file as the CONTRACT, so over-reach is a finding — and write the full
report to a FILE. stdout carries only a verdict line + paths: the happy path
costs you almost nothing in context; read the report only when findings exist.

## When to use

- After `aibridge implement` (or any delegated edit): cross-check the diff
  against the plan contract before you commit.
- Before implementing a high-risk design: on a CLEAN tree with `--plan`, it
  reviews the plan itself (pre-implementation gate).
- Any time you want a cross-model second opinion on uncommitted changes.

## Usage

```bash
aibridge review --model <slug> --out <file> [options]
  --model <slug>       reviewer model (required, e.g. xai-grok/grok-4.6)
  --plan <file>        plan contract; over-reach against it is a finding
  --base <ref>         git base to diff against (default: HEAD)
  --out <file>         full report destination (required)
  --timeout <secs>     max seconds for review (default: 1200)
  --no-preflight       skip the backend quota preflight check
```

## Modes (detected before any model spend)

1. **Diff review** — tree dirty vs `--base` (or untracked files exist). With
   `--plan`, any change the contract never asked for is over-reach (major;
   critical if harmful).
2. **Plan-only review** — tree clean + `--plan` given: reviews the plan file
   for soundness, edge cases, safety, feasibility.
3. Tree clean + no `--plan` → `nothing to review`, exit 2. A bad `--base` ref
   is a hard error (exit 2), not silently treated as dirty.

## Output & exit codes

```
PASS                                  | FINDINGS: 1 critical, 0 major, 3 minor
review: /abs/path/to/review.md
run: <run id>
```

- `0`: PASS, or findings that are minor-only.
- `1`: critical or major findings; unparseable verdict (the raw answer + paths
  are still printed so you can recover); missing/empty report file; delegate
  failure/timeout.
- `2`: bad flags, missing plan file, nothing to review, bad base ref.
- `3`: quota preflight refusal.

## After it returns — your job

- `PASS` → proceed (commit, or report done).
- Findings → read the report file, then JUDGE: over-reach findings can be
  intentional scope you added deliberately — the reviewer flags, you decide.
  Fix what's real, then re-run `review` (cheap) until clean-or-accepted.

## Gotchas

- Reviewer must be cross-model from the implementer — never let a model review
  its own diff. Recommended seats (grok reviews, gemini implements) already comply.
- Backends narrate: the verdict parser accepts the verdict on the first line,
  last line, or embedded at the end of a narration blob (grok has been observed
  concatenating progress prose onto the final message). If parsing still fails
  you get exit 1 WITH the raw answer + report path on stdout.
- The report file is required even for PASS — a missing/empty report fails the
  run: a verdict without evidence is not a review.
