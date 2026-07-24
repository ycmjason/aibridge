import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isNotFound, type RunResult, runCaptured, stripAnsi } from '@aibridge/proc';
import { buildAgyPrintArgs } from './agy.ts';
import { probe } from './probe.ts';

export interface ImageGenRequest {
  readonly prompt: string;
  readonly workDir: string;
  readonly backendModel: string;
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

interface Render {
  readonly path: string;
  readonly bytes: number;
}

export async function generateImage(
  req: ImageGenRequest,
  exec: typeof runCaptured = runCaptured,
): Promise<ImageResult> {
  const agy = await probe(exec);
  if (!agy.ok) return { kind: 'error', reason: agy.error };

  const aspect = req.size ? aspectRatioFor(req.size.w, req.size.h) : undefined;
  const sizeNote = req.size
    ? ` Prefer a composition that fits ~${req.size.w}x${req.size.h} (exact pixels are resized later).`
    : '';

  let instruction: string;
  if (req.imagePaths.length > 0) {
    const refs = req.imagePaths.map(p => JSON.stringify(p)).join(', ');
    instruction =
      `Call the generate_image tool once with ImageName="aibridge-render", Prompt=${JSON.stringify(req.prompt)}, and ImagePaths=[${refs}]. ` +
      `Change only what the instruction asks, using the references for subject/identity.` +
      `${aspect ? ` Pass AspectRatio='${aspect}' only if applicable.` : ''}` +
      `${sizeNote} After the tool returns, print ONLY the absolute filesystem path of the saved image on a single line. No other text.`;
  } else {
    instruction =
      `Call the generate_image tool once with ImageName="aibridge-render" and Prompt=${JSON.stringify(req.prompt)}.` +
      `${aspect ? ` Pass AspectRatio='${aspect}'.` : ''}` +
      `${sizeNote} After the tool returns, print ONLY the absolute filesystem path of the saved image on a single line. No other text.`;
  }

  const beforePaths = brainImagePaths();

  let result: RunResult;
  try {
    const args = buildAgyPrintArgs(instruction, {
      model: req.backendModel,
      printTimeoutSec: req.timeoutSec,
      skipPermissions: true,
      addDirs: [req.workDir],
    });
    result = await exec('agy', args, { cwd: req.workDir, timeoutMs: req.timeoutSec * 1000 });
  } catch (err) {
    if (isNotFound(err)) return { kind: 'error', reason: '"agy" not found on PATH.' };
    throw err;
  }

  if (result.timedOut) {
    return {
      kind: 'error',
      reason: `agy render timed out after ~${req.timeoutSec}s; raise --timeout.`,
    };
  }

  const pathFromStdout = extractPathFromStdout(result.stdout);
  if (pathFromStdout && existsSync(pathFromStdout)) {
    const bytes = safeSize(pathFromStdout);
    if (bytes >= req.minBytes) {
      return { kind: 'ok', path: pathFromStdout, bytes };
    }
  }

  const newestHit = newestNewBrainImage(beforePaths);
  if (newestHit && newestHit.bytes >= req.minBytes) {
    return { kind: 'ok', path: newestHit.path, bytes: newestHit.bytes };
  }

  if (result.code !== 0) {
    const tail = stripAnsi(`${result.stderr}\n${result.stdout}`)
      .trim()
      .split('\n')
      .slice(-3)
      .join(' ')
      .slice(0, 300);
    return { kind: 'error', reason: `agy exited ${result.code}${tail ? `: ${tail}` : ''}.` };
  }
  return { kind: 'suspect' };
}

function extractPathFromStdout(stdout: string): string | null {
  const text = stripAnsi(stdout).trim();
  if (!text) return null;
  for (const line of text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)) {
    if (line.startsWith('/') && existsSync(line) && isImagePath(line)) return line;
  }
  const m = text.match(/(\/(?:[^\s'"`]+)\.(?:png|jpe?g|webp|gif))/i);
  if (m?.[1] && existsSync(m[1])) return m[1];
  return null;
}

function isImagePath(p: string): boolean {
  return /\.(png|jpe?g|webp|gif)$/i.test(p);
}

function brainImagePaths(): Set<string> {
  const root = join(homedir(), '.gemini', 'antigravity-cli', 'brain');
  const paths = new Set<string>();
  for (const session of safeReaddir(root)) {
    const sessionDir = join(root, session);
    for (const f of safeReaddir(sessionDir)) {
      if (f.startsWith('.')) continue;
      if (isImagePath(f)) {
        paths.add(join(sessionDir, f));
      }
    }
  }
  return paths;
}

function newestNewBrainImage(before: Set<string>): Render | null {
  const root = join(homedir(), '.gemini', 'antigravity-cli', 'brain');
  const hits: Render[] = [];
  for (const session of safeReaddir(root)) {
    const sessionDir = join(root, session);
    for (const f of safeReaddir(sessionDir)) {
      if (f.startsWith('.')) continue;
      if (!isImagePath(f)) continue;
      const path = join(sessionDir, f);
      if (!before.has(path)) {
        hits.push({ path, bytes: safeSize(path) });
      }
    }
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => mtime(b.path) - mtime(a.path));
  return hits[0] ?? null;
}

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
