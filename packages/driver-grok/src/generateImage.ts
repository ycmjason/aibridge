import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type GrokAuthRecord, readGrokAuth } from './auth.ts';
import { refreshGrokAuth } from './grok.ts';

/**
 * Pinned Imagine model for xAI image generation and editing.
 * Note: req.backendModel is the seat model (e.g. grok-4.6) and is deliberately
 * NOT the render model. req.effort and req.forceful are unused by this backend.
 */
const IMAGINE_MODEL = 'grok-imagine-image-2.0';

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

function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === 'GIF8') {
    return 'image/gif';
  }
  return null;
}

async function postImagine(
  url: string,
  body: unknown,
  authKey: string,
  timeoutSec: number,
  fetchImpl: typeof fetch,
): Promise<Response> {
  return fetchImpl(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${authKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutSec * 1000),
  });
}

export async function generateImage(
  req: ImageGenRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<ImageResult> {
  let auth: GrokAuthRecord;
  try {
    auth = readGrokAuth();
  } catch (err) {
    return { kind: 'error', reason: (err as Error).message };
  }

  let url: string;
  let body: Record<string, unknown>;

  if (req.imagePaths.length === 0) {
    url = 'https://api.x.ai/v1/images/generations';
    body = {
      model: IMAGINE_MODEL,
      prompt: req.prompt,
      n: 1,
      aspect_ratio: req.aspectRatio ?? 'auto',
      resolution: '1k',
      response_format: 'b64_json',
    };
  } else {
    url = 'https://api.x.ai/v1/images/edits';
    const dataUrls: string[] = [];
    for (const p of req.imagePaths) {
      try {
        const fileBuf = readFileSync(p);
        const mime = sniffImageMime(fileBuf);
        if (!mime) {
          return { kind: 'error', reason: `reference image not readable/unsupported: ${p}` };
        }
        dataUrls.push(`data:${mime};base64,${fileBuf.toString('base64')}`);
      } catch {
        return { kind: 'error', reason: `reference image not readable/unsupported: ${p}` };
      }
    }

    if (dataUrls.length === 1) {
      body = {
        model: IMAGINE_MODEL,
        prompt: req.prompt,
        n: 1,
        resolution: '1k',
        response_format: 'b64_json',
        image: { url: dataUrls[0] },
      };
    } else {
      body = {
        model: IMAGINE_MODEL,
        prompt: req.prompt,
        n: 1,
        aspect_ratio: req.aspectRatio ?? 'auto',
        resolution: '1k',
        response_format: 'b64_json',
        images: dataUrls.map(u => ({ url: u })),
      };
    }
  }

  let res: Response;
  try {
    res = await postImagine(url, body, auth.key, req.timeoutSec, fetchImpl);
    if (res.status === 401) {
      await refreshGrokAuth();
      try {
        auth = readGrokAuth();
      } catch (err) {
        return { kind: 'error', reason: (err as Error).message };
      }
      res = await postImagine(url, body, auth.key, req.timeoutSec, fetchImpl);
    }
  } catch (err: unknown) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      return {
        kind: 'error',
        reason: `grok render timed out after ~${req.timeoutSec}s; raise --timeout.`,
      };
    }
    return {
      kind: 'error',
      reason: `grok Imagine API failed: ${(err as Error).message}`,
    };
  }

  if (res.status === 401) {
    return {
      kind: 'error',
      reason: 'grok session expired (401) — run `grok login`, then retry',
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const first200 = text.trim().slice(0, 200);
    return {
      kind: 'error',
      reason: `grok Imagine API failed: HTTP ${res.status}${first200 ? `: ${first200}` : ''}`,
    };
  }

  let resJson: { data?: Array<{ b64_json?: string }> };
  try {
    resJson = (await res.json()) as { data?: Array<{ b64_json?: string }> };
  } catch {
    return { kind: 'error', reason: 'grok Imagine API returned no image data.' };
  }

  const b64 = resJson.data?.[0]?.b64_json;
  if (!b64 || typeof b64 !== 'string') {
    return { kind: 'error', reason: 'grok Imagine API returned no image data.' };
  }

  const imageBuf = Buffer.from(b64, 'base64');
  const bytes = imageBuf.length;
  const outPath = join(req.workDir, 'render.jpg');
  try {
    writeFileSync(outPath, imageBuf);
  } catch (err) {
    return { kind: 'error', reason: `failed to write image file: ${(err as Error).message}` };
  }

  if (bytes < req.minBytes) {
    return { kind: 'suspect' };
  }

  return { kind: 'ok', path: outPath, bytes };
}
