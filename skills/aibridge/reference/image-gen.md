# image-gen — generate an image via a model seat

Part A covers the command. Part B covers prompt design, which applies even when
you only need to return a prompt.

## A. Calling it

```bash
aibridge image-gen --model <slug> --out <file.png> "<full prompt — see part B>" \
  [--aspect-ratio 16:9] [--image ref.png] [--transparent] \
  [--timeout 600] [--no-preflight] [--json]
```

| slug | renders via | format |
|---|---|---|
| `openai-codex/gpt-5.6-sol` (recommended) | Codex CLI | PNG |
| `google-antigravity/gemini-3.7-flash` | Antigravity CLI (`agy`) | JPEG |
| `xai-grok/grok-4.6` | `api.x.ai` directly, on `~/.grok/auth.json` | JPEG |

Other seats fail fast with a list of capable models. The grok seat renders
without `grok` on `PATH`; the CLI is spawned only to refresh the token, before a
request when `expires_at` is close and again as a backstop if one comes back
401. `grok login` is still what sets the seat up.

- `--out` is required and its extension must match the seat's format above
  (`.png` for any `--transparent` run). A mismatch is rejected before anything
  runs. The file holds the model's own bytes verbatim, except on a
  chroma-keyed `--transparent` run, which writes the locally keyed PNG.
- **Render into the asset's real home** (`public/icons/settings.png`) when the
  project keeps it. Drafts go to `.aibridge/`; see [SKILL.md](../SKILL.md).
- `--aspect-ratio N:M` sets geometry. Exact pixels are whatever the model
  renders; resize downstream.
- `--image a.png,b.png` attaches references and routes to the seat's edit path.
- `--json` prints `{ out, bytes, width, height, aspectRatio, model, backend, transparency, real }`.
- Preflight is on by default: an exhausted seat exits 3 and names the
  alternatives instead of spending a paid render. Argument checks run first, so
  bad flags still cost no network call.

### Transparency

- `--transparent` works on every image seat and always writes PNG. Codex gives
  native alpha; grok and gemini are chroma-keyed with binary edges. Fine for
  flat icons, logos and stickers; not for hair, smoke or glass.
- **Say nothing about the background in the prompt when using it.** The CLI
  writes the backdrop instruction per seat, and a colour of your own overrides
  it: the key then finds nothing and the paid render comes back opaque. Writing
  "transparent background" into the prompt without the flag is refused on
  chroma seats.
- **A green subject is keyed away with the backdrop** on chroma seats. Anything
  that must be green needs `openai-codex/*`.
- Both surfaces report the path taken: the result line says
  `transparency: native` / `chroma-keyed`, `--json` carries
  `"native" | "chroma" | null`. Quote it when the edges matter. Keying under 2%
  of the image warns: the model likely ignored the backdrop instruction.

### Reference images

```bash
aibridge image-gen --model openai-codex/gpt-5.6-sol \
  "the same woman, now in a denim shirt in a bright kitchen, waist-up" \
  --out avatar2.png --image avatar.png --aspect-ratio 9:16
```

With a reference, write the prompt as a **diff**: say only what changes. The
reference carries identity, framing and style.

## B. Writing the prompt

1. **Never state the image's purpose** (no "app icon", "hero banner"). Describe
   how it looks, not its job.
2. **Give the aspect ratio** via `--aspect-ratio` and/or the prompt text.
3. **Always specify the background**: a hex colour, or `opaque`/`auto`. Except
   on a `--transparent` run, where you say nothing about it.
4. **Specify** subject, composition, palette, style/medium, mood, lighting.
5. **Lock the critical, free the rest.** Lock verbatim text in straight quotes,
   brand hex, required layout, the hero subject, and every "no X". Over-specified
   incidental detail flattens the result.

### Worked example

> `Square 1:1 aspect ratio. Solid warm cream #F7F1EA background. A single flat-design
> fanned stack of three rounded-corner cards in coral orange #FF5A1F, centered,
> ~55% of the frame, soft drop shadow. Calm, minimal, modern. No text, no border,
> no gradient.`

Locked: ratio, background hex, subject, brand orange, the no-text/border/gradient
constraints. Free: fan angle, shadow softness, spacing. On a `--transparent` run,
drop the background sentence and the drop shadow: a soft shadow has no flat
backdrop colour to key against and survives as a pale halo.

### Edits and retries

1. **Describe the desired result.** State what the finished image contains,
   rather than only what to remove or correct.
2. **Name the visual criterion first.** Phrases such as "the near plane" or
   "everyone waiting" often work better than an object inventory. Enumerate
   objects only if the criterion fails.
3. **Rewrite failed prompts; do not append to them.** Simplify the request. For
   a near-correct render, make the next instruction as short as possible.
4. **Change strategy after the same failure occurs twice.** Try a different
   reference, composition, or fresh generation instead of another rewording.
5. **Retry from the original reference.** Chaining generated outputs causes
   unrequested details to drift.
6. **Check your terminology.** A near-miss word can produce a coherent image of
   the wrong concept.
7. **Verify unchanged details in context.** Inspect the asset in its final
   placement and, when relevant, in motion.
