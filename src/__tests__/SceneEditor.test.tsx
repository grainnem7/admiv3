/** K2 (Keep design, 5 Nov 2026): the editor of the selected scene, in the panel beside the board. */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act } from 'react';
import { render, type Rendered } from './helpers/render';
import { SceneEditor, type SceneEditorProps } from '../ui/screens/boardSequencer/play/SceneEditor';
import type { Scene, SceneSettings } from '../songs/performance/launcher';
import type { PieceLoop } from '../ui/screens/boardSequencer/play/PieceSteps';
import { forgetFolds } from '../ui/screens/boardSequencer/ui/useSessionFold';

let view: Rendered | null = null;
beforeEach(() => forgetFolds());
afterEach(() => { view?.unmount(); view = null; });

const settings: SceneSettings = { soundWorld: 'warm', band: 'gentle', phrases: true, fillAmount: 0, evolveAmount: 0, bpm: 90, chords: { sequence: 'asBefore', bars: 2 }, bandJobs: { asBefore: true, pads: true, bass: true, drums: true, counter: false }, sceneEnergy: 3 };
const scene = (over: Partial<Scene> = {}): Scene => ({ id: 'b', name: 'Build', loops: [0], settings, at: 90, ...over });
const loop = (slot: number, name: string, empty = false): PieceLoop => ({ slot, name, notes: empty ? 0 : 2, state: empty ? 'empty' : 'stopped', cells: [] });
const props = (over: Partial<SceneEditorProps> = {}): SceneEditorProps => ({
  number: 2, scene: scene(), current: false, running: false, lengthSec: 420, passSec: 5, nextAt: 210,
  loops: [loop(0, 'Bed'), loop(1, 'Pulse'), loop(2, '', true)], worldOptions: [{ value: 'warm', label: 'Warm' }], playerName: 'Tim', loopFadePasses: 1,
  locked: null, onEdit: vi.fn(), onLength: vi.fn(), onHear: vi.fn(), onNewIdeas: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn(), onCheck: vi.fn(), ...over,
});
const button = (name: string | RegExp): HTMLButtonElement | undefined =>
  (view!.all('button') as HTMLButtonElement[]).find((b) => (typeof name === 'string' ? b.textContent === name || b.getAttribute('aria-label') === name : name.test(b.getAttribute('aria-label') ?? b.textContent ?? '')));
const input = (label: string | RegExp): HTMLInputElement | undefined =>
  (view!.all('input') as HTMLInputElement[]).find((i) => { const n = i.getAttribute('aria-label') ?? ''; return typeof label === 'string' ? n === label : label.test(n); });
function typeAndLeave(el: HTMLInputElement, value: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => { el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
}

describe('the scene editor (K2)', () => {
  it('heads with the scene’s number and name (editable in place) and its span; the loops as pressed pills', () => {
    const p = props();
    view = render(<SceneEditor {...p} />);
    expect(view.container.textContent).toContain('Scene 2');
    expect(view.container.textContent).toContain('1:30 → 3:30');
    expect(input('Scene name')!.defaultValue).toBe('Build');
    typeAndLeave(input('Scene name')!, 'Rise');
    expect(p.onEdit).toHaveBeenCalledWith({ name: 'Rise' });
    const group = view.get('[role="group"][aria-label="Loops in this scene"]');
    const pills = [...group.querySelectorAll('button')];
    expect(pills.map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['✓ Bed', 'true'], ['Pulse', 'false']]);
    act(() => pills[1].click());
    expect(p.onEdit).toHaveBeenCalledWith({ loops: [0, 1] });
  });

  it('Energy by its six names; the words line says the world, chords and band, and change ▾ opens the rest', () => {
    view = render(<SceneEditor {...props()} />);
    expect(view.get('[role="radiogroup"][aria-label="Energy of this scene"]').textContent).toContain('Lively');
    expect(view.container.textContent).toContain('Warm');
    expect(view.container.querySelector('[role="radiogroup"][aria-label="Sound world"]')).toBeNull();
    const change = button(/^change/)!;
    expect(change.getAttribute('aria-expanded')).toBe('false');
    act(() => change.click());
    expect(view.container.querySelector('[role="radiogroup"][aria-label="Sound world"]')).not.toBeNull();
    expect(view.container.textContent).toContain('Tim alone: no loops, only what Tim plays');
    expect(button(/^New ideas: Build/)).toBeDefined();
  });

  it('the length field: a good value is sent as seconds; a plain number and an unreadable one are refused beside it, not sent', () => {
    const p = props();
    view = render(<SceneEditor {...p} />);
    const field = input('How long Build lasts (minutes:seconds)')!;
    expect(field.value).toBe('2:00');
    typeAndLeave(field, '2.30');
    expect(p.onLength).toHaveBeenCalledWith(150);
    typeAndLeave(field, '120');
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('minutes:seconds');
    typeAndLeave(field, 'soon');
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('minutes:seconds');
    expect(p.onLength).toHaveBeenCalledTimes(1);
  });

  it('Hear from here while stopped; Jump here now while playing, but not on the scene on now', () => {
    const p = props();
    view = render(<SceneEditor {...p} />);
    act(() => button(/^Hear from here: Build/)!.click());
    expect(p.onHear).toHaveBeenCalled();
    expect(button(/^Jump here now/)).toBeUndefined();
    view.unmount();
    const playing = props({ running: true, onHear: undefined, onGo: vi.fn() });
    view = render(<SceneEditor {...playing} />);
    expect(button(/^Hear from here/)).toBeUndefined();
    act(() => button(/^Jump here now: Build/)!.click());
    expect(playing.onGo).toHaveBeenCalled();
    view.unmount();
    view = render(<SceneEditor {...props({ running: true, current: true, onHear: undefined, onGo: vi.fn() })} />);
    expect(button(/^Jump here now/)).toBeUndefined();
    expect(view.container.textContent).toContain('on now');
  });

  it('Duplicate, Delete scene and Check ›; Update from now only while playing', () => {
    const p = props();
    view = render(<SceneEditor {...p} />);
    act(() => button('Duplicate')!.click());
    expect(p.onDuplicate).toHaveBeenCalled();
    act(() => button('Delete scene')!.click());
    expect(p.onDelete).toHaveBeenCalled();
    act(() => button(/^Check/)!.click());
    expect(p.onCheck).toHaveBeenCalled();
    act(() => button(/^change/)!.click());
    expect(button('Update from now')).toBeUndefined();
    view.unmount();
    view = render(<SceneEditor {...props({ running: true, onUpdateFromNow: vi.fn() })} />);
    // The fold is remembered for the session (A1): still open from the press above.
    expect(button(/^change/)!.getAttribute('aria-expanded')).toBe('true');
    expect(button('Update from now')).toBeDefined();
  });

  it('an empty loop the scene still names shows as a chip that takes it out', () => {
    const p = props({ scene: scene({ loops: [0, 2] }) });
    view = render(<SceneEditor {...p} />);
    act(() => button('Loop 3: empty, take it out')!.click());
    expect(p.onEdit).toHaveBeenCalledWith({ loops: [0] });
  });

  it('locked (the piece plays from Show): the fields and buttons say why; Jump here now stays', () => {
    const p = props({ running: true, locked: 'Stop the piece to change it.', onHear: undefined, onGo: vi.fn() });
    view = render(<SceneEditor {...p} />);
    expect(input('How long Build lasts (minutes:seconds)')!.disabled).toBe(true);
    expect(button('Duplicate')!.disabled).toBe(true);
    expect(view.container.textContent).toContain('Stop the piece to change it.');
    expect(button(/^Jump here now: Build/)!.disabled).toBe(false);
  });
});

describe('the way into this scene (K3)', () => {
  it('Fade 1 or 2, Overlap 1 or 2, or Cut; the one chosen is sent as the scene’s way in', () => {
    const p = props({ scene: scene({ wayIn: { kind: 'overlap', passes: 2 } }) });
    view = render(<SceneEditor {...p} />);
    const group = view.get('[role="radiogroup"][aria-label="Into this scene"]');
    const radios = [...group.querySelectorAll('[role="radio"]')] as HTMLButtonElement[];
    expect(radios.map((r) => (r.textContent ?? '').split('.')[0].trim().startsWith('Fade') || (r.textContent ?? '').startsWith('Overlap') || (r.textContent ?? '').startsWith('Cut'))).toEqual([true, true, true, true, true]);
    expect(radios.map((r) => (r.textContent ?? '').slice(0, 3))).toEqual(['Fad', 'Fad', 'Ove', 'Ove', 'Cut']);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'true', 'false']);
    act(() => radios[4].click());
    expect(p.onEdit).toHaveBeenCalledWith({ wayIn: { kind: 'cut' } });
    act(() => radios[1].click());
    expect(p.onEdit).toHaveBeenCalledWith({ wayIn: { kind: 'fade', passes: 2 } });
  });

  it('a scene without one reads as Fade · 1 pass', () => {
    view = render(<SceneEditor {...props()} />);
    const group = view.get('[role="radiogroup"][aria-label="Into this scene"]');
    expect(([...group.querySelectorAll('[role="radio"]')] as HTMLElement[]).map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false', 'false']);
  });
});

describe('the opening scene of an older piece that starts later (review, 5 Nov)', () => {
  it('says the piece has no scene until then, and one press moves it to 0:00', () => {
    const p = props({ number: 1, scene: scene({ id: 'a', name: 'Arrival', at: 30 }), nextAt: 90 });
    view = render(<SceneEditor {...p} />);
    expect(view.container.textContent).toContain('The piece has no scene until 0:30.');
    act(() => button('Start the piece with it')!.click());
    expect(p.onEdit).toHaveBeenCalledWith({ at: 0 });
    view.unmount();
    view = render(<SceneEditor {...props({ number: 2 })} />);
    expect(button('Start the piece with it')).toBeUndefined();
  });
});
