import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { PieceSteps, type PieceLoop, type PieceStepsProps } from '../ui/screens/boardSequencer/play/PieceSteps';
import { DEFAULT_PERFORMANCE } from '../songs/performance/clock';
import type { Scene, SceneSettings } from '../songs/performance/launcher';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const settings: SceneSettings = { soundWorld: 'warm', band: 'gentle', phrases: true, fillAmount: 0, evolveAmount: 0, bpm: 90 };
const scene = (id: string, at: number | null, loops: number[] = [0], extra: Partial<Scene> = {}): Scene =>
  ({ id, name: id, loops, settings, ...(at === null ? {} : { at }), ...extra });
const loop = (slot: number, name: string, empty = false): PieceLoop =>
  ({ slot, name, notes: empty ? 0 : 2, state: empty ? 'empty' : 'stopped', cells: [] });

function props(over: Partial<PieceStepsProps> = {}): PieceStepsProps {
  return {
    step: 'scenes', onStep: vi.fn(), running: false, lengthSec: 420, passSec: 5, clock: null,
    scenes: [scene('Arrival', 0), scene('Build', 90), scene('Open', 210)], currentScene: null,
    loops: [loop(0, 'Bed'), loop(1, 'Pulse'), ...[2, 3, 4, 5, 6, 7].map((s) => loop(s, '', true))],
    loopFadePasses: 1, performance: { ...DEFAULT_PERFORMANCE }, respectPlayer: true, canSaveBoard: false,
    deletedSceneName: null, diskLine: '', restoreError: null, worldOptions: [{ value: 'warm', label: 'Warm' }],
    readyItems: [], rows: 8, cols: 8, swatchFor: () => '#000', newLoop: null, playerName: 'Tim',
    onNewLoop: vi.fn(), onToggleLoop: vi.fn(), onSaveBoardToLoop: vi.fn(), onDrawLoop: vi.fn(), onClearLoop: vi.fn(),
    onRenameLoop: vi.fn(), onLoopFade: vi.fn(), onGoScene: vi.fn(), onRehearseFrom: vi.fn(), onSaveSceneFromNow: vi.fn(),
    onUpdateSceneFromNow: vi.fn(), onEditScene: vi.fn(), onDeleteScene: vi.fn(), onUndoDelete: vi.fn(), onMakePlan: vi.fn(),
    onRespectPlayer: vi.fn(), onPerformance: vi.fn(), onBackup: vi.fn(), onRestore: vi.fn(), onShow: vi.fn(),
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
const openPanelName = (): string | undefined => (input('Scene name')?.defaultValue);

describe('Scenes: the open panel follows its scene (T2-02)', () => {
  it('after a time edit re-sorts the list, the panel is still on the scene being edited', () => {
    const p = props();
    render(p);
    act(() => button(/^1:30 · Build/)?.click());
    expect(openPanelName()).toBe('Build');
    typeAndLeave(input(/When Build comes in/)!, '5:00');
    expect(p.onEditScene).toHaveBeenCalledWith(1, { at: 300 });
    // The screen saves it and the list comes back in time order: Build is now last.
    render({ ...p, scenes: [scene('Arrival', 0), scene('Open', 210), scene('Build', 300)] });
    expect(openPanelName()).toBe('Build');
    expect(button(/^5:00 · Build/)?.getAttribute('aria-expanded')).toBe('true');
    expect(button(/^3:30 · Open/)?.getAttribute('aria-expanded')).toBe('false');
    // The next change goes to Build, at its new place.
    act(() => button('✓ Bed')?.click());
    expect(p.onEditScene).toHaveBeenLastCalledWith(2, { loops: [] });
  });

  it('a scene keeps its colour when the list re-sorts', () => {
    const p = props();
    render(p);
    const colourOf = (name: RegExp): string => (button(name)?.closest('div[style*="border-left"]') as HTMLElement | null)?.style.borderLeft ?? '';
    const build = colourOf(/^1:30 · Build/);
    expect(build).toMatch(/solid/);
    render({ ...p, scenes: [scene('Arrival', 0), scene('Open', 210), scene('Build', 300)] });
    expect(colourOf(/^5:00 · Build/)).toBe(build);
  });
});

describe('Scenes: typed times (T2-04)', () => {
  it('"2.30", "2:30" and "2,30" all save as 2:30, and the field then shows 2:30', () => {
    for (const typed of ['2.30', '2:30', '2,30']) {
      const p = props();
      render(p);
      act(() => button(/^1:30 · Build/)?.click());
      const field = input(/When Build comes in/)!;
      typeAndLeave(field, typed);
      expect(p.onEditScene).toHaveBeenCalledWith(1, { at: 150 });
      expect(field.value).toBe('2:30');
      act(() => root.render(<span />));
    }
  });

  it('a time it cannot read is refused beside the field, and not saved', () => {
    const p = props();
    render(p);
    act(() => button(/^1:30 · Build/)?.click());
    typeAndLeave(input(/When Build comes in/)!, '2.5');
    expect(p.onEditScene).not.toHaveBeenCalled();
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe('Type a time as minutes:seconds, like 2:30, or leave it empty for by hand only.');
  });
});

describe('Scenes: a scene for the player alone (F4)', () => {
  it('a tick box in the open scene, in plain words; ticking it asks for alone', () => {
    const p = props();
    render(p);
    act(() => button(/^3:30 · Open/)?.click());
    const box = input('Tim alone: no loops, only what Tim plays');
    expect(box?.type).toBe('checkbox');
    expect(box?.checked).toBe(false);
    act(() => box?.click());
    expect(p.onEditScene).toHaveBeenCalledWith(2, { alone: true });
  });

  it('a scene marked alone says so in its line, and unticking it asks to end it', () => {
    const p = props({ scenes: [scene('Arrival', 0), scene('Open', 210, [], { alone: true })] });
    render(p);
    expect(button(/^3:30 · Open/)?.textContent).toContain('Tim alone');
    act(() => button(/^3:30 · Open/)?.click());
    const box = input('Tim alone: no loops, only what Tim plays');
    expect(box?.checked).toBe(true);
    act(() => box?.click());
    expect(p.onEditScene).toHaveBeenCalledWith(1, { alone: false });
  });
});

describe('Scenes: an empty loop in a scene (T2-06)', () => {
  it('shows as a chip marked empty that takes it out, and the line says it is empty', () => {
    const p = props({ scenes: [scene('Arrival', 0, [0, 2])] });
    render(p);
    expect(button(/^0:00 · Arrival/)?.textContent).toContain('Bed, Loop 3 (empty)');
    act(() => button(/^0:00 · Arrival/)?.click());
    const chip = button('Loop 3: empty, take it out');
    expect(chip).toBeDefined();
    act(() => chip?.click());
    expect(p.onEditScene).toHaveBeenCalledWith(0, { loops: [0] });
    // Empty loops that no scene uses are not offered.
    expect(button(/Loop 4/)).toBeUndefined();
  });
});

describe('Ending & check: the length (T2-07, F5, T2-09)', () => {
  it('8:00 is refused with a message, and not saved', () => {
    const p = props({ step: 'ending' });
    render(p);
    typeAndLeave(input(/Length of the piece/)!, '8:00');
    expect(p.onPerformance).not.toHaveBeenCalled();
    expect(text()).toContain('The piece can be at most 7:00.');
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
