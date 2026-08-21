# review — cross-model review of a diff (or a plan) against a contract

`aibridge review` has a reviewer model inspect a diff, with a plan file as the
CONTRACT so over-reach is a finding, and write the full report to a FILE. The
diff is whatever differs from `--base` (default `HEAD`, i.e. the working tree),
so committed work is reviewable too: `--base main` covers the whole branch.
stdout carries only a verdict line + paths, so the happy path costs you almost
nothing in context. Read the report only when findings exist.

## When to use

- After `aibridge implement` (or any delegated edit): cross-check the diff
  against the plan contract before you commit.
- Before implementing a high-risk design: on a CLEAN tree with `--plan`, it
  reviews the plan itself (pre-implementation gate).
- After you commit, at the end of a session or before a PR: point `--base` at
  the ref you branched from. Never copy a diff into a file and hand it to
  `subagent`; that is what `--base` is for.
- Any time you want a cross-model second opinion on a change, committed or not.

## Usage

```bash
aibridge review --model <slug> --out <file> [options]
  --model <slug>       reviewer model (required, e.g. xai-grok/grok-4.6)
  --plan <file>        plan contract; over-reach against it is a finding
  --base <ref>         git base to diff against (default: HEAD, i.e. working tree only)
  --out <file>         full report destination (required)
  --timeout <secs>     max seconds for review (default: 1200)
  --no-preflight       skip the backend quota preflight check
```

### Reviewing already-committed work

```bash
# the 3 commits you just made
aibridge review --model xai-grok/grok-4.6 --base HEAD~3 --out .aibridge/review.md

# everything on this branch that main does not have, against the plan contract
aibridge review --model xai-grok/grok-4.6 --base main \
  --plan .aibridge/plan.md --out .aibridge/review.md
```

`--base` goes straight to `git diff`, so anything git accepts works: `HEAD~3`,
a branch, a SHA, a tag, or a two-dot range like `v1.2.0..HEAD`. Uncommitted work
on top is included unless you pass a range that pins both ends.

## Modes (detected before any model spend)

1. **Diff review** — anything differs from `--base`, committed or not (or
   untracked files exist). On the default `HEAD` base that means a dirty tree;
   with an explicit `--base` a clean tree still reviews fine. With
   `--plan`, any change the contract never asked for is over-reach (major;
   critical if harmful).
2. **Plan-only review** — nothing differs from `--base` and `--plan` is given:
   reviews the plan file for soundness, edge cases, safety, feasibility.
3. Nothing differs and no `--plan` → `nothing to review`, exit 2. A bad `--base`
   ref is a hard error (exit 2), not silently treated as dirty.

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
