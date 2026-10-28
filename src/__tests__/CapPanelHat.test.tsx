import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { CapPanel, hatResultText, type CapPanelProps } from '../ui/screens/boardSequencer/play/CapPanel';
import type { CapView } from '../ui/screens/boardSequencer/useCapTracker';
import { DEFAULT_CAP_SETTINGS, type CapSettings } from '../tracking/cap/capTracker';
import { storeLearntHat, HAT_BINS, ROOM_PICTURE_H, ROOM_PICTURE_W } from '../tracking/cap/hatColour';
import { DEFAULT_BOARD_SEQUENCER_CONFIG } from '../profiles/BoardSequencerConfig';

/** The Cap tab's "Learn the hat" card: its words, its countdown, and where focus goes. */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

/** A learnt hat as stored (its colours don't matter to the card). */
const hat = (() => {
  const h = new Float32Array(HAT_BINS);
  h[0] = 50;
  return storeLearntHat(
    { hat: h, room: new Float32Array(HAT_BINS), picture: new Float32Array(ROOM_PICTURE_W * ROOM_PICTURE_H * 3) },
    0.6, new Date(2026, 9, 28, 14, 5).getTime(),
  );
})();

const view = (over: Partial<CapView> = {}): CapView => ({
  camera: 'running', face: 'off', seen: true, source: 'cap', axes: { x: 0.5, y: 0.5 }, values: {}, learning: null,
  paused: null, hatLearning: null, hatResult: null, roomLearnt: false, ...over,
});

function props(settings: Partial<CapSettings> = {}, v: Partial<CapView> = {}): CapPanelProps {
  return {
    settings: { ...DEFAULT_CAP_SETTINGS, enabled: true, faceAssist: false, ...settings },
    onChange: vi.fn(), view: view(v),
    previewRef: { current: { frame: null, sighting: null, face: null, mask: null, others: [] } },
    pointerRef: { current: null }, mouse: false, onMouse: vi.fn(), cameras: [],
    learnReach: vi.fn(), learnSide: vi.fn(), learnHatStep: vi.fn(), clearHatResult: vi.fn(), colourAt: vi.fn(() => null),
    ranges: DEFAULT_BOARD_SEQUENCER_CONFIG.controlRanges, onRange: vi.fn(), announce: vi.fn(), boardCameraId: '',
  };
}
const render = (p: CapPanelProps): void => { act(() => root.render(<CapPanel {...p} />)); };
const card = (): HTMLElement => {
  const g = [...host.querySelectorAll<HTMLElement>('[role="group"]')]
    .find((el) => document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent === 'Learn the hat');
  if (!g) throw new Error('no Learn the hat card');
  return g;
};
const button = (name: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === name);
const step1 = '1 · Learn the room (hat off)';
const step2 = '2 · Learn the hat (hat on)';

describe('Learn the hat, in the Cap tab', () => {
  it('says under the picture what the cap is looked for by: its colour, or the learnt hat', () => {
    render(props());
    expect(host.textContent).toContain('Looking for the cap’s colour.');
    expect(card().textContent).toContain('Not learnt yet: the cap is found by its colour.');
    render(props({ learntHat: hat }));
    expect(host.textContent).toContain('Looking for the learnt hat.');
    expect(host.textContent).not.toContain('Looking for the cap’s colour.');
    expect(card().textContent).toMatch(/A learnt hat is in use \(learnt 28 Oct.*14:05\)\./);
    const canvas = host.querySelector('canvas')!;
    expect(canvas.getAttribute('aria-label')).toContain('The learnt hat is in use.');
  });

  it('while a step watches: a countdown in words and how far it has got', () => {
    render(props({}, { hatLearning: { step: 'room', phase: 'ready', seconds: 2, progress: 0 } }));
    expect(card().textContent).toContain('Learning the room: starts in 2…');
    const bar = card().querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    render(props({}, { hatLearning: { step: 'room', phase: 'watching', seconds: 2, progress: 0.5 } }));
    expect(card().textContent).toContain('Watching the room: 2 s. The hat stays off.');
    expect(card().querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('50');
    render(props({}, { roomLearnt: true, hatLearning: { step: 'hat', phase: 'watching', seconds: 1, progress: 0.85 } }));
    expect(card().textContent).toContain('Watching the hat: 1 s. Move the head a little, any way.');
    expect(card().querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('85');
    // Nothing under way: no bar to read.
    render(props());
    expect(card().querySelector('[role="progressbar"]')).toBeNull();
  });

  it('the step buttons keep focus whatever the camera does: never disabled, they say why they can\'t start', () => {
    const p = props({}, { camera: 'running' });
    render(p);
    button(step1)!.focus();
    // The camera stops (another camera chosen, or it failed) while the button has focus.
    const q = { ...p, view: view({ camera: 'starting' }) };
    render(q);
    const b = button(step1)!;
    expect(b.disabled).toBe(false);
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(b);
    const why = document.getElementById(b.getAttribute('aria-describedby') ?? '');
    expect(why?.textContent).toBe('Learning the hat needs the camera picture.');
    act(() => b.click());
    expect(q.learnHatStep).not.toHaveBeenCalled();
    expect(q.announce).toHaveBeenCalledWith('Learning the hat needs the camera picture.');
    expect(button(step2)!.disabled).toBe(false);
    // While a step is under way, a second press does nothing and focus stays put.
    const r = props({}, { hatLearning: { step: 'room', phase: 'watching', seconds: 2, progress: 0.3 } });
    render(r);
    act(() => button(step2)!.click());
    expect(r.learnHatStep).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button(step1));
  });

  it('runs a step: 1 learns the room, 2 the hat', () => {
    const p = props({}, { roomLearnt: true });
    render(p);
    act(() => button(step1)!.click());
    expect(p.learnHatStep).toHaveBeenCalledWith('room');
    act(() => button(step2)!.click());
    expect(p.learnHatStep).toHaveBeenCalledWith('hat');
  });

  it('Forget the learnt hat: back to the clicked colour, and focus goes to step 1 before the button goes', () => {
    const p = props({ learntHat: hat });
    render(p);
    const forget = button('Forget the learnt hat')!;
    forget.focus();
    act(() => forget.click());
    expect(p.onChange).toHaveBeenCalledWith({ learntHat: null });
    expect(p.clearHatResult).toHaveBeenCalled();
    expect(p.announce).toHaveBeenCalledWith('The learnt hat is forgotten. The cap is found by its colour again.');
    expect(document.activeElement).toBe(button(step1));
    render({ ...p, settings: { ...p.settings, learntHat: null } });
    expect(button('Forget the learnt hat')).toBeUndefined();
    expect(document.activeElement).toBe(button(step1));
  });

  it('"How sure before it counts": only with a learnt hat, 60% to start, from 30% to 90%, kept with the hat', () => {
    render(props());
    expect(card().textContent).not.toContain('How sure before it counts');
    const p = props({ learntHat: hat });
    render(p);
    const label = [...card().querySelectorAll('label')].find((l) => l.textContent?.startsWith('How sure before it counts'))!;
    expect(label.textContent).toContain('60%');
    const slider = document.getElementById(label.htmlFor) as HTMLInputElement;
    expect([slider.min, slider.max, slider.step, slider.value]).toEqual(['0.3', '0.9', '0.05', '0.6']);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(slider, '0.75');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(p.onChange).toHaveBeenCalledWith({ learntHat: { ...hat, sure: 0.75 } });
  });

  it('Show what it sees as the hat: a switch, and the picture says what is tinted and outlined', () => {
    render(props({ learntHat: hat }));
    const show = [...host.querySelectorAll('[role="switch"]')].find((s) => s.textContent?.startsWith('Show what it sees as the hat'))!;
    expect(show.getAttribute('aria-checked')).toBe('false');
    act(() => (show as HTMLButtonElement).click());
    expect(show.getAttribute('aria-checked')).toBe('true');
    const label = host.querySelector('canvas')!.getAttribute('aria-label');
    expect(label).toContain('What it takes for the hat is tinted blue.');
    expect(label).toContain('Anything else taken for it is outlined in yellow.');
  });

  it('a look-alike from learning is said in words and outlined in the picture', () => {
    const lookAlike = { x: 0.1, y: 0.7, w: 0.05, h: 0.05 };
    render(props({ learntHat: hat }, { hatResult: { step: 'hat', outcome: 'look-alike', found: 11, of: 12, lookAlike } }));
    expect(card().textContent).toContain('Hat learnt, but something in the room looks like it (outlined in the picture). Move it out of shot or learn again.');
    expect(host.querySelector('canvas')!.getAttribute('aria-label')).toContain('Something that looks like the hat is outlined in yellow.');
  });
});

describe('what each step came to, in words', () => {
  it('says each outcome plainly, and whether anything changed', () => {
    expect(hatResultText({ step: 'room', ok: true })).toBe('Room learnt. Now put the hat on and press 2.');
    // Too few pictures (none, or a busy page): it says so, not that none came.
    expect(hatResultText({ step: 'room', ok: false }))
      .toBe('Couldn’t see the room well enough: too few pictures came from the camera. Check the camera, then try again.');
    const hatStep = (outcome: 'ok' | 'look-alike' | 'hard' | 'not-seen' | 'no-room', found = 0, of = 0): string =>
      hatResultText({ step: 'hat', outcome, found, of, lookAlike: null });
    expect(hatStep('ok', 12, 12)).toBe('Hat learnt: it stands out well from the room. It found the hat in 12 of 12 pictures.');
    expect(hatStep('look-alike')).toContain('something in the room looks like it');
    expect(hatStep('hard', 3, 12)).toContain('The hat is hard to tell from the room here: it found the hat in only 3 of 12 pictures.');
    expect(hatStep('hard', 3, 12)).toContain('Nothing was changed.');
    expect(hatStep('not-seen')).toContain('Couldn’t see the hat. Check it is in the picture and learn the hat again.');
    expect(hatStep('not-seen')).toContain('Nothing was changed.');
    expect(hatStep('no-room')).toBe('Learn the room first, with the hat off.');
  });
});

/**
 * The hat on Speed moves the speed around the scene's: Slowest and Fastest are set here, in
 * the Cap tab, where the hat is set up (they were only under Sound → Advanced, and only for
 * a Speed counter, so with the hat alone they could not be changed at all).
 */
describe('Slowest and Fastest, in the Cap tab', () => {
  const input = (name: string): HTMLInputElement | undefined =>
    [...host.querySelectorAll('label')].find((l) => l.textContent?.startsWith(name))?.querySelector('input') ?? undefined;
  /** Type into a number box as a person does: React hears the input event. */
  const type = (el: HTMLInputElement, value: string): void => {
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('are shown when a direction of the cap is on Speed, with what the middle and the ends do', () => {
    render(props({ xRole: 'tempo', yRole: 'volume' }));
    expect(input('Slowest')?.value).toBe('60');
    expect(input('Fastest')?.value).toBe('240');
    expect(host.textContent).toContain('In the middle of your range, the speed is the scene’s');
    expect(host.textContent).toContain('the same setting as Sound → Advanced');
    render(props({ xRole: 'volume', yRole: 'tempo' }));
    expect(input('Fastest')).toBeDefined();
  });

  it('are not shown when no direction is on Speed', () => {
    render(props({ xRole: 'volume', yRole: 'off' }));
    expect(input('Slowest')).toBeUndefined();
    expect(input('Fastest')).toBeUndefined();
  });

  it('change the speed’s range: typed as it is typed, held to 20–400 when the box is left', () => {
    const p = props({ xRole: 'tempo', yRole: 'off' });
    render(p);
    const fastest = input('Fastest');
    if (!fastest) throw new Error('no Fastest');
    type(fastest, '200');
    expect(p.onRange).toHaveBeenLastCalledWith('tempo', { min: 60, max: 200 });
    render({ ...p, ranges: { ...p.ranges, tempo: { min: 60, max: 900 } } });
    act(() => { input('Fastest')?.focus(); input('Fastest')?.blur(); });
    expect(p.onRange).toHaveBeenLastCalledWith('tempo', { min: 60, max: 400 });
  });
});
