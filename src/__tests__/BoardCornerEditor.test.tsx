import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, click, pressKey, fire } from './helpers/render';
import { BoardCornerEditor } from '../ui/screens/boardSequencer/components/BoardCornerEditor';
import { NUDGE_COARSE, NUDGE_FINE } from '../ui/screens/boardSequencer/cornerEditor';
import type { Corners } from '../tracking/boardDetect/orientation';

afterEach(() => { document.body.innerHTML = ''; });

const SAVED: Corners = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];

/** jsdom gives every element a zero-sized box, so taps need a real one to map into. */
function stubSurface(container: HTMLElement): void {
  for (const el of Array.from(container.querySelectorAll('div'))) {
    el.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, toJSON: () => ({}),
    });
  }
}

function tapAt(container: HTMLElement, surface: HTMLElement, x: number, y: number): void {
  stubSurface(container);
  fire(() => {
    surface.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, clientX: x * 200, clientY: y * 200,
    }));
  });
}

describe('BoardCornerEditor — tap mode', () => {
  it('walks the four prompts and reaches review with corners in saved order', () => {
    const onConfirm = vi.fn();
    const r = render(
      <BoardCornerEditor mode="tap" rows={4} cols={4} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    expect(r.container.textContent).toContain('where the loop starts, on the high-notes side');
    const surface = r.all('div')[2];

    // Prompts are asked in SAVED order, so corner 1 is corner 1 everywhere: the corner
    // tapped first stays number 1 while adjusting and in the announcement.
    tapAt(r.container, surface, 0.1, 0.1);
    expect(r.container.textContent).toContain('ends, on the high-notes side');
    tapAt(r.container, surface, 0.9, 0.1);
    tapAt(r.container, surface, 0.9, 0.9);
    tapAt(r.container, surface, 0.1, 0.9);

    // Four valid taps land in review, where Looks right saves.
    const looksRight = r.byText('Looks right', 'button');
    click(looksRight);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const saved = onConfirm.mock.calls[0][0] as Corners;
    expect(saved[0].y).toBeCloseTo(0.1, 6);   // start + high
    expect(saved[3].y).toBeCloseTo(0.9, 6);   // start + low
  });

  it('rejects a crossed quad, keeps the taps for Undo, and says so', () => {
    const r = render(<BoardCornerEditor mode="tap" rows={4} cols={4} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const surface = r.all('div')[2];
    tapAt(r.container, surface, 0.1, 0.9);
    tapAt(r.container, surface, 0.9, 0.1);
    tapAt(r.container, surface, 0.1, 0.1);
    tapAt(r.container, surface, 0.9, 0.9);
    expect(r.container.textContent).toContain('Those corners cross over');
    expect(r.all('button').some((b) => b.textContent === 'Looks right')).toBe(false);
    const undo = r.byText('Undo last', 'button');
    expect(undo.hasAttribute('disabled')).toBe(false);
  });

  it('Place corners for me is the no-pointer path into adjust', () => {
    const r = render(<BoardCornerEditor mode="tap" rows={4} cols={4} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    click(r.byText('Place corners for me', 'button'));
    expect(r.byText('Done', 'button')).toBeTruthy();
    expect(r.all('[aria-label^="Corner 1"]')).toHaveLength(1);
  });
});

describe('BoardCornerEditor — review and orientation', () => {
  it('Turn moves the start to the next edge and Flip swaps start and end', () => {
    const onConfirm = vi.fn();
    const r = render(
      <BoardCornerEditor mode="review" corners={SAVED} rows={4} cols={4} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    click(r.byText('⟲ Turn', 'button'));
    click(r.byText('Looks right', 'button'));
    expect(onConfirm.mock.calls[0][0]).toEqual([SAVED[3], SAVED[0], SAVED[1], SAVED[2]]);

    const r2 = render(
      <BoardCornerEditor mode="review" corners={SAVED} rows={4} cols={4} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    click(r2.byText('⇋ Flip', 'button'));
    click(r2.byText('Looks right', 'button'));
    expect(onConfirm.mock.calls[1][0]).toEqual([SAVED[1], SAVED[0], SAVED[3], SAVED[2]]);
  });

  it('handles are not draggable in review, and Looks right is only offered there', () => {
    const r = render(
      <BoardCornerEditor mode="review" corners={SAVED} rows={4} cols={4} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(r.get('[aria-label^="Corner 1"]').hasAttribute('disabled')).toBe(true);
    click(r.byText('Adjust', 'button'));
    expect(r.all('button').some((b) => b.textContent === 'Looks right')).toBe(false);
    expect(r.get('[aria-label^="Corner 1"]').hasAttribute('disabled')).toBe(false);
  });
});

describe('BoardCornerEditor — adjust', () => {
  it('arrow keys nudge the selected corner, Shift uses the coarse step', () => {
    const onConfirm = vi.fn();
    const r = render(
      <BoardCornerEditor mode="adjust" corners={SAVED} rows={4} cols={4} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    const handle1 = r.get('[aria-label^="Corner 1"]');
    pressKey(handle1, 'ArrowRight');           // coarse is the default
    pressKey(handle1, 'ArrowDown', { shiftKey: true });
    click(r.byText('Done', 'button'));
    click(r.byText('Looks right', 'button'));
    const saved = onConfirm.mock.calls[0][0] as Corners;
    expect(saved[0].x).toBeCloseTo(0.1 + NUDGE_COARSE, 6);
    expect(saved[0].y).toBeCloseTo(0.1 + NUDGE_COARSE, 6);
  });

  it('the on-screen pad nudges the corner the Next corner button selects, at the chosen size', () => {
    const onConfirm = vi.fn();
    const r = render(
      <BoardCornerEditor mode="adjust" corners={SAVED} rows={4} cols={4} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    click(r.byText('Fine', 'button'));
    click(r.get('[aria-label^="Next corner"]'));   // corner 1 → 2
    click(r.get('[aria-label="Nudge corner left"]'));
    click(r.byText('Done', 'button'));
    click(r.byText('Looks right', 'button'));
    const saved = onConfirm.mock.calls[0][0] as Corners;
    expect(saved[1].x).toBeCloseTo(0.9 - NUDGE_FINE, 6);
    expect(saved[0]).toEqual(SAVED[0]);
  });

  it('Cancel restores the corners as they were before Adjust', () => {
    const onConfirm = vi.fn();
    const r = render(
      <BoardCornerEditor mode="review" corners={SAVED} rows={4} cols={4} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    click(r.byText('Adjust', 'button'));
    click(r.get('[aria-label="Nudge corner right"]'));
    click(r.byText('Cancel', 'button'));
    click(r.byText('Looks right', 'button'));
    expect(onConfirm.mock.calls[0][0]).toEqual(SAVED);
  });
});
