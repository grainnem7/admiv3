/**
 * A4 (audit 2026-10-30): the empty squares were 1.11:1 (dark) and 1.14:1 (light) against the
 * page, with an edge of 1.4:1 (WCAG 1.4.11). Each square now has an edge of at least 3:1
 * (the board's borderControl) against the page and against the square.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, type Rendered } from './helpers/render';
import { BoardView, type BoardViewFrame } from '../ui/screens/boardSequencer/components/BoardView';
import { BOARD_TOKENS, contrastRatio, type BoardMode } from '../ui/screens/boardSequencer/theme/boardTokens';

interface Op { op: string; fillStyle: string; strokeStyle: string; lineWidth: number; alpha: number; args: number[] }

/** A 2D context that records every drawing call with the style in force when it was made. */
function recordingContext(ops: Op[]): CanvasRenderingContext2D {
  const state = { fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1 };
  const rec = (op: string) => (...args: unknown[]): void => {
    ops.push({ op, fillStyle: String(state.fillStyle), strokeStyle: String(state.strokeStyle), lineWidth: state.lineWidth, alpha: state.globalAlpha, args: args.filter((a): a is number => typeof a === 'number') });
  };
  const noop = (): void => undefined;
  const ctx = {
    get fillStyle() { return state.fillStyle; }, set fillStyle(v: string) { state.fillStyle = v; },
    get strokeStyle() { return state.strokeStyle; }, set strokeStyle(v: string) { state.strokeStyle = v; },
    get lineWidth() { return state.lineWidth; }, set lineWidth(v: number) { state.lineWidth = v; },
    get globalAlpha() { return state.globalAlpha; }, set globalAlpha(v: number) { state.globalAlpha = v; },
    font: '', textAlign: 'center', textBaseline: 'middle',
    setTransform: noop, clearRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, arcTo: noop, closePath: noop,
    arc: noop, save: noop, restore: noop, clip: noop, setLineDash: noop,
    fill: rec('fill'), stroke: rec('stroke'), fillRect: rec('fillRect'), strokeRect: rec('strokeRect'), fillText: rec('fillText'),
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

const emptyFrame = (): BoardViewFrame => ({ detected: new Map(), settled: new Map(), conditional: new Set() });

let ops: Op[];
let view: Rendered | null = null;
beforeEach(() => {
  ops = [];
  vi.stubGlobal('ResizeObserver', class { observe(): void { /* sized once below */ } disconnect(): void { /* nothing */ } });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => recordingContext(ops) as unknown as ReturnType<HTMLCanvasElement['getContext']>);
});
afterEach(() => { view?.unmount(); view = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function draw(mode: BoardMode): void {
  const palette = BOARD_TOKENS.calm[mode];
  view = render(
    <BoardView
      rows={4} cols={8} frame={emptyFrame()} pops={[]} playheadCol={0} playing={false} pingPongDirection={0}
      swatchFor={() => '#d03a2c'} palette={palette}
    />,
  );
}

describe('every empty square has an edge you can see (A4)', () => {
  for (const mode of ['dark', 'light'] as BoardMode[]) {
    it(`${mode}: each of the 32 squares is outlined at least 3:1 against the page and the square`, () => {
      draw(mode);
      const palette = BOARD_TOKENS.calm[mode];
      const edges = ops.filter((o) => o.op === 'stroke' && o.strokeStyle === palette.borderControl);
      expect(edges.length).toBe(32);
      for (const e of edges) {
        expect(contrastRatio(e.strokeStyle, palette.bg)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(e.strokeStyle, palette.raised)).toBeGreaterThanOrEqual(3);
        expect(e.lineWidth).toBeGreaterThanOrEqual(1);
      }
      // And no square is still drawn with the old faint edge.
      expect(ops.some((o) => o.op === 'stroke' && o.strokeStyle === palette.border)).toBe(false);
    });
  }
});
