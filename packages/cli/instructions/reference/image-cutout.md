# image-cutout — cut the background out of an image

Turns an existing image into a PNG with real, soft alpha: hair, glow, glass and
anti-aliased edges survive. Works on every image model, including the JPEG ones.

## Calling it

```bash
aibridge image-cutout --model <slug> --out <file.png> <image> ["<what to keep>"] \
  [--timeout 600] [--no-preflight] [--json]
```

{{image-models}}

- **`<image>` already on one flat colour, no subject given:** one paid call.
  The model re-renders it with only the background changed to a second flat
  colour, and the two renders are solved per pixel for alpha and foreground
  colour (difference matting). The border of the image must be one flat colour
  or the run is refused before spending anything.
- **Subject given** (`"the red car"`, `"the girl on the left"`): two paid calls.
  A first edit keeps only the subject and puts it on flat white; the second
  changes that white to green. Use this for a scene, or to pick one thing out
  of a flat-background image.
- `--out` must end in `.png`. Render into the asset's real home when the project
  keeps it; drafts go to `.aibridge/`.
- The result line reports `transparent`, `soft edge` and `drift` shares. `--json`
  carries `{ out, bytes, width, height, model, backend, calls, background1,
  background2, backgroundDistance, transparentRatio, softRatio, drift }`.

## Reading the numbers

- **drift** is the share of visible pixels where the two renders disagree, i.e.
  the subject moved between them. Measured 4% on agy and 7% on grok for a clean
  pair; above 15% the run warns and the matte ghosts. Re-run: the edit is not
  deterministic, and a second try usually lands.
- **transparent** under 2% warns: the edit kept the old backdrop. Re-run.
- **backgroundDistance** under 50 is refused after the render: the two
  backdrops came back too alike to separate.
- **resized** true means the edit came back at the model's own size and the
  input was rescaled to match. The matte still solves, but resampling adds
  drift (13% measured against 4% on a same-size pair) and shows as faint
  ghosting in fine detail. For the cleanest cut, feed the model an image it
  rendered itself, at its own size: `image-gen` output on the same model is
  ideal.

## With image-gen

For a generated image with a transparent background on a JPEG model:

```bash
aibridge image-gen --model {{image}} --out .aibridge/draft.jpg \
  "<prompt>. Flat solid pure white (#ffffff) background, no shadow."
aibridge image-cutout --model {{image}} --out public/icons/thing.png .aibridge/draft.jpg
```

Ask for no cast or contact shadow in the first prompt: a shadow is part of the
subject to the matte and survives as a grey halo.
<!-- if:codex -->
`openai-codex/gpt-5.6-sol` renders alpha itself when the prompt asks for a
transparent background and no `--image` is attached, so it needs no cutout for
a fresh generation. With a reference attached it paints a fake checkerboard,
and `image-gen` refuses that combination; use `image-cutout` instead.
<!-- endif -->
