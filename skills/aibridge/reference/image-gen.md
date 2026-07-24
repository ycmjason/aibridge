# image-gen — generate an image via a model seat

Two parts: **(A) call it**, **(B) write the prompt** — (B) determines quality and
matters even if you only hand the prompt back.

## A. Calling it

```bash
aibridge image-gen --model <slug> --out out.png "<full prompt — see Part B>" \
  [--aspect-ratio 16:9] [--image ref.png] \
  [--timeout 600] [--json]
```

`--model` is required and uses the **same canonical slugs as every other command**
(`resolveModel`; no short aliases). Image-capable seats today:

| slug | backend CLI | renders |
|---|---|---|
| `openai-codex/gpt-5.6-sol` (recommended) | Codex CLI | PNG |
| `google-antigravity/gemini-3.6-flash` | Antigravity CLI (`agy`) | JPEG |
| `xai-grok/grok-4.5` | Grok CLI | JPEG |

Other seats fail fast with a list of capable models.

Notes:

- `--out` is required, and its extension must match the seat's format (see the
  table above). A mismatch is rejected before anything runs. The file holds the
  model's own bytes, verbatim.
- `--aspect-ratio N:M` (e.g. `16:9`, `1:1`) sets the geometry. Output dimensions
  are whatever the model renders at that ratio — resize downstream for exact
  pixels.
- `--image` attaches reference image(s) (comma-separated paths) — every seat
  routes them to its edit path. See **Reference images** below.
- `--json` prints `{ out, bytes, width, height, aspectRatio, model, backend, real }`.

### Reference images (`--image`)

Attach one or more existing images and the model edits/varies *them* instead of
inventing from scratch — e.g. keep the same subject, change only what you ask:

```bash
aibridge image-gen --model openai-codex/gpt-5.6-sol "the same woman, now in a denim shirt in a bright kitchen, waist-up" \
  --out avatar2.png --image avatar.png --aspect-ratio 9:16

# same brief, on a different seat
aibridge image-gen --model xai-grok/grok-4.5 "the same woman, now in a denim shirt in a bright kitchen, waist-up" \
  --out avatar2.jpg --image avatar.jpg --aspect-ratio 9:16
```

With a reference, write the prompt as a **diff** — say only what should *change*
("same person, new outfit/background"); the reference carries identity, framing,
and style. Multiple refs: `--image face.png,style.png`.

## B. Writing the prompt

1. **Don't state the image's purpose** (no "app icon", "hero banner") — describe
   what it *looks like*, not its job.
2. **Specify the aspect ratio** via `--aspect-ratio` and/or the prompt text
   (e.g. `16:9`, `1:1`).
3. **Always specify the background** — a concrete colour with hex, or
   `opaque`/`auto`. Renders come back opaque, so key the alpha out of a flat
   colour afterwards if you need it.
4. **Specify what matters**: subject, composition, palette, style/medium, mood,
   lighting.
5. **Abstraction dial** — *lock* the critical (verbatim text in straight quotes,
   brand hex, required layout, the one hero subject, and any "no X"), *free* the
   rest. Over-specifying incidental detail flattens the result; under-specifying
   the critical breaks the brief.

### Worked example

> `Square 1:1 aspect ratio. Solid warm cream #F7F1EA background. A single flat-design
> fanned stack of three rounded-corner cards in coral orange #FF5A1F, centered,
> ~55% of the frame, soft drop shadow. Calm, minimal, modern. No text, no border,
> no gradient.`

It locks aspect ratio, background hex, subject, brand orange, and the no-text/border/
gradient constraints — and leaves the fan angle, shadow softness, and spacing to
the model.
