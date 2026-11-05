import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { PiecePicker, PieceSteps, type PieceLoop, type PieceStepsProps } from '../ui/screens/boardSequencer/play/PieceSteps';
import { DEFAULT_PERFORMANCE } from '../songs/performance/clock';
import type { Scene, SceneSettings } from '../songs/performance/launcher';
import { BOARD_TOKENS } from '../ui/screens/boardSequencer/theme/boardTokens';
import { forgetFolds } from '../ui/screens/boardSequencer/ui/useSessionFold';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { forgetFolds(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const settings: SceneSettings = { soundWorld: 'warm', band: 'gentle', phrases: true, fillAmount: 0, evolveAmount: 0, bpm: 90, chords: { sequence: 'asBefore', bars: 2 }, bandJobs: { asBefore: true, pads: true, bass: true, drums: true, counter: false }, sceneEnergy: 0 };
const scene = (id: string, at: number | null, loops: number[] = [0], extra: Partial<Scene> = {}): Scene =>
  ({ id, name: id, loops, settings, ...(at === null ? {} : { at }), ...extra });
const loop = (slot: number, name: string, empty = false): PieceLoop =>
  ({ slot, name, notes: empty ? 0 : 2, state: empty ? 'empty' : 'stopped', cells: [] });

function props(over: Partial<PieceStepsProps> = {}): PieceStepsProps {
  return {
    step: 'scenes', onStep: vi.fn(), selectedScene: null, onSelectScene: vi.fn(), onLength: vi.fn(), locked: null, running: false, lengthSec: 420, passSec: 5, clock: null,
    scenes: [scene('Arrival', 0), scene('Build', 90), scene('Open', 210)], currentScene: null,
    loops: [loop(0, 'Bed'), loop(1, 'Pulse'), ...[2, 3, 4, 5, 6, 7].map((s) => loop(s, '', true))],
    loopFadePasses: 1, performance: { ...DEFAULT_PERFORMANCE }, respectPlayer: true,
    deletedSceneName: null, diskLine: '', restoreError: null, worldOptions: [{ value: 'warm', label: 'Warm' }],
    readyItems: [], rows: 8, cols: 8, swatchFor: () => '#000', palette: BOARD_TOKENS.calm.dark, newLoop: null, playerName: 'Tim',
    colours: [
      { id: 'c1', name: 'Red', swatch: '#e03030', job: 'Melody', at: null },
      { id: 'c2', name: 'Blue', swatch: '#3050e0', job: 'Bass', at: 150 },
    ],
    onColourEntry: vi.fn(),
    onGoScene: vi.fn(), onRehearseFrom: vi.fn(), onSaveSceneFromNow: vi.fn(),
    onUpdateSceneFromNow: vi.fn(), onEditScene: vi.fn(), onDeleteScene: vi.fn(), onDuplicateScene: vi.fn(), pieces: [{ id: 'piece-1', name: 'Piece 1', scenes: 3, lengthSec: 420 }], pieceId: 'piece-1', pieceLocked: null, onOpenPiece: vi.fn(), onNewPiece: vi.fn(), onDuplicatePiece: vi.fn(), onDeletePiece: vi.fn(), onRenamePiece: vi.fn(), onUndoDelete: vi.fn(),
    onRespectPlayer: vi.fn(), onNewIdeasScene: vi.fn(), onNewIdeasPiece: vi.fn(), surpriseMe: false, onSurpriseMe: vi.fn(), onPerformance: vi.fn(), onBackup: vi.fn(), onRestore: vi.fn(), onShow: vi.fn(),
    ...over,
  };
}
const render = (p: PieceStepsProps): void => { act(() => root.render(<PieceSteps {...p} />)); };
const text = (): string => host.textContent ?? '';
const button = (name: string | RegExp): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find((b) => (typeof name === 'string' ? b.textContent === name : name.test(b.textContent ?? '')));
const input = (label: string | RegExp): HTMLInputElement | undefined =>
  [...host.querySelectorAll('input')].find((i) => {
    const name = (i.getAttribute('aria-label') ?? i.closest('label')?.textContent ?? '').trim();
    return typeof label === 'string' ? name === label : label.test(name);
  });
/** Type into a React-controlled field, then leave it (Tab). */
function typeAndLeave(el: HTMLInputElement, value: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => { el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
}

describe('Ending & check: the length (T2-07, F5, T2-09)', () => {
  it('8:00 is refused with a message, and not saved', () => {
    const p = props({ step: 'ending' });
    render(p);
    typeAndLeave(input(/Length of the piece/)!, '8:00');
    expect(p.onPerformance).not.toHaveBeenCalled();
    expect(text()).toContain('The piece can be at most 7:00.');
  });

  it('a plain number is refused with how to write it, and not saved', () => {
    const p = props({ step: 'ending' });
    render(p);
    typeAndLeave(input(/Length of the piece/)!, '7');
    expect(p.onPerformance).not.toHaveBeenCalled();
    expect(text()).toContain('Type minutes and seconds, like 7:00.');
  });

  it('6.30 saves as 6:30, and says the scenes keep their times', () => {
    const p = props({ step: 'ending', scenes: [scene('Arrival', 0), scene('Home', 400)] });
    render(p);
    const field = input(/Length of the piece/)!;
    typeAndLeave(field, '6.30');
    expect(p.onPerformance).toHaveBeenCalledWith({ lengthSec: 390 });
    expect(field.value).toBe('6:30');
    render({ ...p, lengthSec: 390, performance: { ...p.performance, lengthSec: 390 } });
    expect(text()).toContain('The scenes keep their times. Home now comes in at or after the end: see the check below.');
  });
});

describe('Ending & check: fixing from the check', () => {
  it('a check line with a button: Take it out', () => {
    const onClick = vi.fn();
    render(props({
      step: 'ending',
      readyItems: [{ label: 'Open uses Bed, which is empty', state: 'problem', fix: 'Take it out of the scene, or make a new loop and add that instead.', action: { label: 'Take it out', name: 'Take it out: Bed, from Open', onClick } }],
    }));
    const b = button('Take it out');
    expect(b?.getAttribute('aria-label')).toBe('Take it out: Bed, from Open');
    act(() => b?.click());
    expect(onClick).toHaveBeenCalled();
    expect(text()).toContain('1 thing needs fixing before the piece.');
  });
});

describe('Check: when each colour comes in (K2: the whole piece)', () => {
  const field = (name: string): HTMLInputElement | undefined => input(new RegExp(`^When ${name} comes in, in the piece`));
  const card = (): HTMLElement | null => host.querySelector('[aria-labelledby="piece-colours"]');

  it('a card lists each sound colour with its time (blank = from the start), and says the times count only while the piece plays', () => {
    render(props({ step: 'ending' }));
    expect(card()?.textContent).toContain('When each colour comes in');
    expect(card()?.textContent).toContain('Red');
    expect(card()?.textContent).toContain('Melody');
    expect(field('Red')?.value).toBe('');
    expect(field('Red')?.placeholder).toBe('from the start');
    expect(field('Blue')?.value).toBe('2:30');
    expect(card()?.textContent).toMatch(/only while the piece plays/);
    // Without scenes too: the colours are for the whole piece.
    render(props({ step: 'ending', scenes: [] }));
    expect(field('Red')).toBeDefined();
  });

  it('a time typed as a scene’s is saved; emptied, the colour plays from the start', () => {
    const p = props({ step: 'ending' });
    render(p);
    typeAndLeave(field('Red')!, '1.30');
    expect(p.onColourEntry).toHaveBeenLastCalledWith('c1', 90);
    expect(field('Red')?.value).toBe('1:30');
    typeAndLeave(field('Blue')!, '');
    expect(p.onColourEntry).toHaveBeenLastCalledWith('c2', null);
  });

  it('a time it cannot read is refused beside the field, and not saved; one after the end is said', () => {
    const p = props({ step: 'ending', lengthSec: 300 });
    render(p);
    typeAndLeave(field('Red')!, 'soon');
    expect(p.onColourEntry).not.toHaveBeenCalled();
    expect(text()).toContain('Type a time as minutes:seconds, like 1:30.');
    typeAndLeave(field('Red')!, '6:00');
    expect(p.onColourEntry).toHaveBeenLastCalledWith('c1', 360);
    expect(text()).toContain('After the end of the piece (5:00)');
  });

  it('no card when no colour plays notes', () => {
    render(props({ step: 'ending', colours: [] }));
    expect(card()).toBeNull();
  });
});

describe('item 3: the pieces, under the storyboard’s ▾ (K2)', () => {
  const renderPicker = (p: PieceStepsProps): void => { act(() => root.render(<PiecePicker pieces={p.pieces} pieceId={p.pieceId} pieceLocked={p.pieceLocked} onOpenPiece={p.onOpenPiece} onNewPiece={p.onNewPiece} onDuplicatePiece={p.onDuplicatePiece} onDeletePiece={p.onDeletePiece} onRenamePiece={p.onRenamePiece} />)); };
  it('lists the pieces with Open, Duplicate, Delete, Rename and New piece', () => {
    const p = props({ pieces: [{ id: 'a', name: 'Opening set', scenes: 4, lengthSec: 420 }, { id: 'b', name: 'Encore', scenes: 0, lengthSec: 120 }], pieceId: 'a' });
    renderPicker(p);
    const group = host.querySelector('[role="group"][aria-label="Pieces"]')!;
    const rows = [...group.querySelectorAll('li')].map((li) => li.getAttribute('aria-label'));
    expect(rows).toEqual(['Opening set: 4 scenes, 7:00, open now', 'Encore: 0 scenes, 2:00']);
    expect(input('Name of this piece')!.value).toBe('Opening set');
    const named = (n: string): HTMLButtonElement | undefined => [...group.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === n);
    expect(named('Open: Opening set')).toBeUndefined();
    act(() => named('Open: Encore')!.click());
    expect(p.onOpenPiece).toHaveBeenCalledWith('b');
    act(() => named('Duplicate: Opening set')!.click());
    expect(p.onDuplicatePiece).toHaveBeenCalledWith('a');
    act(() => named('Delete: Encore')!.click());
    expect(p.onDeletePiece).toHaveBeenCalledWith('b');
    act(() => button('New piece')!.click());
    expect(p.onNewPiece).toHaveBeenCalledTimes(1);
  });

  it('with one piece there is no Delete; while the piece plays nothing can be opened', () => {
    renderPicker(props({ pieceLocked: 'Stop the piece first.', pieces: [{ id: 'a', name: 'Piece 1', scenes: 1, lengthSec: 60 }, { id: 'b', name: 'Piece 2', scenes: 0, lengthSec: 60 }], pieceId: 'a' }));
    const open = [...host.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Open: Piece 2') as HTMLButtonElement;
    expect(open.disabled).toBe(true);
    renderPicker(props());
    expect([...host.querySelectorAll('button')].some((b) => (b.getAttribute('aria-label') ?? '').startsWith('Delete:'))).toBe(false);
  });
});

describe('K2: the panel holds the selected scene’s editor, or Check', () => {
  it('no scene selected: one line pointing under the board; with scenes, the line says to press one', () => {
    render(props({ scenes: [] }));
    expect(text()).toContain('No scenes yet: see under the board.');
    render(props());
    expect(text()).toContain('Press a scene under the board to change it here.');
    expect(input('Scene name')).toBeUndefined();
  });

  it('the selected scene: its editor, with its number and name; Check › opens Check', () => {
    const p = props({ selectedScene: 'Build' });
    render(p);
    expect(text()).toContain('Scene 2');
    expect(input('Scene name')!.defaultValue).toBe('Build');
    act(() => button(/^Check/)!.click());
    expect(p.onStep).toHaveBeenCalledWith('ending');
  });

  it('Check: the length, the ending, the whole piece (colour times, the same ideas, the strips) and Back to the scene', () => {
    const p = props({ step: 'ending' });
    render(p);
    expect(text()).toContain('The whole piece');
    expect(text()).toContain('The same ideas each rehearsal');
    expect(text()).toContain("Scenes leave the player's strips alone");
    expect(host.querySelector('[aria-labelledby="piece-colours"]')).not.toBeNull();
    act(() => button('‹ Back to the scene')!.click());
    expect(p.onStep).toHaveBeenCalledWith('scenes');
    expect(text()).not.toContain('Rehearse from here');
  });

  it('Delete scene: the scene is unselected, deleted, and focus goes to Undo (T4-09)', async () => {
    const p = props({ selectedScene: 'Build' });
    render(p);
    const del = button('Delete scene')!;
    act(() => { del.focus(); del.click(); });
    expect(p.onSelectScene).toHaveBeenCalledWith(null);
    expect(p.onDeleteScene).toHaveBeenCalledWith(1);
    render({ ...p, selectedScene: null, deletedSceneName: 'Build' });
    await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
    expect((document.activeElement as HTMLElement | null)?.textContent).toBe('Undo');
  });
});
describe('K1: loops are kept from the panel, not here', () => {
  it('Make a piece has no Loops section: no Keep as loop, no New loop, no Other ways, no fade control', () => {
    render(props({ step: 'loops' }));
    expect(text()).not.toContain('Other ways to make a loop');
    expect(text()).not.toContain('More: fades');
    expect(button('Keep as loop')).toBeUndefined();
    expect(button('New loop')).toBeUndefined();
  });

  it("New loop's own panel still shows while it is open", () => {
    render(props({ step: 'loops', newLoop: <p>New loop 1 · silent</p> }));
    expect(text()).toContain('New loop 1 · silent');
  });
});
