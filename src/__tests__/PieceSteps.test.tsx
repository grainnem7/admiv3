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
    loopFadePasses: 1, performance: { ...DEFAULT_PERFORMANCE }, respectPlayer: true, canSaveBoard: false, loopsFull: false,
    deletedSceneName: null, diskLine: '', restoreError: null, worldOptions: [{ value: 'warm', label: 'Warm' }],
    readyItems: [], rows: 8, cols: 8, swatchFor: () => '#000', newLoop: null, playerName: 'Tim',
    colours: [
      { id: 'c1', name: 'Red', swatch: '#e03030', job: 'Melody', at: null },
      { id: 'c2', name: 'Blue', swatch: '#3050e0', job: 'Bass', at: 150 },
    ],
    onColourEntry: vi.fn(),
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

  it('a plain number is refused beside the field, saying how to write it, and not saved', () => {
    const p = props();
    render(p);
    act(() => button(/^1:30 · Build/)?.click());
    const field = input(/When Build comes in/)!;
    typeAndLeave(field, '3');
    expect(p.onEditScene).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Type minutes and seconds, like 3:00.');
    expect(field.value).toBe('3'); // left as typed, to be put right
  });

  it('"0" is the start of the piece, 0:00', () => {
    const p = props();
    render(p);
    act(() => button(/^1:30 · Build/)?.click());
    const field = input(/When Build comes in/)!;
    typeAndLeave(field, '0');
    expect(p.onEditScene).toHaveBeenCalledWith(1, { at: 0 });
    expect(field.value).toBe('0:00');
  });

  it('a time it cannot read is refused beside the field, and not saved', () => {
    const p = props();
    render(p);
    act(() => button(/^1:30 · Build/)?.click());
    typeAndLeave(input(/When Build comes in/)!, '2.5');
    expect(p.onEditScene).not.toHaveBeenCalled();
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe('Type a time as minutes:seconds, like 2:30.');
  });

  it('the field is named for its scene in minutes:seconds, and never invites "empty = by hand only" (R2-T2-06)', () => {
    render(props());
    act(() => button(/^1:30 · Build/)?.click());
    expect(input('When Build comes in (minutes:seconds)')).toBeDefined();
    expect(host.innerHTML).not.toMatch(/by hand only/);
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

describe('Loops: one way to make a loop (F1, T1-01, T2-14)', () => {
  const rows = (): string[] => ['Save the board here', 'Overwrite with board', '✎ Edit notes'];

  it('outside New loop and the show, the old ways are still there for now', () => {
    render(props({ step: 'loops', canSaveBoard: true }));
    for (const r of rows()) expect(button(r), r).toBeDefined();
  });

  it('inside New loop: no Save the board here, Overwrite or Edit notes, and no ▶ Play on a loop (T1-10)', () => {
    render(props({ step: 'loops', canSaveBoard: true, newLoop: <p>making</p> }));
    for (const r of rows()) expect(button(r), r).toBeUndefined();
    expect(button('▶ Play')).toBeUndefined();
    expect(text()).not.toContain('put counters on it to save a loop');
    // A loop can still be cleared from inside New loop (to make room for Keep).
    expect(host.querySelector('button[aria-label="Clear loop 1"]')).not.toBeNull();
  });

  it('while the piece clock runs: no old ways, and New loop is off, saying why (F2)', () => {
    const p = props({ step: 'loops', canSaveBoard: true, running: true, clock: { phase: 'running', text: '6:30', remainingSec: 390, elapsedSec: 30 } });
    render(p);
    for (const r of rows()) expect(button(r), r).toBeUndefined();
    const nl = button('New loop');
    expect(nl?.disabled).toBe(true);
    expect(text()).toContain('Stop the piece to make a loop');
    act(() => nl?.click());
    expect(p.onNewLoop).not.toHaveBeenCalled();
  });

  it('with every loop full, New loop is off, saying why beside it, tied to it (R2-T1-05, R2-T4-04)', () => {
    const p = props({ step: 'loops', loopsFull: true });
    render(p);
    const nl = button('New loop');
    expect(nl?.disabled).toBe(true);
    const id = nl?.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(id)?.textContent).toBe('Every loop is full: clear one first');
    act(() => nl?.click());
    expect(p.onNewLoop).not.toHaveBeenCalled();
  });

  it('while the piece plays and every loop is full, the piece is the reason given (F2)', () => {
    render(props({ step: 'loops', loopsFull: true, running: true, clock: { phase: 'running', text: '6:30', remainingSec: 390, elapsedSec: 30 } }));
    expect(text()).toContain('Stop the piece to make a loop');
    expect(text()).not.toContain('Every loop is full');
  });

  it('outside New loop with an empty board: a plain note, "To make a loop, press New loop." (R2-T1-07)', () => {
    render(props({ step: 'loops', canSaveBoard: false }));
    expect(text()).toContain('To make a loop, press New loop.');
    expect(text()).not.toContain('The board is empty');
    const line = [...host.querySelectorAll('p')].find((x) => x.textContent === 'To make a loop, press New loop.');
    expect(line?.getAttribute('role')).toBeNull();
    expect(line?.getAttribute('style') ?? '').not.toContain('bs-warn');
  });

  it('the note goes once counters are down, and inside New loop', () => {
    render(props({ step: 'loops', canSaveBoard: true }));
    expect(text()).not.toContain('To make a loop, press New loop.');
    render(props({ step: 'loops', canSaveBoard: false, newLoop: <p>making</p> }));
    expect(text()).not.toContain('To make a loop, press New loop.');
  });

  it('every loop full: no note to press New loop, which is off (R3-TB-03)', () => {
    render(props({ step: 'loops', canSaveBoard: false, loopsFull: true }));
    expect(text()).toContain('Every loop is full');
    expect(text()).not.toContain('To make a loop, press New loop.');
  });
});

describe('Scenes: Update from now copies only what is really playing (R2-T2-02)', () => {
  it('stopped: no Update from now in an open scene, and its note says when it can be used', () => {
    const p = props({ running: false });
    render(p);
    act(() => button(/^3:30 · Open/)?.click());
    expect(button('Update from now')).toBeUndefined();
    expect(text()).toContain('While the board plays, Update from now copies what is playing into this scene.');
  });

  it('playing: Update from now is there, and asks for this scene', () => {
    const p = props({ running: true });
    render(p);
    act(() => button(/^3:30 · Open/)?.click());
    expect(text()).not.toContain('While the board plays, Update from now');
    act(() => button('Update from now')?.click());
    expect(p.onUpdateSceneFromNow).toHaveBeenCalledWith(2);
  });
});

describe('focus never drops to the page (T1-04, T4-09)', () => {
  /** A few frames: focus waits for the pressed button to go (setTimeout 16 ms in the tests). */
  const frames = (): Promise<void> => act(async () => { await new Promise((r) => setTimeout(r, 80)); });
  const pressWithKeyboard = (b: HTMLButtonElement | undefined): void => { act(() => b?.focus()); act(() => b?.click()); };

  it('New loop is off while the piece plays, and its reason is tied to it', () => {
    render(props({ step: 'loops', running: true, clock: { phase: 'running', text: '6:30', remainingSec: 390, elapsedSec: 30 } }));
    const id = button('New loop')?.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(id)?.textContent).toBe('Stop the piece to make a loop');
  });

  it('Done or Leave closes New loop: focus goes back to New loop, one Enter from the next loop', () => {
    const p = props({ step: 'loops', newLoop: <button type="button">Done</button> });
    render(p);
    pressWithKeyboard(button('Done'));
    render({ ...p, newLoop: null });
    expect(document.activeElement).toBe(button('New loop'));
  });

  it('Make my plan: focus goes to the first scene', async () => {
    const p = props({ scenes: [] });
    render(p);
    pressWithKeyboard(button(/Make my plan/));
    render({ ...p, scenes: [scene('Arrival', 0), scene('Build', 90)] });
    await frames();
    expect(document.activeElement).toBe(button(/^0:00 · Arrival/));
  });

  it('Delete scene: focus goes to Undo; Undo: to the scene that came back', async () => {
    const p = props();
    render(p);
    act(() => button(/^1:30 · Build/)?.click());
    pressWithKeyboard(button('Delete scene'));
    expect(p.onDeleteScene).toHaveBeenCalledWith(1);
    render({ ...p, scenes: [scene('Arrival', 0), scene('Open', 210)], deletedSceneName: 'Build' });
    await frames();
    expect(document.activeElement).toBe(button('Undo'));
    act(() => button('Undo')?.click());
    render({ ...p, deletedSceneName: null });
    await frames();
    expect(document.activeElement).toBe(button(/^1:30 · Build/));
  });

  it('Undo that runs out of time: focus goes to the Scenes heading, never the page', async () => {
    const p = props();
    render(p);
    act(() => button(/^1:30 · Build/)?.click());
    pressWithKeyboard(button('Delete scene'));
    render({ ...p, scenes: [scene('Arrival', 0), scene('Open', 210)], deletedSceneName: 'Build' });
    await frames();
    expect(document.activeElement).toBe(button('Undo'));
    render({ ...p, scenes: [scene('Arrival', 0), scene('Open', 210)], deletedSceneName: null });
    await frames();
    expect(document.activeElement).toBe(host.querySelector('h3#piece-scenes'));
  });

  it('deleting the last scene (no Undo there): focus goes to the Scenes heading', async () => {
    const p = props({ scenes: [scene('Arrival', 0)] });
    render(p);
    act(() => button(/^0:00 · Arrival/)?.click());
    pressWithKeyboard(button('Delete scene'));
    render({ ...p, scenes: [], deletedSceneName: 'Arrival' });
    await frames();
    expect(document.activeElement).toBe(host.querySelector('h3#piece-scenes'));
  });

  it('Rehearse from here: focus goes to ▶ Play / ■ Stop once the rehearsal plays', async () => {
    const transport = document.createElement('button');
    transport.id = 'bs-play-stop';
    transport.textContent = '■ Stop';
    document.body.appendChild(transport);
    try {
      const p = props();
      render(p);
      pressWithKeyboard(button(/Rehearse from here/));
      expect(p.onRehearseFrom).toHaveBeenCalled();
      render({ ...p, running: true });
      await frames();
      expect(document.activeElement).toBe(transport);
    } finally { transport.remove(); }
  });
});

describe('Scenes: when each colour comes in', () => {
  const field = (name: string): HTMLInputElement | undefined => input(new RegExp(`^When ${name} comes in, in the piece`));
  const card = (): HTMLElement | null => host.querySelector('[aria-labelledby="piece-colours"]');

  it('a card lists each sound colour with its time (blank = from the start), and says the times count only while the piece plays', () => {
    render(props());
    expect(card()?.textContent).toContain('When each colour comes in');
    expect(card()?.textContent).toContain('Red');
    expect(card()?.textContent).toContain('Melody');
    expect(field('Red')?.value).toBe('');
    expect(field('Red')?.placeholder).toBe('from the start');
    expect(field('Blue')?.value).toBe('2:30');
    expect(card()?.textContent).toMatch(/only while the piece plays/);
    // Without scenes too: the colours are for the whole piece.
    render(props({ scenes: [] }));
    expect(field('Red')).toBeDefined();
  });

  it('a time typed as a scene’s is saved; emptied, the colour plays from the start', () => {
    const p = props();
    render(p);
    typeAndLeave(field('Red')!, '1.30');
    expect(p.onColourEntry).toHaveBeenLastCalledWith('c1', 90);
    expect(field('Red')?.value).toBe('1:30');
    typeAndLeave(field('Blue')!, '');
    expect(p.onColourEntry).toHaveBeenLastCalledWith('c2', null);
  });

  it('a time it cannot read is refused beside the field, and not saved; one after the end is said', () => {
    const p = props({ lengthSec: 300 });
    render(p);
    typeAndLeave(field('Red')!, 'soon');
    expect(p.onColourEntry).not.toHaveBeenCalled();
    expect(text()).toContain('Type a time as minutes:seconds, like 1:30.');
    typeAndLeave(field('Red')!, '6:00');
    expect(p.onColourEntry).toHaveBeenLastCalledWith('c1', 360);
    expect(text()).toContain('After the end of the piece (5:00)');
  });

  it('no card when no colour plays notes', () => {
    render(props({ colours: [] }));
    expect(card()).toBeNull();
  });
});

describe('Scenes: reach this speed at once, or gradually', () => {
  /** A slider, by the words of its label (LabeledSlider's label points at it). */
  const slider = (name: RegExp): HTMLInputElement | undefined => {
    const l = [...host.querySelectorAll('label')].find((x) => name.test(x.textContent ?? ''));
    return l?.htmlFor ? (document.getElementById(l.htmlFor) as HTMLInputElement | null) ?? undefined : undefined;
  };
  const radio = (name: string): HTMLButtonElement | undefined =>
    [...host.querySelectorAll<HTMLButtonElement>('[role="radiogroup"][aria-label="Reach this speed"] [role="radio"]')].find((b) => b.textContent === name);

  it('at once by default; Gradually asks for a glide, shown in seconds with a slider', () => {
    const p = props();
    render(p);
    act(() => button(/^1:30 · Build/)?.click());
    expect(radio('At once')?.getAttribute('aria-checked')).toBe('true');
    expect(slider(/^Over/)).toBeUndefined();
    act(() => radio('Gradually')?.click());
    expect(p.onEditScene).toHaveBeenLastCalledWith(1, { glideSec: 8 });
  });

  it('a gliding scene shows its time, says so in its line, and goes back to at once', () => {
    const p = props({ scenes: [scene('Arrival', 0), scene('Build', 90, [0], { glideSec: 12 }), scene('Open', 210)] });
    render(p);
    expect(button(/^1:30 · Build/)?.textContent).toContain('90 BPM, reached over 12 s');
    act(() => button(/^1:30 · Build/)?.click());
    expect(radio('Gradually')?.getAttribute('aria-checked')).toBe('true');
    const over = slider(/^Over/);
    expect(over?.min).toBe('2');
    expect(over?.max).toBe('120');
    expect(text()).toContain('12 seconds');
    act(() => radio('At once')?.click());
    expect(p.onEditScene).toHaveBeenLastCalledWith(1, { glideSec: 0 });
  });
});
