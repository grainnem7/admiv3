import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, type Rendered } from './helpers/render';
import { NowNextStrip, type NowNextStripProps } from '../ui/screens/boardSequencer/play/NowNextStrip';
import type { ClockView } from '../songs/performance/clock';

/** B13 (audit 2026-10-30): End's own sign and quieter style, Next scene, its Undo, hidden until the clock runs. */
let view: Rendered | null = null;
afterEach(() => { view?.unmount(); view = null; });

const running: ClockView = { phase: 'running', remainingSec: 300, elapsedSec: 120, text: '5:00' };
function props(over: Partial<NowNextStripProps> = {}): NowNextStripProps {
  return {
    clock: running, nowName: 'Build', next: { name: 'Open', inSec: 30 }, loops: [], ending: false,
    onStartPiece: vi.fn(), onNext: vi.fn(), onEnd: vi.fn(), onCancelEnding: vi.fn(), ...over,
  };
}
const buttons = (): HTMLButtonElement[] => [...(view?.container.querySelectorAll('button') ?? [])];
const named = (t: string | RegExp): HTMLButtonElement | undefined =>
  buttons().find((b) => (typeof t === 'string' ? b.textContent === t : t.test(b.textContent ?? '')));

describe('Now / Next: the piece\'s buttons (B13)', () => {
  it('before the clock runs: only ▶ Start the piece, no Next scene and no End', () => {
    view = render(<NowNextStrip {...props({ clock: { ...running, phase: 'idle' } })} />);
    expect(named('▶ Start the piece')).toBeDefined();
    expect(named(/Next/)).toBeUndefined();
    expect(named(/End/)).toBeUndefined();
  });

  it('while the clock runs: "Next scene ▶", and End piece with its own sign in a quieter style', () => {
    view = render(<NowNextStrip {...props()} />);
    expect(named('Next scene ▶')).toBeDefined();
    const end = named(/End piece/);
    expect(end?.textContent).toBe('↘ End piece');
    expect(end?.textContent).not.toMatch(/[■⏹]/);
    expect(end?.style.background).not.toBe('var(--bs-accent)');
  });

  it('after Next scene: "Back to Arrival" goes back', () => {
    const onUndoNext = vi.fn();
    view = render(<NowNextStrip {...props({ undoNext: { name: 'Arrival' }, onUndoNext })} />);
    const back = named('↶ Back to Arrival');
    expect(back).toBeDefined();
    back?.click();
    expect(onUndoNext).toHaveBeenCalled();
  });
});
