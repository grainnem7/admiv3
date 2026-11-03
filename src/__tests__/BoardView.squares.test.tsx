/**
 * A4 (audit 2026-10-30): the empty squares were 1.11:1 (dark) and 1.14:1 (light) against the
 * page, with an edge of 1.4:1 (WCAG 1.4.11). Each empty square is now a dot of at least 3:1
 * (the board's borderControl) against the page and against the column's tint (L3).
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

describe('every empty square is marked by a dot you can see (A4, L3)', () => {
  for (const mode of ['dark', 'light'] as BoardMode[]) {
    it(`${mode}: each of the 32 squares has a dot at least 3:1 against the page and the column's tint`, () => {
      draw(mode);
      const palette = BOARD_TOKENS.calm[mode];
      const dots = ops.filter((o) => o.op === 'fill' && o.fillStyle === palette.borderControl);
      expect(dots.length).toBe(32);
      for (const d of dots) {
        expect(contrastRatio(d.fillStyle, palette.bg)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(d.fillStyle, palette.raised)).toBeGreaterThanOrEqual(3);
        expect(d.alpha).toBe(1);
      }
      // No square is drawn as a box: nothing is stroked in the faint edge colour, and nothing
      // is filled in the raised shade while the board is stopped.
      expect(ops.some((o) => o.op === 'stroke' && o.strokeStyle === palette.border)).toBe(false);
      expect(ops.some((o) => o.op === 'fill' && o.fillStyle === palette.raised)).toBe(false);
    });
  }
});

describe('L3: the board sits on the page', () => {
  it('its stage has no fill and no well, and the step numbers run above it', () => {
    draw('dark');
    const stage = view!.container.querySelector('[data-board-stage]') as HTMLElement;
    expect(stage).not.toBeNull();
    expect(stage.style.background).toBe('transparent');
    expect(view!.container.querySelector('[data-board-well]')).toBeNull();
    const steps = view!.container.querySelector('[data-board-steps]') as HTMLElement;
    expect(steps.textContent).toBe('12345678');
    expect(steps.getAttribute('aria-hidden')).toBe('true');
  });
});
