// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The Simple iPad page, for playing live only (spec 2026-11-04, "Live only: Drums,
 * Calm/Busy, Melody, Board"), touched in a simulated browser: Drums, Calm / Busy, what the
 * melody plays and the Board; nothing else on the page; and every touch guard of the full
 * page still there.
 */

const sent: unknown[] = [];
let onMsg: ((msg: unknown) => void) | null = null;
let linkReaching = true;
vi.mock('../remote/useRemoteLink', () => ({
  useRemoteLink: (_role: string, _code: string, _enabled: boolean, onMessage: (m: unknown) => void) => {
    onMsg = onMessage;
    return { status: 'open', others: 1, reaching: linkReaching, send: (m: unknown) => sent.push(m) };
  },
}));

import IPadRemoteScreen from '../ui/screens/IPadRemoteScreen';
import { DEFAULT_REMOTE_TOUCH } from '../remote/protocol';

const SIMPLE = {
  values: { tempo: 0.5, dynamics: 0.5, fill: 0, evolve: 0 },
  labels: { tempo: '100 BPM', dynamics: '50%', fill: 'Off', evolve: 'Off' },
  kept: false, muted: false, playing: true,
  layout: 'simple',
  feel: 'normal',
  drumsSilent: false,
  melody: { sound: 'trumpet' },
  loops: [{ name: 'Bed', state: 'playing' }, { name: 'Pulse', state: 'stopped' }],
  scenes: [{ name: 'Arrival', active: true }],
  // A full layout's settings underneath: the Simple page ignores them.
  shown: { strips: ['tempo', 'dynamics', 'fill', 'evolve'], pads: ['newIdea', 'newSound', 'keep', 'mute'], loopsPage: true },
  touch: { ...DEFAULT_REMOTE_TOUCH, playExtras: ['endPiece', 'stopAll', 'capture', 'nextScene'] },
};
const stateWith = (over: Record<string, unknown> = {}) => ({ type: 'state', state: { ...SIMPLE, ...over } });

function pointer(type: string, target: Element, width = 40): void {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }) as MouseEvent & Record<string, unknown>;
  Object.defineProperties(ev, {
    pointerId: { value: 1 }, pointerType: { value: 'touch' }, width: { value: width }, height: { value: width }, isPrimary: { value: true },
  });
  target.dispatchEvent(ev);
}

let now = 10_000;
let root: Root;
let el: HTMLDivElement;
beforeEach(async () => {
  sent.length = 0;
  linkReaching = true;
  now = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  el = document.createElement('div');
  document.body.appendChild(el);
  Element.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
  root = createRoot(el);
  await act(async () => { root.render(<IPadRemoteScreen code="4821" />); });
  await act(async () => { onMsg?.(stateWith()); });
  sent.splice(0);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  el.remove();
  vi.restoreAllMocks();
});

const buttons = (): HTMLButtonElement[] => [...el.querySelectorAll('button')];
const labels = (): string[] => buttons().map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '');
const named = (start: string): HTMLButtonElement => {
  const b = buttons().find((x) => (x.getAttribute('aria-label') ?? x.textContent ?? '').startsWith(start));
  if (!b) throw new Error(`no button "${start}" in: ${labels().join(' | ')}`);
  return b;
};
const press = async (b: Element, width = 40): Promise<void> => { await act(async () => { pointer('pointerdown', b, width); }); };
const sentOf = (type: string) => sent.filter((m) => (m as { type: string }).type === type);

describe('the Simple page: what is on it', () => {
  it('Drums, Calm / Busy, the melody’s sounds and the Board; nothing else (no loops, no Keep)', () => {
    expect(labels()).toEqual([
      'Drums: Playing',
      'Calm', 'Busy',
      'Piano', 'Flute', 'Trumpet', 'Sax',
      'Board: Playing',
    ]);
    expect(el.querySelectorAll('[role="slider"]')).toHaveLength(0);
    expect(el.querySelectorAll('[role="tab"]')).toHaveLength(0);
    for (const gone of ['Keep', 'Nothing kept', 'New idea', 'New sound', 'Mute', 'End piece', 'Stop the loops', 'Capture', 'Next scene', 'Speed', 'Extra notes', 'Bed', 'Pulse', 'Chords', 'Bass']) {
      expect(el.textContent).not.toContain(gone);
    }
    expect(el.querySelector('[role="status"]')?.textContent).toBe('Connected · playing');
  });

  it('Drums playing is lit with a glow and ● Playing; silent is dark with ○ Silent', async () => {
    expect(named('Drums').getAttribute('data-lit')).toBe('true');
    expect(named('Drums').style.background).toBe('var(--bs-lit)');
    expect(named('Drums').style.boxShadow).toContain('var(--bs-lit-glow)');
    expect(named('Drums').querySelector('[data-dot]')?.getAttribute('data-dot')).toBe('●');
    expect(named('Drums').textContent).toContain('🥁');
    await act(async () => { onMsg?.(stateWith({ drumsSilent: true })); });
    expect(named('Drums').getAttribute('aria-label')).toBe('Drums: Silent');
    expect(named('Drums').getAttribute('data-lit')).toBe('false');
    expect(named('Drums').style.background).toBe('var(--bs-bg)');
    expect(named('Drums').style.boxShadow).toBe('none');
    expect(named('Drums').querySelector('[data-dot]')?.getAttribute('data-dot')).toBe('○');
  });

  it('Calm / Busy: neither lit at Normal; the one chosen is lit', async () => {
    expect(named('Calm').getAttribute('aria-pressed')).toBe('false');
    expect(named('Busy').getAttribute('aria-pressed')).toBe('false');
    await act(async () => { onMsg?.(stateWith({ feel: 'busy' })); });
    expect(named('Busy').getAttribute('data-lit')).toBe('true');
    expect(named('Busy').textContent).toContain('More notes');
    expect(named('Calm').getAttribute('data-lit')).toBe('false');
  });

  it('a laptop that does not say "simple" gets the full page, as before', async () => {
    const { layout: _l, ...full } = SIMPLE;
    await act(async () => { onMsg?.({ type: 'state', state: full }); });
    expect(el.querySelectorAll('[role="slider"]').length).toBeGreaterThan(0);
    expect(labels()).not.toContain('Drums: Playing');
  });
});

describe('the Simple page: each button sends its message', () => {
  it('Drums: silent, and back; playing or stopped; a second touch at once is a bounce', async () => {
    await press(named('Drums'));
    expect(sent).toEqual([{ type: 'drumsSound', silent: true }]);
    expect(named('Drums').getAttribute('data-flash')).toBe('true');
    now += 300;
    await press(named('Drums'));
    expect(sentOf('drumsSound')).toHaveLength(1);
    await act(async () => { onMsg?.(stateWith({ drumsSilent: true, playing: false })); });
    now += 1000;
    await press(named('Drums'));
    expect(sent).toContainEqual({ type: 'drumsSound', silent: false });
    expect(el.textContent).not.toContain('Press Play on the laptop first');
  });

  it('Calm and Busy: the one wanted; the lit one again goes back to normal; playing or stopped', async () => {
    await press(named('Busy'));
    expect(sent).toEqual([{ type: 'feel', feel: 'busy' }]);
    await act(async () => { onMsg?.(stateWith({ feel: 'busy', playing: false })); });
    now += 1000;
    await press(named('Busy'));
    expect(sent).toContainEqual({ type: 'feel', feel: 'normal' });
    now += 1000;
    await press(named('Calm'));
    expect(sent).toContainEqual({ type: 'feel', feel: 'calm' });
  });

  it('the Board button and the melody sounds, as before', async () => {
    await press(named('Board'));
    expect(sent).toEqual([{ type: 'boardSound', silent: true }]);
    await press(named('Flute'));
    expect(sent).toContainEqual({ type: 'melodySound', sound: 'flute' });
    now += 1000;
    await press(named('Trumpet'));
    expect(sentOf('melodySound')).toHaveLength(1);
  });
});

describe('the Simple page keeps every touch guard', () => {
  it('a resting palm presses nothing', async () => {
    for (const b of [named('Drums'), named('Calm'), named('Flute'), named('Board')]) await press(b, 400);
    expect(sent).toEqual([]);
  });

  it('acting on lift: nothing on landing, the button acts when the finger lifts on it', async () => {
    await act(async () => { onMsg?.(stateWith({ touch: { ...DEFAULT_REMOTE_TOUCH, actOn: 'lift' } })); });
    const drums = named('Drums');
    await press(drums);
    expect(sent).toEqual([]);
    await act(async () => { pointer('pointerup', drums); });
    expect(sent).toEqual([{ type: 'drumsSound', silent: true }]);
  });

  it('a stalled link greys the page and takes no touch; waiting for Carry on too', async () => {
    linkReaching = false;
    await act(async () => { onMsg?.(stateWith()); });
    expect(el.querySelector('[role="status"]')?.textContent).toBe('Not reaching the laptop');
    for (const b of [named('Drums'), named('Busy'), named('Board')]) await press(b);
    expect(sent).toEqual([]);
    expect(named('Drums').getAttribute('aria-disabled')).toBe('true');
    linkReaching = true;
    await act(async () => { onMsg?.(stateWith({ playing: false, carryOnWaiting: true })); });
    now += 1000;
    for (const b of [named('Drums'), named('Busy'), named('Board')]) await press(b);
    expect(sent).toEqual([]);
  });

  it('works from a keyboard or a switch', async () => {
    await act(async () => { named('Drums').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(sent).toEqual([{ type: 'drumsSound', silent: true }]);
  });
});

describe('the Simple page shows the rows the laptop chose', () => {
  it('only Drums and the Board: two big buttons, bigger words', async () => {
    await act(async () => { onMsg?.(stateWith({ rows: ['drums', 'board'] })); });
    expect(labels()).toEqual(['Drums: Playing', 'Board: Playing']);
    const name = [...named('Drums').querySelectorAll('span')].find((x) => x.textContent === 'Drums') as HTMLElement;
    expect(parseFloat(name.style.fontSize)).toBeGreaterThan(36);
  });

  it('only Calm / Busy', async () => {
    await act(async () => { onMsg?.(stateWith({ rows: ['feel'] })); });
    expect(labels()).toEqual(['Calm', 'Busy']);
  });

  it('nothing chosen: the page says where to choose', async () => {
    await act(async () => { onMsg?.(stateWith({ rows: [] })); });
    expect(buttons()).toHaveLength(0);
    expect(el.textContent).toContain('Choose what it shows on the laptop');
  });

  it('no melody colour: no sound row, whatever is chosen', async () => {
    const { melody: _m, ...noMelody } = SIMPLE;
    await act(async () => { onMsg?.({ type: 'state', state: noMelody }); });
    expect(el.querySelector('[role="radiogroup"]')).toBeNull();
  });
});
