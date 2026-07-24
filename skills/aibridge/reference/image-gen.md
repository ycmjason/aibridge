# image-gen — generate an image via a model seat

Two parts: **(A) call it**, **(B) write the prompt** — (B) determines quality and
matters even if you only hand the prompt back.

## A. Calling it

```bash
aibridge image-gen "<full prompt — see Part B>" \
  [--model <slug>] [--out out.png] [--size 1024x1024] [--image ref.png] \
  [--timeout 600] [--json]
```

`--model` uses the **same canonical slugs as every other command**
(`resolveModel`; no short aliases). Image-capable seats today:

| slug | backend CLI |
|---|---|
| `openai-codex/gpt-5.6-sol` (default) | Codex CLI |
| `google-antigravity/gemini-3.6-flash` | Antigravity CLI (`agy`) |
| `xai-grok/grok-4.5` | Grok CLI |

Other seats fail fast with a list of capable models.

Notes:

- `--out` defaults to `./aibridge-image.png`. **agy** renders JPEG, so saving to `--out foo.png` uses ImageMagick (`magick`/`convert`) to convert; if unavailable, the CLI warns and writes raw bytes as-is.
- `--size WxH` — on **codex**, validated against its render limits (each edge
  divisible by 16, ratio 1:3–3:1, 0.65–8.3 MP). On **agy** and **grok**, mapped to the
  nearest aspect ratio (`1:1`, `16:9`, …); exact pixels are resized
  afterwards when ImageMagick is available.
- `--image` attaches reference image(s) (comma-separated paths) — every seat
  routes them to its edit path. See **Reference images** below.
- **There is no quality flag.** No backend's image tool takes a quality
  parameter (codex: `prompt`, `referenced_image_paths`,
  `num_last_images_to_include`; grok: `prompt`, `aspect_ratio`; agy: `Prompt`,
  `ImageName`, `AspectRatio`, `ImagePaths`) — put any quality wording in the
  prompt itself, where it actually reaches the model.
- `--json` prints `{ out, bytes, width, height, sizeRequested, model, backend, real }`.

### Reference images (`--image`)

Attach one or more existing images and the model edits/varies *them* instead of
inventing from scratch — e.g. keep the same subject, change only what you ask:

```bash
aibridge image-gen "the same woman, now in a denim shirt in a bright kitchen, waist-up" \
  --image avatar.png --size 768x1344

# same brief, on a different seat
aibridge image-gen "the same woman, now in a denim shirt in a bright kitchen, waist-up" \
  --model xai-grok/grok-4.5 --image avatar.png --size 768x1344
```

With a reference, write the prompt as a **diff** — say only what should *change*
("same person, new outfit/background"); the reference carries identity, framing,
and style. Multiple refs: `--image face.png,style.png`.

## B. Writing the prompt

1. **Don't state the image's purpose** (no "app icon", "hero banner") — describe
   what it *looks like*, not its job.
2. **Always specify dimensions.** Exact `WxH`, both edges divisible by 16, ratio
   1:3–3:1, 0.65–8.3 MP when targeting codex (e.g. `1024x1024`, `1536x640`).
3. **Always specify the background** — a concrete colour with hex, or
   `opaque`/`auto`. (No seat emits transparency — grok and agy render opaque
   JPEGs; key the alpha out of a flat colour afterwards if you need it.)
4. **Specify what matters**: subject, composition, palette, style/medium, mood,
   lighting.
5. **Abstraction dial** — *lock* the critical (verbatim text in straight quotes,
   brand hex, required layout, the one hero subject, and any "no X"), *free* the
   rest. Over-specifying incidental detail flattens the result; under-specifying
   the critical breaks the brief.

### Worked example

> `1024x1024, square. Solid warm cream #F7F1EA background. A single flat-design
> fanned stack of three rounded-corner cards in coral orange #FF5A1F, centered,
> ~55% of the frame, soft drop shadow. Calm, minimal, modern. No text, no border,
> no gradient.`

It locks size, background hex, subject, brand orange, and the no-text/border/
gradient constraints — and leaves the fan angle, shadow softness, and spacing to
the model.
