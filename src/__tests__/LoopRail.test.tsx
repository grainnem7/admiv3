/** G1 (grid investigation, 4 Nov 2026): the loop rail beside the board. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { render, type Rendered } from './helpers/render';
import { LoopRail, placeLabel, type LoopRailProps } from '../ui/screens/boardSequencer/play/LoopRail';
import type { PieceLoop } from '../ui/screens/boardSequencer/play/PieceSteps';

let view: Rendered | null = null;
afterEach(() => { view?.unmount(); view = null; });

const loop = (slot: number, over: Partial<PieceLoop> = {}): PieceLoop => ({ slot, name: '', notes: 0, state: 'empty', cells: [], ...over });
const loops = (): PieceLoop[] => [
  loop(0, { name: 'Bed', notes: 5, state: 'playing', cells: [{ row: 1, col: 1, colour: 'c1' }] }),
  loop(1, { notes: 3, state: 'stopped', cells: [{ row: 2, col: 2, colour: 'c1' }] }),
  ...Array.from({ length: 6 }, (_, i) => loop(i + 2)),
];
const props = (over: Partial<LoopRailProps> = {}): LoopRailProps => ({
  loops: loops(), rows: 8, cols: 8, swatchFor: () => '#d03a2c', running: true, keepReason: null, locked: null, newLoopReason: null,
  onKeep: vi.fn(), onToggle: vi.fn(), onRename: vi.fn(), onReplace: vi.fn(), onEditNotes: vi.fn(), onClear: vi.fn(), onNewLoop: vi.fn(), ...over,
});
const places = (): HTMLButtonElement[] => view!.all('[data-loop-place]') as HTMLButtonElement[];

describe('the loop rail', () => {
  it('shows eight places, each named by the words on it (A9), with its state', () => {
    view = render(<LoopRail {...props()} />);
    const ps = places();
    expect(ps.length).toBe(8);
    expect(ps[0].textContent).toBe('Bed');
    expect(ps[0].getAttribute('aria-label')).toBe('Bed: loop 1, 5 notes, playing');
    expect(ps[0].getAttribute('aria-pressed')).toBe('true');
    expect(ps[1].textContent).toBe('Loop 2');
    expect(ps[1].getAttribute('aria-label')).toBe('Loop 2: 3 notes, stopped');
    expect(ps[2].getAttribute('aria-label')).toBe('Loop 3: empty. Keep the board here');
    expect(ps[2].hasAttribute('aria-pressed')).toBe(false);
    // Stopped, a loop never says it plays.
    expect(placeLabel(loop(0, { name: 'Bed', notes: 5, state: 'playing' }), false)).toBe('Bed: loop 1, 5 notes, stopped');
  });

  it('an empty place keeps the board there; a kept place plays or stops it', () => {
    const p = props();
    view = render(<LoopRail {...p} />);
    act(() => places()[2].click());
    expect(p.onKeep).toHaveBeenCalledWith(2);
    act(() => places()[0].click());
    expect(p.onToggle).toHaveBeenCalledWith(0);
    expect(p.onKeep).toHaveBeenCalledTimes(1);
  });

  it('is one tab stop: arrows move between places, Enter presses, Shift+Enter opens the menu', () => {
    const p = props();
    view = render(<LoopRail {...p} />);
    const ps = places();
    expect(ps.map((b) => b.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1', '-1', '-1', '-1']);
    act(() => { ps[0].focus(); ps[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    expect(document.activeElement).toBe(places()[1]);
    expect(places()[1].getAttribute('tabindex')).toBe('0');
    act(() => { places()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })); });
    const menu = view.get('[role="group"][aria-label="Loop 2: more"]');
    expect(menu).not.toBeNull();
    const named = (t: string): HTMLButtonElement => [...menu.querySelectorAll('button')].find((b) => b.textContent === t || b.getAttribute('aria-label') === t) as HTMLButtonElement;
    act(() => named('Rename').click());
    const input = menu.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('aria-label')).toBe('Name of loop 2');
    act(() => named('Clear loop 2').click());
    expect(p.onClear).toHaveBeenCalledWith(1);
  });

  it('Replace with the board asks for a second press', () => {
    const p = props();
    view = render(<LoopRail {...p} />);
    act(() => places()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })));
    const menu = view.get('[role="group"][aria-label="Bed: more"]');
    const replace = [...menu.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Replace')) as HTMLButtonElement;
    act(() => replace.click());
    expect(p.onReplace).not.toHaveBeenCalled();
    expect(replace.textContent).toBe('Press again to replace it');
    act(() => replace.click());
    expect(p.onReplace).toHaveBeenCalledWith(0);
  });

  it('while the piece plays the loops are locked: no keeping, no menu, but play and stop stay', () => {
    const p = props({ locked: 'Stop the piece to change the loops.' });
    view = render(<LoopRail {...p} />);
    expect(places()[2].getAttribute('aria-disabled')).toBe('true');
    expect(places()[2].title).toBe('Stop the piece to change the loops.');
    const more = view.container.querySelector('button[aria-label^="More for"]') as HTMLButtonElement;
    expect(more.disabled).toBe(true);
    act(() => places()[0].click());
    expect(p.onToggle).toHaveBeenCalledWith(0);
  });

  it('with nothing on the board an empty place says why, and New loop says why when it is off', () => {
    view = render(<LoopRail {...props({ keepReason: 'Put counters down first.', newLoopReason: 'Stop the piece to make a loop.' })} />);
    expect(places()[2].title).toBe('Put counters down first.');
    const newLoop = [...view.container.querySelectorAll('button')].find((b) => b.textContent === 'New loop') as HTMLButtonElement;
    expect(newLoop.disabled).toBe(true);
    expect(newLoop.title).toBe('Stop the piece to make a loop.');
  });
});
