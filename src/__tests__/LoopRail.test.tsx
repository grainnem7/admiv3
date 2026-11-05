/** G1 (grid investigation, 4 Nov 2026) and K1 (Keep design, 5 Nov): the loop rail beside the board. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { render, type Rendered } from './helpers/render';
import { LoopRail, placeLabel, railPlaces, type LoopRailProps } from '../ui/screens/boardSequencer/play/LoopRail';
import type { PieceLoop } from '../ui/screens/boardSequencer/play/PieceSteps';

let view: Rendered | null = null;
afterEach(() => { view?.unmount(); view = null; });

const loop = (slot: number, over: Partial<PieceLoop> = {}): PieceLoop => ({ slot, name: '', notes: 0, state: 'empty', cells: [], ...over });
const loops = (): PieceLoop[] => [
  loop(0, { name: 'Bed', notes: 5, state: 'playing', cells: [{ row: 1, col: 1, colour: 'c1' }] }),
  loop(1, { notes: 3, state: 'stopped', cells: [{ row: 2, col: 2, colour: 'c1' }] }),
  ...Array.from({ length: 6 }, (_, i) => loop(i + 2)),
];
const none = (): PieceLoop[] => loops().map((l) => ({ ...l, state: 'empty', cells: [], notes: 0 }));
const full = (): PieceLoop[] => loops().map((l) => ({ ...l, state: l.state === 'empty' ? 'stopped' : l.state, notes: Math.max(1, l.notes), cells: [{ row: 1, col: 1, colour: 'c1' }] }));
const props = (over: Partial<LoopRailProps> = {}): LoopRailProps => ({
  loops: loops(), rows: 8, cols: 8, swatchFor: () => '#d03a2c', running: true, keepReason: null, locked: null, newLoopReason: null, keepSlot: 2,
  onKeep: vi.fn(), onToggle: vi.fn(), onRename: vi.fn(), onReplace: vi.fn(), onEditNotes: vi.fn(), onClear: vi.fn(), onNewLoop: vi.fn(), ...over,
});
const places = (): HTMLButtonElement[] => view!.all('[data-loop-place]') as HTMLButtonElement[];
const more = (): HTMLButtonElement => view!.get('button[aria-label^="More"]') as HTMLButtonElement;
const menuButtons = (): HTMLButtonElement[] => view!.all('[role="group"][aria-label$=": more"] button') as HTMLButtonElement[];

describe('the loop rail', () => {
  it('railPlaces: the kept loops in slot order, then the place the next Keep fills', () => {
    expect(railPlaces(loops(), 2)).toEqual({ kept: [loops()[0], loops()[1]], dashed: loops()[2] });
    expect(railPlaces(full(), null).dashed).toBeNull();
    expect(railPlaces(none(), 0)).toEqual({ kept: [], dashed: none()[0] });
  });

  it('shows only the kept loops, in slot order, then one dashed place that keeps the board', () => {
    view = render(<LoopRail {...props()} />);
    const ps = places();
    expect(ps.map((b) => b.textContent)).toEqual(['Bed■', 'Loop 2▶', '+ Keep as loop']);
    expect(ps[0].getAttribute('aria-label')).toBe('Bed: loop 1, 5 notes, playing');
    expect(ps[0].getAttribute('aria-pressed')).toBe('true');
    expect(ps[1].getAttribute('aria-label')).toBe('Loop 2: 3 notes, stopped');
    expect(ps[2].getAttribute('aria-label')).toBe('Keep as loop: keep the board as loop 3');
    expect(ps[2].hasAttribute('aria-pressed')).toBe(false);
    // Stopped, a loop never says it plays.
    expect(placeLabel(loop(0, { name: 'Bed', notes: 5, state: 'playing' }), false)).toBe('Bed: loop 1, 5 notes, stopped');
  });

  it('with no loops kept: the dashed place alone, and where loops come from', () => {
    view = render(<LoopRail {...props({ loops: none(), keepSlot: 0 })} />);
    expect(places().length).toBe(1);
    expect(places()[0].getAttribute('aria-label')).toBe('Keep as loop: keep the board as loop 1');
    expect(view!.container.textContent).toContain('Loops you keep appear here.');
  });

  it('the dashed place keeps the board there; a kept place plays or stops it', () => {
    const p = props();
    view = render(<LoopRail {...p} />);
    act(() => places()[2].click());
    expect(p.onKeep).toHaveBeenCalledWith(2);
    act(() => places()[0].click());
    expect(p.onToggle).toHaveBeenCalledWith(0);
    expect(p.onKeep).toHaveBeenCalledTimes(1);
  });

  it('every place full: no dashed place; "… more" still opens with New loop from silence', () => {
    const p = props({ loops: full(), keepSlot: null });
    view = render(<LoopRail {...p} />);
    expect(places().length).toBe(8);
    expect(places().some((b) => b.textContent === '+ Keep as loop')).toBe(false);
    act(() => more().click());
    const newLoop = menuButtons().find((b) => b.getAttribute('aria-label') === 'New loop: from silence') as HTMLButtonElement;
    act(() => newLoop.click());
    expect(p.onNewLoop).toHaveBeenCalled();
  });

  it('"… more" is never disabled for want of a loop: with none kept it holds New loop from silence only', () => {
    const p = props({ loops: none(), keepSlot: 0 });
    view = render(<LoopRail {...p} />);
    expect(more().disabled).toBe(false);
    act(() => more().click());
    expect(menuButtons().map((b) => b.textContent)).toEqual(['New loop']);
  });

  it('is one tab stop: arrows move over the places shown, Enter presses, Shift+Enter opens the menu', () => {
    const p = props();
    view = render(<LoopRail {...p} />);
    const ps = places();
    expect(ps.map((b) => b.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    act(() => { ps[0].focus(); ps[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    expect(document.activeElement).toBe(places()[1]);
    expect(places()[1].getAttribute('tabindex')).toBe('0');
    // End reaches the dashed place, the last one shown; Home the first.
    act(() => places()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    expect(document.activeElement).toBe(places()[2]);
    act(() => places()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
    expect(document.activeElement).toBe(places()[0]);
    act(() => places()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
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
    expect(more().disabled).toBe(true);
    act(() => places()[0].click());
    expect(p.onToggle).toHaveBeenCalledWith(0);
  });

  it('with nothing on the board the dashed place says why, and New loop in the menu says why when it is off', () => {
    view = render(<LoopRail {...props({ keepReason: 'Put counters down first.', newLoopReason: 'Stop the piece to make a loop.' })} />);
    expect(places()[2].title).toBe('Put counters down first.');
    act(() => more().click());
    const newLoop = menuButtons().find((b) => b.getAttribute('aria-label') === 'New loop: from silence') as HTMLButtonElement;
    expect(newLoop.disabled).toBe(true);
    expect(newLoop.title).toBe('Stop the piece to make a loop.');
  });
});
