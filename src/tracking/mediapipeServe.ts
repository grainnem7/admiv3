/**
 * ADMI's server hands out MediaPipe's files (see mediapipeFiles.ts): the engine from the
 * installed package, and each model from a folder on the laptop, downloading it there the
 * first time it is asked for. Only the known files are served; anything else is not found.
 * Runs in the server (vite.config.ts), never in the page.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MEDIAPIPE_MODELS, MEDIAPIPE_WASM_FILES, type MediapipeModel } from './mediapipeFiles';

interface Req { url?: string; method?: string }
interface Res {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: Buffer | string): void;
}
type Fetcher = (url: string) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>;

const typeOf = (name: string): string => (name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
const isModel = (name: string): name is MediapipeModel => Object.prototype.hasOwnProperty.call(MEDIAPIPE_MODELS, name);

/**
 * The handler for `/mediapipe/...`: `wasm/<file>` from `wasmDir`, `models/<file>` from
 * `modelDir` (fetched with `fetcher` and kept there when missing). Calls `next` for anything
 * else under the path.
 */
export function mediapipeHandler(wasmDir: string, modelDir: string, fetcher: Fetcher = fetch) {
  // One download per model at a time: two detectors starting together share it.
  const downloading = new Map<MediapipeModel, Promise<boolean>>();
  const download = (name: MediapipeModel): Promise<boolean> => {
    const was = downloading.get(name);
    if (was) return was;
    const p = (async () => {
      try {
        const r = await fetcher(MEDIAPIPE_MODELS[name]);
        if (!r.ok) return false;
        const data = Buffer.from(await r.arrayBuffer());
        if (data.length === 0) return false;
        mkdirSync(modelDir, { recursive: true });
        // Written whole, then put in place: a half-written model is never served.
        const part = join(modelDir, `${name}.part`);
        writeFileSync(part, data);
        renameSync(part, join(modelDir, name));
        return true;
      } catch {
        return false;
      } finally {
        downloading.delete(name);
      }
    })();
    downloading.set(name, p);
    return p;
  };
  const send = (res: Res, name: string, file: string): void => {
    res.statusCode = 200;
    res.setHeader('Content-Type', typeOf(name));
    res.setHeader('Cache-Control', 'no-cache');
    res.end(readFileSync(file));
  };
  const notFound = (res: Res): void => { res.statusCode = 404; res.end('Not found'); };
  return (req: Req, res: Res, next: () => void): void => {
    const path = (req.url ?? '').split('?')[0].replace(/^\/+/, '');
    const [kind, name, ...rest] = path.split('/');
    if (rest.length > 0 || !name) { next(); return; }
    if (kind === 'wasm') {
      if (!(MEDIAPIPE_WASM_FILES as readonly string[]).includes(name)) { notFound(res); return; }
      const file = join(wasmDir, name);
      if (existsSync(file)) send(res, name, file); else notFound(res);
      return;
    }
    if (kind === 'models') {
      if (!isModel(name)) { notFound(res); return; }
      const file = join(modelDir, name);
      if (existsSync(file)) { send(res, name, file); return; }
      void download(name).then((ok) => { if (ok) send(res, name, file); else notFound(res); });
      return;
    }
    next();
  };
}
