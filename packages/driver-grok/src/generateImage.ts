import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { isNotFound, type RunResult, runCaptured, stripAnsi } from '@aibridge/proc';
import { buildGrokPrintArgs, ensureGrok } from './grok.ts';

export interface ImageGenRequest {
  readonly prompt: string;
  readonly workDir: string;
  readonly backendModel: string;
  readonly effort?: string | undefined;
  readonly aspectRatio: string | undefined;
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
  const grok = await ensureGrok(exec);
  if (!grok.ok) return { kind: 'error', reason: grok.error };

  const aspectClause = req.aspectRatio ? ` aspect_ratio='${req.aspectRatio}'.` : '';

  let instruction: string;
  let tools: string;
  if (req.imagePaths.length > 0) {
    tools = 'image_edit';
    const refs = req.imagePaths.map(p => JSON.stringify(p)).join(', ');
    instruction =
      `Call the image_edit tool once with image=[${refs}] and prompt=${JSON.stringify(req.prompt)}.` +
      `${req.aspectRatio ? ` Pass aspect_ratio='${req.aspectRatio}' only if the tool accepts it for multi-image edits.` : ''}` +
      ` After the tool returns, print ONLY the absolute filesystem path of the saved image on a single line. No other text.`;
  } else {
    tools = 'image_gen';
    instruction =
      `Call the image_gen tool once with prompt=${JSON.stringify(req.prompt)}.${aspectClause}` +
      ` After the tool returns, print ONLY the absolute filesystem path of the saved image on a single line. No other text.`;
  }

  let result: RunResult;
  try {
    const args = buildGrokPrintArgs(instruction, {
      model: req.backendModel,
      effort: req.effort,
      skipPermissions: true,
      tools,
      maxTurns: 4,
    });
    result = await exec('grok', args, {
      cwd: req.workDir,
      timeoutMs: req.timeoutSec * 1000,
    });
  } catch (err) {
    if (isNotFound(err)) return { kind: 'error', reason: '"grok" not found on PATH.' };
    throw err;
  }

  if (result.timedOut) {
    return {
      kind: 'error',
      reason: `grok render timed out after ~${req.timeoutSec}s; raise --timeout.`,
    };
  }

  const pathFromStdout = extractPathFromStdout(result.stdout);
  if (pathFromStdout && existsSync(pathFromStdout)) {
    const bytes = safeSize(pathFromStdout);
    if (bytes >= req.minBytes) {
      return { kind: 'ok', path: pathFromStdout, bytes };
    }
  }

  const sessionHit = newestSessionImage(req.workDir);
  if (sessionHit && sessionHit.bytes >= req.minBytes) {
    return { kind: 'ok', path: sessionHit.path, bytes: sessionHit.bytes };
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

function newestSessionImage(workCwd: string): Render | null {
  const sessionsRoot = join(homedir(), '.grok', 'sessions');
  if (!existsSync(sessionsRoot)) return null;

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
