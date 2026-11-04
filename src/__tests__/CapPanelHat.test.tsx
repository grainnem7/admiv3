import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { CapPanel, capHudText, hatJobsLine, hatResultText, type CapPanelProps } from '../ui/screens/boardSequencer/play/CapPanel';
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
  paused: null, hatLearning: null, hatResult: null, roomLearnt: false, seen10s: null, ...over,
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
    expect(card().textContent).toContain('Not learnt yet: it follows a red colour, not the hat itself.');
    render(props({ learntHat: hat }));
    expect(host.textContent).toContain('Looking for the learnt hat.');
    expect(host.textContent).not.toContain('Looking for the cap’s colour.');
    // The time is written in the browser's own locale ("28 Oct, 14:05" or "Oct 28, 02:05 PM"): expect the same words from the same moment.
    const learntWhen = new Date(2026, 9, 28, 14, 5).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    expect(card().textContent).toContain(`A learnt hat is in use (learnt ${learntWhen}).`);
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
    expect(p.announce).toHaveBeenCalledWith('The learnt hat is forgotten. It follows a red colour again.');
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
    // B7: the hat was still on while learning the room; the room is not kept.
    expect(hatResultText({ step: 'room', ok: false, hatOn: true })).toBe('Is the hat still on? Take it off and learn the room again.');
  });
});

/**
 * B7, B8, A13: until the hat is learnt the panel never claims the cap is found; Learn the hat,
 * the moves, the picture and the switch are at the top, and the rest is folded.
 */
describe('the Cap panel, in order and folded', () => {
  const status = (): HTMLElement => host.querySelector('[role="status"]')!;
  const at = (el: Element | null | undefined): number => {
    if (!el) throw new Error('not there');
    return [...host.querySelectorAll('*')].indexOf(el);
  };
  const select = (name: string): HTMLSelectElement | undefined =>
    [...host.querySelectorAll('label')].find((l) => l.textContent?.startsWith(name))?.querySelector('select') ?? undefined;
  const more = (): HTMLButtonElement => button('More hat settings') ?? [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('More hat settings'))!;

  it('not learnt, a red thing seen: asks whether it is the hat, never "The cap is found" in green', () => {
    render(props());
    expect(status().textContent).toBe('A red thing is found: is it the hat? Learn the hat to be sure.');
    expect(status().style.color).not.toBe('var(--bs-ok)');
    expect(host.textContent).not.toContain('The cap is found.');
    expect(host.querySelector('canvas')!.getAttribute('aria-label')).not.toContain('The cap is found.');
    render(props({ learntHat: hat }));
    expect(status().textContent).toBe('The cap is found.');
    expect(status().style.color).toBe('var(--bs-ok)');
  });

  it('top to bottom: the switch, Learn the hat, the moves, the camera picture, then More hat settings', () => {
    render(props());
    const sw = [...host.querySelectorAll('[role="switch"]')].find((x) => x.textContent?.startsWith('Control with the red cap'));
    expect(at(sw)).toBeLessThan(at(card()));
    expect(at(card())).toBeLessThan(at(select('Side to side')));
    expect(at(select('Side to side'))).toBeLessThan(at(select('Up and down')));
    expect(at(select('Up and down'))).toBeLessThan(at(host.querySelector('canvas')));
    expect(at(host.querySelector('canvas'))).toBeLessThan(at(more()));
  });

  it('the rest is under More hat settings, closed until opened, and still all there', () => {
    render(props());
    expect(more().getAttribute('aria-expanded')).toBe('false');
    const hidden = (text: string): boolean => {
      const el = [...host.querySelectorAll('span, button, label')].find((e) => e.textContent === text);
      if (!el) throw new Error(`no ${text}`);
      return el.closest('[hidden]') !== null;
    };
    for (const t of ['Your range', 'Keeping the two directions apart', 'While counters are being moved', 'How it responds', 'Test with the mouse']) {
      expect(hidden(t)).toBe(true);
    }
    act(() => more().click());
    expect(more().getAttribute('aria-expanded')).toBe('true');
    for (const t of ['Your range', 'Keeping the two directions apart', 'While counters are being moved', 'How it responds', 'Test with the mouse']) {
      expect(hidden(t)).toBe(false);
    }
  });

  it('the moves: side to side and up and down each choose their job', () => {
    const p = props();
    render(p);
    expect(select('Side to side')?.value).toBe('tempo');
    expect(select('Up and down')?.value).toBe('volume');
    const el = select('Up and down')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(el, 'tone');
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(p.onChange).toHaveBeenCalledWith({ yRole: 'tone' });
  });
});

describe('the hat under the board (B7)', () => {
  const v = (over: Partial<CapView> = {}): CapView => view(over);
  it('says "found" only for a learnt hat; a red thing followed otherwise', () => {
    expect(capHudText(v(), false, false)).toBe('a red thing followed · not learnt');
    expect(capHudText(v(), true, false)).toBe('cap found');
    expect(capHudText(v({ source: 'face' }), false, false)).toBe('following the face');
    expect(capHudText(v({ seen: false }), false, false)).toBe('cap not in sight (holding)');
    expect(capHudText(v({ paused: 'hands' }), false, true)).toBe('paused: hands on the board · locked');
    expect(capHudText(v(), true, true)).toBe('cap found · locked');
    // The mouse test is the cap on purpose.
    expect(capHudText(v({ camera: 'mouse' }), false, false)).toBe('cap found');
  });
});

describe('Lock, at the top (a show-time control)', () => {
  it('sits with the moves, outside More hat settings; Test with the mouse stays folded', () => {
    render(props());
    const lock = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Lock where things are now'))!;
    expect(lock.closest('[hidden]')).toBeNull();
    const mouse = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Test with the mouse')!;
    expect(mouse.closest('[hidden]')).not.toBeNull();
    const all = [...host.querySelectorAll('*')];
    const more = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('More hat settings'))!;
    expect(all.indexOf(lock)).toBeLessThan(all.indexOf(more));
  });
});

describe('the hat in the Ready check (B8)', () => {
  it('says which job each direction does', () => {
    expect(hatJobsLine('tempo', 'volume')).toBe('Hat: side to side Speed · up and down Volume');
    expect(hatJobsLine('tempo', 'tone')).toBe('Hat: side to side Speed · up and down Brightness');
    expect(hatJobsLine('off', 'volume')).toBe('Hat: side to side Nothing · up and down Volume');
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

describe('how well the hat is seen, on the Cap tab', () => {
  it('says the share, the times out of sight and the pictures a second, once there is a second of pictures', () => {
    render(props({ learntHat: hat }, { seen10s: { cap: 0.96, face: 0.03, lost: 1, fps: 28.4, seconds: 10 } }));
    expect(host.textContent).toContain('Hat seen 96% of the last 10 s · out of sight once · 28 pictures a second');
    render(props({ learntHat: hat }, { seen10s: null }));
    expect(host.textContent).not.toContain('Hat seen');
  });
});

describe('learning the room, and the range one way at a time (owner, 4 Nov 2026)', () => {
  it('while the room is learnt, nothing is followed and the panel says so', () => {
    // The dot on the player's head with the hat off was the old colour rule's guess (hair, skin): not the hat.
    render(props({}, { hatLearning: { step: 'room', phase: 'watching', seconds: 3, progress: 0.2 } }));
    expect(host.textContent).toContain('Nothing is followed while the room is learnt.');
    render(props({}, { hatLearning: null }));
    expect(host.textContent).not.toContain('Nothing is followed while the room is learnt.');
  });

  it('side to side and up and down are learnt separately, 10 s each; one learnt does not undo the other', () => {
    const p = props();
    render(p);
    expect(host.textContent).not.toContain('Learn my range');
    act(() => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Learn side to side')!.click());
    expect(p.learnReach).toHaveBeenLastCalledWith(10, 'x');
    act(() => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Learn up and down')!.click());
    expect(p.learnReach).toHaveBeenLastCalledWith(10, 'y');
  });

  it('says which of the two is learnt', () => {
    render(props({ reachX: { min: 0.2, max: 0.8 }, reachY: null }));
    expect(host.textContent).toContain('Side to side learnt. Up and down not learnt: the whole picture.');
    render(props({ reachX: { min: 0.2, max: 0.8 }, reachY: { min: 0.3, max: 0.7 } }));
    expect(host.textContent).toContain('Side to side and up and down learnt (the dashed box).');
  });
});

describe('following the way the head points (owner, 4 Nov 2026)', () => {
  const radio = (name: string): HTMLElement | undefined => [...host.querySelectorAll<HTMLElement>('[role="radio"]')].find((b) => b.textContent === name);

  it('the choice is on the Cap tab, with the hat as the default', () => {
    const p = props();
    render(p);
    expect(host.textContent).toContain('What it follows');
    expect(radio('The hat')?.getAttribute('aria-checked')).toBe('true');
    act(() => radio('The way the head points')!.click());
    expect(p.onChange).toHaveBeenCalledWith({ follow: 'head' });
  });

  it('says what it is doing in words: the head, a bow, or holding', () => {
    render(props({ follow: 'head' }, { seen: true, source: 'head' }));
    expect(host.textContent).toContain('Following the way the head points.');
    render(props({ follow: 'head' }, { seen: true, source: 'bow' }));
    expect(host.textContent).toContain('Head bowed: up and down is at the bottom until the face is seen again.');
    render(props({ follow: 'head' }, { seen: false, source: 'none' }));
    expect(host.textContent).toContain('The face is not in sight. The controls hold where they are.');
  });

  it('under the board, in a few words', () => {
    expect(capHudText({ camera: 'running', paused: null, seen: true, source: 'head' }, true, false)).toBe('following the head');
    expect(capHudText({ camera: 'running', paused: null, seen: true, source: 'bow' }, true, false)).toBe('head bowed (at the bottom)');
  });

  it('the range learnt is the head\'s own when following the head', () => {
    render(props({ follow: 'head', reachX: { min: 0.1, max: 0.9 }, headReachX: null, headReachY: null }));
    expect(host.textContent).toContain('Not learnt: the whole picture is the range each way.');
    render(props({ follow: 'head', headReachX: { min: 0.3, max: 0.7 }, headReachY: null }));
    expect(host.textContent).toContain('Side to side learnt. Up and down not learnt: the whole picture.');
  });

  it('how well it is seen, said for the head', () => {
    render(props({ follow: 'head' }, { seen10s: { cap: 0.97, face: 0, lost: 0, fps: 25, seconds: 10 } }));
    expect(host.textContent).toContain('Face seen 97% of the last 10 s · never out of sight · 25 pictures a second');
  });
});
