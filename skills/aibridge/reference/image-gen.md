# image-gen — generate an image via a model seat

Two parts: **(A) call it**, **(B) write the prompt** — (B) determines quality and
matters even if you only hand the prompt back.

## A. Calling it

```bash
aibridge image-gen --model <slug> --out <file.png> "<full prompt — see Part B>" \
  [--aspect-ratio 16:9] [--image ref.png] [--transparent] \
  [--timeout 600] [--json]
```

`--model` is required and uses the **same canonical slugs as every other command**
(`resolveModel`; no short aliases). Image-capable seats today:

| slug | backend CLI | renders |
|---|---|---|
| `openai-codex/gpt-5.6-sol` (recommended) | Codex CLI | PNG |
| `google-antigravity/gemini-3.7-flash` | Antigravity CLI (`agy`) | JPEG |
| `xai-grok/grok-4.6` | Grok CLI | JPEG |

Other seats fail fast with a list of capable models.

Notes:

- `--out` is required, and its extension must match the seat's format (see the
  table above; `.png` for any `--transparent` run). A mismatch is rejected
  before anything runs. The file holds the model's own bytes, verbatim (or PNG
  with chroma-keyed alpha when `--transparent` is used on a JPEG seat).
- `--transparent` is safe on every image seat and always writes PNG. Codex gives
  soft, native alpha; grok and gemini are chroma-keyed with binary edges — fine
  for flat icons, logos and stickers, not for hair, smoke or glass. On a
  chroma-keyed seat a **strongly green subject is keyed away with the backdrop** —
  ask a native-alpha seat (`openai-codex/*`) for anything that must be green. Both
  surfaces report which path ran, so quote it when the edges matter: the result
  line says `transparency: native` / `chroma-keyed`, and `--json` carries
  `transparency: "native" | "chroma" | null`.
- Want a transparent background? Pass `--transparent` and say nothing about the
  background in the prompt — the CLI writes the backdrop instruction itself, per
  seat. Never hand-write "transparent background", "no background" or chroma-key
  wording into the prompt; on a JPEG-only seat that silently returns an opaque
  image (aibridge refuses the run and tells you to pass the flag).
- **Render straight into the asset's real home** (`public/icons/settings.png`,
  `src/assets/hero.jpg`) when the project will keep it — no scratch-then-move.
  Drafts and explorations go to the `.aibridge/` sketchpad instead; promote the
  keeper to its real path. See [SKILL.md](../SKILL.md).
- `--aspect-ratio N:M` (e.g. `16:9`, `1:1`) sets the geometry. Output dimensions
  are whatever the model renders at that ratio — resize downstream for exact
  pixels.
- `--image` attaches reference image(s) (comma-separated paths) — every seat
  routes them to its edit path. See **Reference images** below.
- `--json` prints `{ out, bytes, width, height, aspectRatio, model, backend, transparency, real }`.

### Reference images (`--image`)

Attach one or more existing images and the model edits/varies *them* instead of
inventing from scratch — e.g. keep the same subject, change only what you ask:

```bash
aibridge image-gen --model openai-codex/gpt-5.6-sol "the same woman, now in a denim shirt in a bright kitchen, waist-up" \
  --out avatar2.png --image avatar.png --aspect-ratio 9:16

# same brief, on a different seat
aibridge image-gen --model xai-grok/grok-4.6 "the same woman, now in a denim shirt in a bright kitchen, waist-up" \
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
   `opaque`/`auto`. **Unless you passed `--transparent`**: then say nothing about
   the background at all, in the prompt or the example below. The CLI appends the
   backdrop instruction itself, and a colour of your own contradicts it — the
   model obeys yours, the key finds nothing, and the paid render comes back
   opaque.
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

The same prompt for a `--transparent` run simply drops the background sentence —
`Square 1:1 aspect ratio. A single flat-design fanned stack …` — and drops the
drop shadow too, since a soft shadow has no flat backdrop colour to key against
and survives as a pale halo.
