# why — the reasoning behind the rules

This page explains rules that the command guides state without rationale. Read
it when a rule appears unsuitable for your case.

**Quota is relative to whoever runs the skill.** Every backend spends its own
CLI's login. A backend on the same provider as you (`anthropic-claude/*` for a
Claude-based agent) drains the pool you are already burning, so it buys no extra
capacity and no independent perspective. That is why it is a last resort rather
than merely a choice.

**Slugs pin exact model versions.** A vendor alias like `opus` moves under you
when a release lands, silently changing what a documented command does.

**Some commands write files, some print.** `image-gen` and `image-cutout`
produce artifacts worth keeping, so they take `--out` and keep stdout to a
result line. `subagent` returns an answer you consume immediately; redirect it
if you want a file.

**The CLI catches fake successes, not bad work.** Backends fail in ways that
look like success: an agy model with no quota returns an empty answer and exit 0;
codex sometimes draws a tiny image in code instead of rendering one. So a
too-small render is rejected as fake and an empty answer is an error. None of
that judges the work itself, which is why you still verify what a delegate did.

**Alpha is a capability, and `image-cutout` is where it is made.** Only codex
renders true alpha, and only for a fresh generation. Rather than a flag that
fakes it per model, `image-cutout` asks the model to re-render an image with
only the backdrop changed and solves the pair per pixel (difference matting).
Two observations of every pixel recover soft alpha and the real foreground
colour, which a chroma key cannot; the price is a second paid render and a
subject that has to hold still between the two.
