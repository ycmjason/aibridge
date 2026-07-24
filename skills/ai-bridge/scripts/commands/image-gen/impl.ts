import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readSync,
  rmSync,
  statSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { LocalContext } from '../../context.ts';
import { ensureCodex, MIN_CODEX_IMAGE, runCodexExec } from '../../lib/codex.ts';
import { ensureGrok, runGrokPrint } from '../../lib/grok.ts';
import {
  DEFAULT_IMAGE_GEN,
  formatImageGenModelError,
  formatUnknownModelError,
  type ResolvedModel,
  resolveModel,
  supportsImageGen,
} from '../../lib/models.ts';
import { isNotFound, type RunResult, runCaptured, stripAnsi } from '../../lib/proc.ts';

export interface ImageGenFlags {
  readonly model?: string;
  readonly out?: string;
  readonly size?: string;
  readonly image?: string;
  readonly quality?: string;
  readonly timeout?: number;
  readonly json: boolean;
}

/** A real gpt-image-2 PNG is hundreds of KB+; a code-drawn (PIL) fake is tiny. */
const MIN_REAL_BYTES_CODEX = 100_000;
/** Imagine renders are often ~60–120 KB JPEGs; anything under ~10 KB is junk. */
const MIN_REAL_BYTES_GROK = 10_000;
const OUT_NAME = 'out.png';

interface Render {
  readonly path: string;
  readonly bytes: number;
}

/** Outcome of one render attempt. */
type RenderOutcome =
  | { readonly kind: 'ok'; readonly render: Render }
  | { readonly kind: 'suspect' } // ran cleanly but produced only a tiny/code-drawn or missing file
  | { readonly kind: 'error'; readonly reason: string }; // timeout / non-zero exit / spawn failure

export default async function imageGen(
  this: LocalContext,
  flags: ImageGenFlags,
  prompt: string,
): Promise<void> {
  const fail = (msg: string): void => {
    this.process.stderr.write(`ai-bridge image-gen: ${msg}\n`);
    this.process.exitCode = 1;
  };

  const inputSlug = flags.model ?? DEFAULT_IMAGE_GEN;
  const model = resolveModel(inputSlug);
  if (!model) return fail(formatUnknownModelError(inputSlug));
  if (!supportsImageGen(model)) return fail(formatImageGenModelError(inputSlug, model));
  // gpt-image-2 does the rendering, not the codex seat model — an effort suffix
  // there buys nothing, so reject it rather than silently ignore it. (grok's
  // effort IS threaded through to the driving agent.)
  if (model.spec.backend === 'codex' && model.effort) {
    return fail(
      `effort "-${model.effort}" has no effect on image-gen (gpt-image-2 renders, not the seat model); use ${DEFAULT_IMAGE_GEN}.`,
    );
  }

  const quality = (flags.quality ?? 'high').toLowerCase();
  if (!['low', 'medium', 'high'].includes(quality)) {
    return fail(`invalid --quality "${flags.quality}" (use low | medium | high)`);
  }

  let size: { w: number; h: number } | undefined;
  if (flags.size !== undefined) {
    const m = flags.size.match(/^(\d+)\s*x\s*(\d+)$/i);
    if (!m) return fail(`invalid --size "${flags.size}" (expected e.g. 1024x1024)`);
    size = { w: Number(m[1]), h: Number(m[2]) };
    if (model.spec.backend === 'codex') {
      const constraint = sizeConstraintError(size.w, size.h);
      if (constraint) return fail(`invalid --size ${size.w}x${size.h}: ${constraint}`);
    } else if (size.w < 1 || size.h < 1) {
      return fail(`invalid --size ${size.w}x${size.h}: dimensions must be positive`);
    }
  }

  const timeoutSec = flags.timeout ?? 600;
  const outPath = resolve(this.process.cwd(), flags.out ?? './ai-bridge-image.png');

  // Resolve + validate optional reference image(s). Absolute paths — backends
  // run in a private work dir (-C / cwd).
  const imagePaths: string[] = [];
  if (flags.image !== undefined) {
    for (const raw of flags.image
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)) {
      const abs = resolve(this.process.cwd(), raw);
      if (!existsSync(abs)) return fail(`reference image not found: ${raw}`);
      imagePaths.push(abs);
    }
  }

  const work = mkdtempSync(join(tmpdir(), 'ai-bridge-imagegen-'));
  try {
    let outcome: RenderOutcome;
    if (model.spec.backend === 'grok') {
      outcome = await renderGrok(this, work, model, prompt, size, imagePaths, timeoutSec);
    } else {
      // codex seat (gpt-image-2)
      const codex = await ensureCodex(MIN_CODEX_IMAGE);
      if (!codex.ok) {
        return fail(
          `${codex.error} (need the image_gen tool; a stale codex silently hangs on $imagegen.)`,
        );
      }
      // First render; retry once with a stronger anti-redraw guard ONLY when the
      // first attempt genuinely looked like a code-drawn substitute. A timeout or
      // codex error is surfaced immediately — never blindly re-billed.
      outcome = await renderCodex(this, work, prompt, quality, size, imagePaths, timeoutSec, false);
      if (outcome.kind === 'suspect') {
        outcome = await renderCodex(
          this,
          work,
          prompt,
          quality,
          size,
          imagePaths,
          timeoutSec,
          true,
        );
      }
    }

    if (outcome.kind === 'error') return fail(outcome.reason);
    if (outcome.kind === 'suspect') {
      return fail(
        model.spec.backend === 'grok'
          ? 'grok produced no usable image. Check SuperGrok image access and re-run with a simpler prompt.'
          : 'codex produced only a tiny/code-drawn image, not a real gpt-image-2 render. ' +
              'Try --quality high or a clearer, simpler prompt.',
      );
    }

    // Copy the chosen render into the work dir FIRST so resizing never mutates the
    // backend cache (codex cache / grok session images).
    const local = join(work, 'result.bin');
    copyFileSync(outcome.render.path, local);

    let dims = imageSize(local);
    if (size && dims && (dims.width !== size.w || dims.height !== size.h)) {
      const resized = await magick([local, '-resize', `${size.w}x${size.h}!`, local]);
      if (resized) {
        dims = imageSize(local) ?? dims;
      } else {
        this.process.stderr.write(
          `ai-bridge image-gen: rendered ${dims.width}x${dims.height}, wanted ${size.w}x${size.h}, ` +
            'and ImageMagick (magick/convert) is unavailable to resize.\n',
        );
      }
    }

    // Make the bytes match the out extension (grok emits JPEG, --out defaults
    // to .png) — ImageMagick converts by dest extension. Warn + copy raw when
    // it's unavailable.
    const outExt = /\.png$/i.test(outPath) ? 'png' : /\.jpe?g$/i.test(outPath) ? 'jpg' : null;
    const actualFmt = pngSize(local) ? 'png' : jpegSize(local) ? 'jpg' : null;
    const needsConvert = outExt !== null && actualFmt !== null && outExt !== actualFmt;
    if (!needsConvert || !(await magick([local, outPath]))) {
      if (needsConvert) {
        this.process.stderr.write(
          `ai-bridge image-gen: render is ${actualFmt.toUpperCase()} but out path wants ` +
            `${outExt.toUpperCase()}, and ImageMagick (magick/convert) is unavailable to convert; ` +
            'writing the raw bytes as-is.\n',
        );
      }
      copyFileSync(local, outPath);
    }
    const bytes = statSync(outPath).size;

    if (flags.json) {
      this.process.stdout.write(
        `${JSON.stringify({
          out: outPath,
          bytes,
          width: dims?.width ?? null,
          height: dims?.height ?? null,
          sizeRequested: flags.size ?? null,
          quality: model.spec.backend === 'codex' ? quality : null,
          model: model.spec.slug,
          backend: model.spec.backend,
          real: true,
        })}\n`,
      );
    } else {
      const kb = Math.round(bytes / 1024);
      const dimStr = dims ? `${dims.width}x${dims.height}, ` : '';
      const qualityStr = model.spec.backend === 'codex' ? `, ${quality} quality` : '';
      this.process.stdout.write(
        `✓ Wrote ${outPath} (${dimStr}${kb} KB${qualityStr}, ${model.spec.slug})\n`,
      );
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// ─── grok / Imagine ──────────────────────────────────────────────────────────

/**
 * Drive one Imagine render via the grok CLI's built-in `image_gen` /
 * `image_edit` tools. The model is instructed to print only the absolute path
 * of the saved file (verified live: headless `grok -p` + `--tools image_gen`
 * returns a single path line and writes under `~/.grok/sessions/…/images/`).
 */
async function renderGrok(
  _ctx: LocalContext,
  work: string,
  model: ResolvedModel,
  userPrompt: string,
  size: { w: number; h: number } | undefined,
  imagePaths: readonly string[],
  timeoutSec: number,
): Promise<RenderOutcome> {
  const grok = await ensureGrok();
  if (!grok.ok) return { kind: 'error', reason: grok.error };

  const aspect = size ? aspectRatioFor(size.w, size.h) : undefined;
  const aspectClause = aspect ? ` aspect_ratio='${aspect}'.` : '';
  const sizeNote = size
    ? ` Prefer a composition that fits ~${size.w}x${size.h} (exact pixels are resized later).`
    : '';

  let instruction: string;
  let tools: string;
  if (imagePaths.length > 0) {
    tools = 'image_edit';
    const refs = imagePaths.map(p => JSON.stringify(p)).join(', ');
    instruction =
      `Call the image_edit tool once with image=[${refs}] and prompt=${JSON.stringify(userPrompt)}.` +
      `${aspect ? ` Pass aspect_ratio='${aspect}' only if the tool accepts it for multi-image edits.` : ''}` +
      `${sizeNote} After the tool returns, print ONLY the absolute filesystem path of the saved image on a single line. No other text.`;
  } else {
    tools = 'image_gen';
    instruction =
      `Call the image_gen tool once with prompt=${JSON.stringify(userPrompt)}.${aspectClause}` +
      `${sizeNote} After the tool returns, print ONLY the absolute filesystem path of the saved image on a single line. No other text.`;
  }

  let result: RunResult;
  try {
    result = await runGrokPrint(instruction, {
      cwd: work,
      model: model.spec.backendModel,
      effort: model.effort,
      skipPermissions: true,
      tools,
      maxTurns: 4,
      timeoutMs: timeoutSec * 1000,
    });
  } catch (err) {
    if (isNotFound(err)) return { kind: 'error', reason: '"grok" not found on PATH.' };
    throw err;
  }

  if (result.timedOut) {
    return {
      kind: 'error',
      reason: `grok render timed out after ~${timeoutSec}s; raise --timeout.`,
    };
  }

  const pathFromStdout = extractPathFromStdout(result.stdout);
  if (pathFromStdout && existsSync(pathFromStdout)) {
    const bytes = safeSize(pathFromStdout);
    if (bytes >= MIN_REAL_BYTES_GROK) {
      return { kind: 'ok', render: { path: pathFromStdout, bytes } };
    }
  }

  // Fallback: newest image under the session folder for this work cwd
  // (session dir is URL-encoded cwd under ~/.grok/sessions/).
  const sessionHit = newestSessionImage(work);
  if (sessionHit && sessionHit.bytes >= MIN_REAL_BYTES_GROK) {
    return { kind: 'ok', render: sessionHit };
  }

  if (result.code !== 0) {
    const tail = stripAnsi(`${result.stderr}\n${result.stdout}`)
      .trim()
      .split('\n')
      .slice(-3)
      .join(' ')
      .slice(0, 300);
    return { kind: 'error', reason: `grok exited ${result.code}${tail ? `: ${tail}` : ''}.` };
  }
  return { kind: 'suspect' };
}

/** Pull the first absolute existing image path out of grok's final message. */
function extractPathFromStdout(stdout: string): string | null {
  const text = stripAnsi(stdout).trim();
  if (!text) return null;
  // Prefer a whole-line absolute path (the instructed contract).
  for (const line of text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)) {
    if (line.startsWith('/') && existsSync(line) && isImagePath(line)) return line;
  }
  // Fallback: first absolute path-looking token ending in an image extension.
  const m = text.match(/(\/(?:[^\s'"`]+)\.(?:png|jpe?g|webp|gif))/i);
  if (m?.[1] && existsSync(m[1])) return m[1];
  return null;
}

function isImagePath(p: string): boolean {
  return /\.(png|jpe?g|webp|gif)$/i.test(p);
}

/**
 * Map a private work cwd to the matching grok session images dir and return
 * the newest image there (by mtime). Session folders are
 * `~/.grok/sessions/<url-encoded-cwd>/<session-id>/images/`.
 */
function newestSessionImage(workCwd: string): Render | null {
  const sessionsRoot = join(homedir(), '.grok', 'sessions');
  if (!existsSync(sessionsRoot)) return null;

  // macOS often resolves /tmp → /private/tmp; try both the given cwd and its
  // real path so session lookup still hits.
  const candidates = new Set<string>([workCwd]);
  try {
    candidates.add(resolve(workCwd));
  } catch {
    // ignore
  }

  const hits: Render[] = [];
  for (const cwd of candidates) {
    const encoded = encodeURIComponent(cwd);
    const base = join(sessionsRoot, encoded);
    if (!existsSync(base)) continue;
    for (const session of safeReaddir(base)) {
      const imagesDir = join(base, session, 'images');
      if (!existsSync(imagesDir)) continue;
      for (const f of safeReaddir(imagesDir)) {
        if (!isImagePath(f)) continue;
        const path = join(imagesDir, f);
        hits.push({ path, bytes: safeSize(path) });
      }
    }
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => mtime(b.path) - mtime(a.path));
  return hits[0] ?? null;
}

/** Closest Imagine aspect_ratio label for a WxH pair. */
function aspectRatioFor(w: number, h: number): string {
  const ratio = w / h;
  const options: ReadonlyArray<{ readonly label: string; readonly r: number }> = [
    { label: '1:1', r: 1 },
    { label: '16:9', r: 16 / 9 },
    { label: '9:16', r: 9 / 16 },
    { label: '4:3', r: 4 / 3 },
    { label: '3:4', r: 3 / 4 },
    { label: '3:2', r: 3 / 2 },
    { label: '2:3', r: 2 / 3 },
  ];
  let best = options[0];
  if (!best) return '1:1';
  let bestDist = Math.abs(ratio - best.r);
  for (const o of options.slice(1)) {
    const d = Math.abs(ratio - o.r);
    if (d < bestDist) {
      best = o;
      bestDist = d;
    }
  }
  return best.label;
}

// ─── codex / gpt-image-2 ─────────────────────────────────────────────────────

/**
 * Drive one codex render into `work`, then locate the produced PNG. Distinguishes
 * a clean run that yielded only a tiny/code-drawn file (`suspect`, worth a retry)
 * from a timeout / codex failure (`error`, surfaced immediately).
 */
async function renderCodex(
  ctx: LocalContext,
  work: string,
  userPrompt: string,
  quality: string,
  size: { w: number; h: number } | undefined,
  imagePaths: readonly string[],
  timeoutSec: number,
  forceful: boolean,
): Promise<RenderOutcome> {
  const sizeClause = size ? ` The image must be exactly ${size.w}x${size.h} pixels.` : '';
  const refClause = imagePaths.length
    ? 'Use the attached image(s) as the visual reference for the subject/identity, ' +
      'changing only what the instruction asks. '
    : '';
  const guard = forceful
    ? 'CRITICAL: a previous attempt produced a code-drawn substitute. You MUST call the image_gen ' +
      'tool (gpt-image-2) and save its raw binary output unchanged. Do NOT draw the image with any ' +
      'library (no PIL/Pillow/ImageMagick/matplotlib/cairo) under any circumstances.'
    : `Save the image-generation tool output DIRECTLY as ${OUT_NAME} in the current directory. Do NOT ` +
      'redraw, trace, or reproduce it with code (no PIL/Pillow/ImageMagick/matplotlib) — write the raw ' +
      'image_gen result as-is, even if imperfect.';

  const prompt = `$imagegen ${refClause}${userPrompt}. Render at ${quality.toUpperCase()} quality.${sizeClause} ${guard}`;

  // Snapshot the global cache BEFORE spawning so we can attribute only NEW renders
  // to this run (the cache is shared across all codex sessions on this machine).
  const before = cacheRenderPaths();

  let result: RunResult;
  try {
    result = await runCodexExec(prompt, {
      cwd: work,
      approval: 'full-auto',
      images: imagePaths,
      timeoutMs: timeoutSec * 1000,
    });
  } catch (err) {
    if (isNotFound(err)) return { kind: 'error', reason: '"codex" not found on PATH.' };
    throw err;
  }

  if (result.timedOut) {
    return {
      kind: 'error',
      reason: `codex render timed out after ~${timeoutSec}s; raise --timeout.`,
    };
  }

  // Prefer the file codex was told to write into our private work dir.
  const direct = join(work, OUT_NAME);
  if (existsSync(direct)) {
    const bytes = safeSize(direct);
    if (bytes >= MIN_REAL_BYTES_CODEX) return { kind: 'ok', render: { path: direct, bytes } };
  }

  // Fall back to a render that appeared in the cache during this run (codex
  // sometimes only writes there). Set-difference vs the pre-spawn snapshot — no
  // wall-clock slack, so a stale/concurrent image can't be mis-attributed.
  const fresh = [...cacheRenderPaths()]
    .filter(p => !before.has(p))
    .map(path => ({ path, bytes: safeSize(path) }))
    .filter(r => r.bytes >= MIN_REAL_BYTES_CODEX)
    .sort((a, b) => mtime(b.path) - mtime(a.path));

  if (fresh.length > 1) {
    ctx.process.stderr.write(
      `ai-bridge image-gen: ${fresh.length} new cached renders appeared; using the most recent.\n`,
    );
  }
  if (fresh[0]) return { kind: 'ok', render: fresh[0] };

  // codex ran but produced nothing usable.
  if (result.code !== 0) {
    const tail = stripAnsi(result.stderr).trim().split('\n').slice(-3).join(' ').slice(0, 300);
    return { kind: 'error', reason: `codex exited ${result.code}${tail ? `: ${tail}` : ''}.` };
  }
  return { kind: 'suspect' };
}

/** Every `~/.codex/generated_images/<uuid>/ig_*.png` currently on disk. */
function cacheRenderPaths(): Set<string> {
  const base = join(homedir(), '.codex', 'generated_images');
  const paths = new Set<string>();
  if (!existsSync(base)) return paths;
  for (const sub of safeReaddir(base)) {
    for (const f of safeReaddir(join(base, sub))) {
      if (/^ig_.*\.png$/i.test(f)) paths.add(join(base, sub, f));
    }
  }
  return paths;
}

// ─── shared helpers ──────────────────────────────────────────────────────────

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function safeSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function mtime(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

/** gpt-image-2 dimension constraints; returns an error message or null if valid. */
function sizeConstraintError(w: number, h: number): string | null {
  if (w % 16 !== 0 || h % 16 !== 0) return 'each edge must be divisible by 16';
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  if (long / short > 3) return 'aspect ratio must be within 1:3–3:1';
  if (long > 3840) return 'longest edge must be <= 3840px';
  const px = w * h;
  if (px < 655_360 || px > 8_294_400) return 'total pixels must be 655,360–8,294,400';
  return null;
}

/** Read width/height from a PNG or JPEG header without loading the whole file. */
function imageSize(path: string): { width: number; height: number } | null {
  return pngSize(path) ?? jpegSize(path);
}

function pngSize(path: string): { width: number; height: number } | null {
  try {
    const fd = openSync(path, 'r');
    const head = Buffer.alloc(24);
    readSync(fd, head, 0, 24, 0);
    closeSync(fd);
    if (head.toString('latin1', 1, 4) !== 'PNG') return null;
    if (head.toString('latin1', 12, 16) !== 'IHDR') return null;
    return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
  } catch {
    return null;
  }
}

/** Baseline SOF0/SOF2 JPEG size (enough for Imagine outputs). */
function jpegSize(path: string): { width: number; height: number } | null {
  try {
    const fd = openSync(path, 'r');
    const buf = Buffer.alloc(64 * 1024);
    const n = readSync(fd, buf, 0, buf.length, 0);
    closeSync(fd);
    if (n < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    let i = 2;
    while (i + 9 < n) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      if (marker === undefined) return null;
      // SOF0 / SOF1 / SOF2
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        const height = buf.readUInt16BE(i + 5);
        const width = buf.readUInt16BE(i + 7);
        return { width, height };
      }
      if (marker === 0xd9 || marker === 0xda) return null; // EOI / SOS
      const len = buf.readUInt16BE(i + 2);
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  } catch {
    return null;
  }
}

/** Run ImageMagick (magick, then legacy convert) with the given args. False when absent/failed. */
async function magick(args: readonly string[]): Promise<boolean> {
  for (const tool of ['magick', 'convert']) {
    try {
      const r = await runCaptured(tool, [...args], { timeoutMs: 60_000 });
      if (!r.timedOut && r.code === 0) return true;
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }
  return false;
}
