import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateImage, type ImageGenRequest } from './generateImage.ts';
import * as grokModule from './grok.ts';

interface ImagineRequestBody {
  model?: string;
  prompt?: string;
  n?: number;
  aspect_ratio?: string;
  resolution?: string;
  response_format?: string;
  image?: { url?: string };
  images?: Array<{ url?: string }>;
}

describe('generateImage direct API', () => {
  let tmpDir: string;
  let authFile: string;
  let savedAuthPath: string | undefined;

  const validPngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  const sampleRenderBytes = Buffer.alloc(300, 0xaa);
  const sampleB64 = sampleRenderBytes.toString('base64');

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'grok-img-test-'));
    authFile = join(tmpDir, 'auth.json');
    writeFileSync(
      authFile,
      JSON.stringify({
        'https://auth.x.ai::default': { key: 'test-key-123', user_id: 'user-456' },
      }),
    );
    savedAuthPath = process.env.GROK_AUTH_PATH;
    process.env.GROK_AUTH_PATH = authFile;
  });

  afterEach(() => {
    if (savedAuthPath !== undefined) {
      process.env.GROK_AUTH_PATH = savedAuthPath;
    } else {
      delete process.env.GROK_AUTH_PATH;
    }
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const baseReq: ImageGenRequest = {
    prompt: 'a majestic pine tree',
    workDir: '',
    backendModel: 'grok-4.6',
    aspectRatio: '1:1',
    imagePaths: [],
    timeoutSec: 30,
    forceful: false,
    minBytes: 100,
  };

  it('no refs -> POSTs to /images/generations, body has aspect_ratio, no image/images', async () => {
    let capturedUrl = '';
    let capturedBody: ImagineRequestBody = {};

    const fakeFetch: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedBody = JSON.parse(String(init?.body)) as ImagineRequestBody;
      return new Response(JSON.stringify({ data: [{ b64_json: sampleB64 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const res = await generateImage({ ...baseReq, workDir: tmpDir }, fakeFetch);
    expect(capturedUrl).toBe('https://api.x.ai/v1/images/generations');
    expect(capturedBody.aspect_ratio).toBe('1:1');
    expect('image' in capturedBody).toBe(false);
    expect('images' in capturedBody).toBe(false);
    expect(res).toEqual({
      kind: 'ok',
      path: join(tmpDir, 'render.jpg'),
      bytes: sampleRenderBytes.length,
    });
  });

  it('one ref -> POSTs to /images/edits, body has image.url as a data: URL and no aspect_ratio key', async () => {
    const refPath = join(tmpDir, 'input.png');
    writeFileSync(refPath, validPngBytes);

    let capturedUrl = '';
    let capturedBody: ImagineRequestBody = {};

    const fakeFetch: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedBody = JSON.parse(String(init?.body)) as ImagineRequestBody;
      return new Response(JSON.stringify({ data: [{ b64_json: sampleB64 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const res = await generateImage(
      { ...baseReq, workDir: tmpDir, imagePaths: [refPath] },
      fakeFetch,
    );
    expect(capturedUrl).toBe('https://api.x.ai/v1/images/edits');
    expect(capturedBody.image?.url).toBe(
      `data:image/png;base64,${validPngBytes.toString('base64')}`,
    );
    expect('aspect_ratio' in capturedBody).toBe(false);
    expect('images' in capturedBody).toBe(false);
    expect(res.kind).toBe('ok');
  });

  it('two refs -> images array of length 2 and aspect_ratio present', async () => {
    const ref1 = join(tmpDir, 'ref1.png');
    const ref2 = join(tmpDir, 'ref2.png');
    writeFileSync(ref1, validPngBytes);
    writeFileSync(ref2, validPngBytes);

    let capturedUrl = '';
    let capturedBody: ImagineRequestBody = {};

    const fakeFetch: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedBody = JSON.parse(String(init?.body)) as ImagineRequestBody;
      return new Response(JSON.stringify({ data: [{ b64_json: sampleB64 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const res = await generateImage(
      { ...baseReq, workDir: tmpDir, imagePaths: [ref1, ref2], aspectRatio: '16:9' },
      fakeFetch,
    );
    expect(capturedUrl).toBe('https://api.x.ai/v1/images/edits');
    expect(capturedBody.images).toHaveLength(2);
    expect(capturedBody.images?.[0]?.url).toBe(
      `data:image/png;base64,${validPngBytes.toString('base64')}`,
    );
    expect(capturedBody.images?.[1]?.url).toBe(
      `data:image/png;base64,${validPngBytes.toString('base64')}`,
    );
    expect(capturedBody.aspect_ratio).toBe('16:9');
    expect('image' in capturedBody).toBe(false);
    expect(res.kind).toBe('ok');
  });

  it('model is grok-imagine-image-2.0, not req.backendModel', async () => {
    let capturedBody: ImagineRequestBody = {};

    const fakeFetch: typeof fetch = async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body)) as ImagineRequestBody;
      return new Response(JSON.stringify({ data: [{ b64_json: sampleB64 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    await generateImage({ ...baseReq, workDir: tmpDir, backendModel: 'grok-4.6' }, fakeFetch);
    expect(capturedBody.model).toBe('grok-imagine-image-2.0');
    expect(capturedBody.model).not.toBe('grok-4.6');
  });

  it('401 then 200 -> refresh is called once and the result is ok', async () => {
    let calls = 0;
    const refreshSpy = vi.spyOn(grokModule, 'refreshGrokAuth').mockImplementation(async () => {});

    const fakeFetch: typeof fetch = async () => {
      calls++;
      if (calls === 1) {
        return new Response('Unauthorized', { status: 401 });
      }
      return new Response(JSON.stringify({ data: [{ b64_json: sampleB64 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const res = await generateImage({ ...baseReq, workDir: tmpDir }, fakeFetch);
    expect(calls).toBe(2);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(res.kind).toBe('ok');
  });

  it('HTTP 500 -> {kind: "error"} carrying the status', async () => {
    const fakeFetch: typeof fetch = async () => {
      return new Response('internal error breakdown', { status: 500 });
    };

    const res = await generateImage({ ...baseReq, workDir: tmpDir }, fakeFetch);
    expect(res.kind).toBe('error');
    if (res.kind === 'error') {
      expect(res.reason).toContain('500');
    }
  });

  it('decoded bytes under minBytes -> {kind: "suspect"}', async () => {
    const tinyBuffer = Buffer.alloc(50, 0x11);
    const tinyB64 = tinyBuffer.toString('base64');

    const fakeFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ data: [{ b64_json: tinyB64 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const res = await generateImage({ ...baseReq, workDir: tmpDir, minBytes: 200 }, fakeFetch);
    expect(res.kind).toBe('suspect');
  });
});
