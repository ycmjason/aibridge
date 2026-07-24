import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isNotFound, type RunResult, runCaptured, stripAnsi } from '@ai-bridge/proc';
import { buildCodexExecArgs, ensureCodex, MIN_CODEX_IMAGE } from './codex.ts';

export interface ImageGenRequest {
  readonly prompt: string;
  readonly workDir: string;
  readonly backendModel: string | undefined;
  readonly effort?: string | undefined;
  readonly quality: string;
  readonly size: { readonly w: number; readonly h: number } | undefined;
  readonly imagePaths: readonly string[];
  readonly timeoutSec: number;
  readonly forceful: boolean;
  readonly minBytes: number;
}

export type ImageResult =
  | { readonly kind: 'ok'; readonly path: string; readonly bytes: number }
  | { readonly kind: 'suspect' }
  | { readonly kind: 'error'; readonly reason: string };

const OUT_NAME = 'out.png';

export async function generateImage(
  req: ImageGenRequest,
  exec: typeof runCaptured = runCaptured,
): Promise<ImageResult> {
  const codex = await ensureCodex(MIN_CODEX_IMAGE, exec);
  if (!codex.ok) {
    return {
      kind: 'error',
      reason: `${codex.error} (need the image_gen tool; a stale codex silently hangs on $imagegen.)`,
    };
  }

  const sizeClause = req.size
    ? ` The image must be exactly ${req.size.w}x${req.size.h} pixels.`
    : '';
  const refClause = req.imagePaths.length
    ? 'Use the attached image(s) as the visual reference for the subject/identity, ' +
      'changing only what the instruction asks. '
    : '';
  const guard = req.forceful
    ? 'CRITICAL: a previous attempt produced a code-drawn substitute. You MUST call the image_gen ' +
      'tool (gpt-image-2) and save its raw binary output unchanged. Do NOT draw the image with any ' +
      'library (no PIL/Pillow/ImageMagick/matplotlib/cairo) under any circumstances.'
    : `Save the image-generation tool output DIRECTLY as ${OUT_NAME} in the current directory. Do NOT ` +
      'redraw, trace, or reproduce it with code (no PIL/Pillow/ImageMagick/matplotlib) — write the raw ' +
      'image_gen result as-is, even if imperfect.';

  const prompt = `$imagegen ${refClause}${req.prompt}. Render at ${req.quality.toUpperCase()} quality.${sizeClause} ${guard}`;

  const before = cacheRenderPaths();

  let result: RunResult;
  try {
    const args = buildCodexExecArgs(prompt, {
      cwd: req.workDir,
      approval: 'full-auto',
      images: req.imagePaths,
      timeoutMs: req.timeoutSec * 1000,
    });
    result = await exec('codex', args, {
      cwd: req.workDir,
      timeoutMs: req.timeoutSec * 1000,
    });
  } catch (err) {
    if (isNotFound(err)) return { kind: 'error', reason: '"codex" not found on PATH.' };
    throw err;
  }

  if (result.timedOut) {
    return {
      kind: 'error',
      reason: `codex render timed out after ~${req.timeoutSec}s; raise --timeout.`,
    };
  }

  const direct = join(req.workDir, OUT_NAME);
  if (existsSync(direct)) {
    const bytes = safeSize(direct);
    if (bytes >= req.minBytes) return { kind: 'ok', path: direct, bytes };
  }

  const fresh = [...cacheRenderPaths()]
    .filter(p => !before.has(p))
    .map(path => ({ path, bytes: safeSize(path) }))
    .filter(r => r.bytes >= req.minBytes)
    .sort((a, b) => mtime(b.path) - mtime(a.path));

  if (fresh.length > 1) {
    process.stderr.write(
      `ai-bridge image-gen: ${fresh.length} new cached renders appeared; using the most recent.\n`,
    );
  }

  if (fresh[0]) return { kind: 'ok', path: fresh[0].path, bytes: fresh[0].bytes };

  if (result.code !== 0) {
    const tail = stripAnsi(result.stderr).trim().split('\n').slice(-3).join(' ').slice(0, 300);
    return { kind: 'error', reason: `codex exited ${result.code}${tail ? `: ${tail}` : ''}.` };
  }
  return { kind: 'suspect' };
}

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
