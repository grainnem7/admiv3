/**
 * Stockfish in a worker, asked for a shallow evaluation of each position. The lite,
 * single threaded build: about 1.8 MB, no special page headers needed. Answers are in
 * centipawns from White's view; null when the engine is not there or too slow, so the
 * caller can fall back to counting material.
 */
import sfJsUrl from 'stockfish/bin/stockfish-19-lite-single.js?url';
import sfWasmUrl from 'stockfish/bin/stockfish-19-lite-single.wasm?url';
import { MATE_CP } from './chessMusic';

/** Shallow on purpose: quick, and tension does not need a deep search. */
export const EVAL_DEPTH = 10;
const START_TIMEOUT_MS = 8000;
const EVAL_TIMEOUT_MS = 3000;

/** Read a UCI "info ... score" line: centipawns for the side to move, or null. */
export function parseScore(line: string): number | null {
  const m = /\bscore (cp|mate) (-?\d+)/.exec(line);
  if (!m) return null;
  const v = Number(m[2]);
  if (m[1] === 'cp') return v;
  return v > 0 ? MATE_CP : -MATE_CP;
}

export class StockfishEvaluator {
  private worker: Worker | null = null;
  private ready: Promise<boolean> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private listener: ((line: string) => void) | null = null;
  private failed = false;

  /** Start the engine once; false if it could not start. */
  start(): Promise<boolean> {
    if (this.ready) return this.ready;
    this.ready = new Promise<boolean>((resolve) => {
      try {
        const w = new Worker(`${sfJsUrl}#${encodeURIComponent(new URL(sfWasmUrl, location.href).href)}`);
        this.worker = w;
        w.onmessage = (e: MessageEvent<unknown>) => { if (typeof e.data === 'string') this.listener?.(e.data); };
        w.onerror = () => { this.failed = true; resolve(false); };
        const timer = setTimeout(() => { this.failed = true; resolve(false); }, START_TIMEOUT_MS);
        this.listener = (line) => { if (line === 'readyok') { clearTimeout(timer); this.listener = null; resolve(true); } };
        w.postMessage('uci');
        w.postMessage('isready');
      } catch {
        this.failed = true;
        resolve(false);
      }
    });
    return this.ready;
  }

  /** The evaluation of a position, White's view, or null. One at a time, in order. */
  evaluate(fen: string, depth = EVAL_DEPTH): Promise<number | null> {
    const run = async (): Promise<number | null> => {
      if (this.failed || !(await this.start()) || !this.worker) return null;
      const w = this.worker;
      const whiteToMove = fen.split(' ')[1] !== 'b';
      return new Promise<number | null>((resolve) => {
        let score: number | null = null;
        const done = (v: number | null): void => { clearTimeout(timer); this.listener = null; resolve(v); };
        const timer = setTimeout(() => { w.postMessage('stop'); done(null); }, EVAL_TIMEOUT_MS);
        this.listener = (line) => {
          const s = parseScore(line);
          if (s !== null) score = s;
          if (line.startsWith('bestmove')) done(score === null ? null : whiteToMove ? score : -score);
        };
        w.postMessage(`position fen ${fen}`);
        w.postMessage(`go depth ${depth}`);
      });
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => null);
    return next;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    this.listener = null;
  }
}
