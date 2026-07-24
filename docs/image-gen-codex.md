# `image-gen` → codex (gpt-image-2) — findings & implementation

> Provenance: carried from the pre-existing `image-gen` skill **[skill]** (verified
> on this machine previously) and OpenAI docs **[web]**. Re-verify the codex
> version locally before relying on it.

## How it works

The Codex CLI (≥ ~0.135) has a built-in `image_gen` tool: putting **`$imagegen`**
in the prompt renders with **gpt-image-2**, billed to the user's Codex/ChatGPT
usage — **no `OPENAI_API_KEY`** **[skill]**.

- Binary: `codex` (this machine: `~/.local/bin/codex`). Discover and require
  ≥ ~0.135; a stale codex on `PATH` silently hangs on `$imagegen`.

## Headless recipe [skill]

```bash
codex exec --full-auto --skip-git-repo-check -C <outdir> \
  '$imagegen <full prompt>. Save the image-generation tool output DIRECTLY as
  out.png. Do NOT redraw, trace, or post-process it with code (no PIL/Pillow/
  ImageMagick) — use the image_gen result as-is, even if imperfect.'
```

⚠️ **`codex exec` is an AGENT and will silently substitute.** Without the explicit
"save directly / do not redraw" instruction it may judge the gpt-image-2 output
"imperfect" and replace it with a crude **code-drawn (PIL)** image (a ~19 KB fake
vs an ~884 KB real render). **Always forbid the redraw.**

## ⚠️ Verify it's a real render, not a code-drawn fake

A genuine gpt-image-2 PNG is **hundreds of KB to MB**; a PIL substitute is **tiny
(~10–30 KB)**. The impl MUST size-check:

```ts
// real if bytes > ~100_000
```

Raw renders are cached at `~/.codex/generated_images/<uuid>/ig_*.png` — useful to
locate the true source if `out.png` looks wrong:

```bash
ls -t ~/.codex/generated_images/*/ig_*.png | head -1
```

## Quality, size, transparency [skill/web]

- **Quality** low/medium/high — no flag; **say it in the prompt** ("render at HIGH
  quality"). High is what the ChatGPT app uses; use it for in-image text, logos,
  shipping assets (costs ~15× low). A soft/blurry result is usually the tier, not
  the resolution.
- **Exact pixel size isn't guaranteed** by codex's `image_gen` — verify `out.png`
  and resize if exactness matters (`magick out.png -resize 1024x1024 out.png`).
- gpt-image-2 constraints: both edges **divisible by 16**, ratio **1:3–3:1**,
  longest edge **≤ 3840 px**, total pixels **655,360–8,294,400**.
- **Transparency**: gpt-image-2 API only accepts `auto`/`opaque` — it **cannot**
  emit a transparent PNG. For alpha: generate opaque on a flat keyable colour and
  remove it (`magick in.png -fuzz 8% -transparent '#F7F1EA' out.png`), or route to
  gpt-image-1.5 / the ChatGPT app.
- **Reference images / edits**: attach with `-i ref.png`. ⚠️ `-i` is
  space-variadic — put the prompt **before** `-i`, or pipe it via stdin. Multiple:
  `-i a.png,b.png`.

## Implementation checklist for `packages/cli/src/commands/image-gen/impl.ts`

- [ ] Resolve `--out` (default `./ai-bridge-image.png`), `--size`, `--quality`.
- [ ] Discover a codex ≥ ~0.135; error clearly if missing/stale.
- [ ] Run `codex exec --full-auto --skip-git-repo-check -C <dir>` with the prompt,
      folding in the "save directly, don't redraw" guard and "render at <quality>
      quality" (default high).
- [ ] Locate the produced PNG; **verify bytes > ~100 KB** (real vs PIL fake) and
      re-run forbidding redraw if suspect.
- [ ] If `--size` given and the render differs, resize (ImageMagick if available).
- [ ] Move/copy to `--out`.
- [ ] `--json` → print `{ out, bytes, sizeRequested, quality, real: true }`; else
      a one-line confirmation with the path.
- [ ] Note: codex/agy stdout capture is NOT the issue here — the deliverable is a
      **file on disk**, so no TTY workaround is needed (unlike `subagent`/agy).

## Prompt-craft

Lives in the `ai-bridge` skill (`skills/ai-bridge/reference/image-gen.md`) —
that's the durable, model-shaping knowledge and stays out of the CLI.

## Sources [web]

- https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide
- https://developers.openai.com/api/docs/guides/image-generation (background/transparency)
- https://developers.openai.com/codex/cli/features
