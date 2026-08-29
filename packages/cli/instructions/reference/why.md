# why — the reasoning behind the rules

This page explains rules that the command guides state without rationale. Read
it when a rule appears unsuitable for your case.

**Paths travel between stages, not contents.** A plan re-emitted into your
context costs you the tokens the split was meant to save. `plan` writes a file,
`implement` reads that path, `review` takes it as `--plan`. Nothing round-trips
through you except your judgment.

**You read the plan file.** That sign-off is the entire point of splitting plan
from implement. Skip it and you have an unreviewed contract that a second model
will now execute literally.

**The implementer is a pure do-er.** It executes a fully-designed plan and does
not hold the surrounding vision. When a plan turns out to need that vision, the
design work upstream was insufficient. Fix the plan rather than briefing the
implementer.

**Reviewers are cross-model on purpose.** A model reviewing its own diff shares
its own blind spots and will wave through the thing it just failed to see. This
applies to you too: prefer a reviewer outside your own model family for code you
wrote yourself.

**Over-reach is a finding.** A delegate that also refactors three neighbouring
files has left the contract, and the diff you now have to verify is bigger than
the one you asked for. The reviewer flags it; you decide whether it was scope
you wanted.

**Quota is relative to whoever runs the skill.** Every backend spends its own
CLI's login. A backend on the same provider as you (`anthropic-claude/*` for a
Claude-based agent) drains the pool you are already burning, so it buys no extra
capacity and no independent perspective. That is why it is a last resort rather
than merely a choice.

**Seats pin exact model versions.** A vendor alias like `opus` moves under you
when a release lands, silently changing what a documented pipeline does.

**Some commands write files, some print.** `plan`, `review` and `image-gen`
produce artifacts worth keeping and re-reading, so they take `--out` and keep
stdout to a verdict line. `subagent` returns an answer you consume immediately,
and `implement`'s output IS the working tree.

**The CLI catches fake successes, not bad work.** Backends fail in ways that
look like success: an agy model with no quota returns an empty answer and exit 0;
codex sometimes draws a tiny image in code instead of rendering one. So a
too-small render is rejected as fake, an empty answer is an error, and an
`implement` that changed nothing exits 1. A review with no report file fails as
well, because a verdict without evidence is not a review. None of that judges
the work itself, which is why you still re-run the real gates on a diff.

**Chroma keying is a fallback, not a feature.** Only codex renders true alpha.
On the JPEG seats aibridge asks for a flat backdrop and removes it locally,
which gives binary edges and eats any subject the same colour as the backdrop.
