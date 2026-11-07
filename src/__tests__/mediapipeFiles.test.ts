import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mediapipeHandler } from '../tracking/mediapipeServe';
import { MEDIAPIPE_MODELS, withMediapipe } from '../tracking/mediapipeFiles';

/**
 * MediaPipe's files from ADMI's own server (owner, 7 Nov 2026: the face reinforcing the hat
 * must work at a show): the engine from the installed package, the models kept on the laptop
 * once fetched, so no internet is needed.
 */

interface Answer { status: number; type: string | null; body: Buffer | null; next: boolean }
function ask(handler: ReturnType<typeof mediapipeHandler>, url: string): Promise<Answer> {
  return new Promise((resolve) => {
    const headers = new Map<string, string>();
    const res = {
      statusCode: 0,
      setHeader: (k: string, v: string) => { headers.set(k, v); },
      end: (body?: Buffer | string) => resolve({ status: res.statusCode, type: headers.get('Content-Type') ?? null, body: body === undefined ? null : Buffer.from(body), next: false }),
    };
    handler({ url, method: 'GET' }, res, () => resolve({ status: 0, type: null, body: null, next: true }));
  });
}

let wasmDir: string;
let modelDir: string;
let fetched: string[];
let online: boolean;
const fakeFetch = async (url: string) => {
  fetched.push(url);
  if (!online) throw new Error('offline');
  await new Promise((r) => setTimeout(r, 5));
  return { ok: true, arrayBuffer: async () => new TextEncoder().encode(`model from ${url}`).buffer as ArrayBuffer };
};
beforeEach(() => {
  wasmDir = mkdtempSync(join(tmpdir(), 'mp-wasm-'));
  modelDir = join(mkdtempSync(join(tmpdir(), 'mp-models-')), 'models');
  writeFileSync(join(wasmDir, 'vision_wasm_internal.wasm'), 'WASM');
  writeFileSync(join(wasmDir, 'vision_wasm_internal.js'), 'LOADER');
  fetched = [];
  online = true;
});
afterEach(() => { rmSync(wasmDir, { recursive: true, force: true }); rmSync(join(modelDir, '..'), { recursive: true, force: true }); });

describe('the engine, from the installed package', () => {
  it('its files, with the types the browser needs; nothing else', async () => {
    const h = mediapipeHandler(wasmDir, modelDir, fakeFetch);
    const wasm = await ask(h, '/wasm/vision_wasm_internal.wasm');
    expect(wasm).toMatchObject({ status: 200, type: 'application/wasm' });
    expect(wasm.body?.toString()).toBe('WASM');
    expect(await ask(h, '/wasm/vision_wasm_internal.js')).toMatchObject({ status: 200, type: 'text/javascript' });
    expect((await ask(h, '/wasm/secret.txt')).status).toBe(404);
    expect((await ask(h, '/wasm/..%2F..%2Fpackage.json')).status).toBe(404);
    expect((await ask(h, '/wasm/../../package.json')).next).toBe(true);
    expect((await ask(h, '/other/thing')).next).toBe(true);
    expect(fetched).toEqual([]);
  });
});

describe('the models, kept on the laptop', () => {
  it('fetched once the first time, kept, then served without the internet', async () => {
    const h = mediapipeHandler(wasmDir, modelDir, fakeFetch);
    const first = await ask(h, '/models/face_landmarker.task');
    expect(first.status).toBe(200);
    expect(first.body?.toString()).toBe(`model from ${MEDIAPIPE_MODELS['face_landmarker.task']}`);
    expect(existsSync(join(modelDir, 'face_landmarker.task'))).toBe(true);
    expect(existsSync(join(modelDir, 'face_landmarker.task.part'))).toBe(false);
    online = false;
    const again = await ask(h, '/models/face_landmarker.task?v=2');
    expect(again.status).toBe(200);
    expect(fetched).toHaveLength(1);
  });

  it('two detectors starting together share one download', async () => {
    const h = mediapipeHandler(wasmDir, modelDir, fakeFetch);
    const [a, b] = await Promise.all([ask(h, '/models/hand_landmarker.task'), ask(h, '/models/hand_landmarker.task')]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(fetched).toHaveLength(1);
  });

  it('offline and not kept yet: not found (the page then tries Google itself); only the known models', async () => {
    online = false;
    const h = mediapipeHandler(wasmDir, modelDir, fakeFetch);
    expect((await ask(h, '/models/face_landmarker.task')).status).toBe(404);
    expect(existsSync(join(modelDir, 'face_landmarker.task'))).toBe(false);
    expect((await ask(h, '/models/evil.task')).status).toBe(404);
    expect(fetched).toHaveLength(1);
  });

  it('a model already kept is served as it is', async () => {
    const h = mediapipeHandler(wasmDir, modelDir, fakeFetch);
    await ask(h, '/models/pose_landmarker_lite.task');
    writeFileSync(join(modelDir, 'pose_landmarker_lite.task'), 'KEPT');
    expect((await ask(h, '/models/pose_landmarker_lite.task')).body?.toString()).toBe('KEPT');
    expect(readFileSync(join(modelDir, 'pose_landmarker_lite.task'), 'utf-8')).toBe('KEPT');
  });
});

describe('a detector made from them', () => {
  it('the laptop’s copy of the model first; Google’s address when that fails; the engine always the installed one', async () => {
    const tried: string[][] = [];
    const made = await withMediapipe('face_landmarker.task', async (wasm, model) => {
      tried.push([wasm, model]);
      if (model.startsWith('/')) throw new Error('not kept');
      return 'detector';
    });
    expect(made).toBe('detector');
    expect(tried).toEqual([
      ['/mediapipe/wasm', '/mediapipe/models/face_landmarker.task'],
      ['/mediapipe/wasm', MEDIAPIPE_MODELS['face_landmarker.task']],
    ]);
  });
});
