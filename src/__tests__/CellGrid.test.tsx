// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { CellGrid } from '../ui/screens/boardSequencer/components/CellGrid';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The laptop board and Draw a loop: one tab stop, arrows to move, Enter to place. */
let root: Root;
let el: HTMLDivElement;
const onActivate = vi.fn();
beforeEach(async () => {
  onActivate.mockClear();
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root.render(<CellGrid rows={3} cols={4} label="Board" cellLabel={(r, c) => `r${r}c${c}`} pressed={(r, c) => r === 0 && c === 0} onActivate={onActivate} />);
  });
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  el.remove();
});

const buttons = () => [...el.querySelectorAll('button')];
const focused = () => document.activeElement?.getAttribute('aria-label');
const key = async (k: string) => {
  await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });
};

describe('a grid of squares', () => {
  it('is rows of cells holding buttons, with one tab stop (bottom left)', () => {
    expect(el.querySelectorAll('[role="row"]')).toHaveLength(3);
    expect(el.querySelectorAll('[role="gridcell"] > button')).toHaveLength(12);
    const tabbable = buttons().filter((b) => b.tabIndex === 0);
    expect(tabbable.map((b) => b.getAttribute('aria-label'))).toEqual(['r2c0']);
    expect(buttons()[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('arrow keys move, Home and End go to the ends of the row, and the edges stop', async () => {
    await act(async () => { buttons().find((b) => b.tabIndex === 0)!.focus(); });
    await key('ArrowUp');
    expect(focused()).toBe('r1c0');
    await key('ArrowRight');
    expect(focused()).toBe('r1c1');
    await key('End');
    expect(focused()).toBe('r1c3');
    await key('ArrowRight');
    expect(focused()).toBe('r1c3');
    expect(buttons().filter((b) => b.tabIndex === 0).map((b) => b.getAttribute('aria-label'))).toEqual(['r1c3']);
  });

  it('a click places or lifts at that square', async () => {
    await act(async () => { buttons()[5].click(); });
    expect(onActivate).toHaveBeenCalledWith(1, 1);
  });
});
