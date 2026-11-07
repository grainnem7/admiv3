// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The Simple iPad page, for playing live only, touched in a simulated browser: what the
 * melody plays and the Counters (the colours), nothing else (owner, 7 Nov 2026: "the only
 * buttons we will use are the instruments and the colours"); and every touch guard of the
 * full page still there.
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
  colours: [
    { id: 'c1', number: 1, name: 'Red', swatch: '#ff0000', role: 'melody', words: 'Melody · Trumpet', picture: '🎺' },
    { id: 'c4', number: 4, name: 'Green', swatch: '#00ff00', role: 'drums', words: 'Drums', picture: '🥁' },
  ],
  silentColours: [],
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
  it('only the instruments and the colours (owner, 7 Nov 2026): no Drums, no Calm / Busy, no loops, no Keep', () => {
    expect(labels()).toEqual([
      'Piano', 'Flute', 'Trumpet', 'Sax',
      'Red, Melody · Trumpet: Playing', 'Green, Drums: Playing',
    ]);
    expect(el.querySelectorAll('[role="slider"]')).toHaveLength(0);
    expect(el.querySelectorAll('[role="tab"]')).toHaveLength(0);
    for (const gone of ['Calm', 'Busy', 'Keep', 'Nothing kept', 'New idea', 'New sound', 'Mute', 'End piece', 'Stop the loops', 'Capture', 'Next scene', 'Speed', 'Extra notes', 'Bed', 'Pulse', 'Chords', 'Bass']) {
      expect(el.textContent).not.toContain(gone);
    }
    expect(labels()).not.toContain('Drums: Playing');
    expect(el.querySelector('[role="status"]')?.textContent).toBe('Connected · playing');
  });

  it('a laptop still asking for the Drums and Calm / Busy rows (saved before) shows neither', async () => {
    await act(async () => { onMsg?.(stateWith({ rows: ['drums', 'feel', 'melody', 'counters'] })); });
    expect(labels()).toEqual([
      'Piano', 'Flute', 'Trumpet', 'Sax',
      'Red, Melody · Trumpet: Playing', 'Green, Drums: Playing',
    ]);
  });

  it('a laptop that does not say "simple" gets the full page, as before', async () => {
    const { layout: _l, ...full } = SIMPLE;
    await act(async () => { onMsg?.({ type: 'state', state: full }); });
    expect(el.querySelectorAll('[role="slider"]').length).toBeGreaterThan(0);
    expect(el.querySelector('[data-simple-page]')).toBeNull();
  });
});

describe('the Simple page: each button sends its message', () => {
  it('a colour’s pad silences that colour (the state wanted), and the melody sounds work as before', async () => {
    await press(named('Red'));
    expect(sent).toEqual([{ type: 'colourSound', id: 'c1', silent: true }]);
    expect(named('Red').getAttribute('data-flash')).toBe('true');
    await act(async () => { onMsg?.(stateWith({ silentColours: ['c1'] })); });
    expect(named('Red').getAttribute('aria-label')).toBe('Red, Melody · Trumpet: Silent');
    expect(named('Red').getAttribute('aria-pressed')).toBe('false');
    now += 1000;
    await press(named('Red'));
    expect(sent).toContainEqual({ type: 'colourSound', id: 'c1', silent: false });
    await press(named('Flute'));
    expect(sent).toContainEqual({ type: 'melodySound', sound: 'flute' });
    now += 1000;
    await press(named('Trumpet'));
    expect(sentOf('melodySound')).toHaveLength(1);
  });

  it('a second touch at once is a bounce; stopped, the colours still work (no Press Play first)', async () => {
    await press(named('Red'));
    now += 300;
    await press(named('Red'));
    expect(sentOf('colourSound')).toHaveLength(1);
    await act(async () => { onMsg?.(stateWith({ playing: false })); });
    now += 1000;
    await press(named('Green'));
    expect(sent).toContainEqual({ type: 'colourSound', id: 'c4', silent: true });
    expect(el.textContent).not.toContain('Press Play on the laptop first');
  });

  it('the melody’s sound buttons are the picture alone, no words (owner, 5 Nov); the name is their spoken label', () => {
    for (const [name, pic] of [['Piano', '🎹'], ['Flute', '🪈'], ['Trumpet', '🎺'], ['Sax', '🎷']] as const) {
      const b = named(name);
      expect(b.querySelector('[data-picture]')?.textContent).toBe(pic);
      expect(b.textContent?.replace(/[^A-Za-z]/g, '')).toBe('');
    }
  });

  it('a pad is filled with its colour, with the instrument’s picture and the colour’s name, no instrument words (owner, 5 Nov); a drum colour while Drums are off says so', async () => {
    const green = named('Green');
    expect(green.style.background).toBe('rgb(0, 255, 0)');
    expect(green.style.color).toBe('rgb(17, 17, 17)'); // dark ink on a light colour
    expect(green.querySelector('[data-picture]')?.textContent).toBe('🥁');
    expect(green.textContent).toContain('Green');
    expect(green.textContent).not.toContain('4');
    expect(green.textContent).not.toMatch(/Drums(?! are off)/);
    expect(green.textContent).toContain('Playing');
    const red = named('Red');
    expect(red.style.color).toBe('rgb(255, 255, 255)'); // light ink on a dark colour
    expect(red.textContent).not.toContain('Trumpet');
    expect(red.querySelector('[data-picture]')?.textContent).toBe('🎺');
    await act(async () => { onMsg?.(stateWith({ drumsSilent: true })); });
    expect(named('Green').textContent).toContain('Drums are off');
    expect(named('Green').textContent).not.toContain('Silent');
    await press(named('Green'));
    expect(sent).toContainEqual({ type: 'colourSound', id: 'c4', silent: false });
  });
});

describe('the Simple page keeps every touch guard', () => {
  it('a resting palm presses nothing', async () => {
    for (const b of [named('Flute'), named('Red')]) await press(b, 400);
    expect(sent).toEqual([]);
  });

  it('acting on lift: nothing on landing, the button acts when the finger lifts on it', async () => {
    await act(async () => { onMsg?.(stateWith({ touch: { ...DEFAULT_REMOTE_TOUCH, actOn: 'lift' } })); });
    const red = named('Red');
    await press(red);
    expect(sent).toEqual([]);
    await act(async () => { pointer('pointerup', red); });
    expect(sent).toEqual([{ type: 'colourSound', id: 'c1', silent: true }]);
  });

  it('a stalled link greys the page and takes no touch; waiting for Carry on too', async () => {
    linkReaching = false;
    await act(async () => { onMsg?.(stateWith()); });
    expect(el.querySelector('[role="status"]')?.textContent).toBe('Not reaching the laptop');
    for (const b of [named('Flute'), named('Red')]) await press(b);
    expect(sent).toEqual([]);
    expect(named('Red').getAttribute('aria-disabled')).toBe('true');
    linkReaching = true;
    await act(async () => { onMsg?.(stateWith({ playing: false, carryOnWaiting: true })); });
    now += 1000;
    for (const b of [named('Flute'), named('Red')]) await press(b);
    expect(sent).toEqual([]);
  });

  it('works from a keyboard or a switch', async () => {
    await act(async () => { named('Red').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(sent).toEqual([{ type: 'colourSound', id: 'c1', silent: true }]);
  });
});

describe('the Simple page shows the rows the laptop chose', () => {
  it('only the Counters: bigger words', async () => {
    await act(async () => { onMsg?.(stateWith({ rows: ['counters'] })); });
    expect(labels()).toEqual(['Red, Melody · Trumpet: Playing', 'Green, Drums: Playing']);
    const name = [...named('Red').querySelectorAll('span')].find((x) => x.textContent === 'Red') as HTMLElement;
    expect(parseFloat(name.style.fontSize)).toBeGreaterThan(22);
  });

  it('only the instruments', async () => {
    await act(async () => { onMsg?.(stateWith({ rows: ['melody'] })); });
    expect(labels()).toEqual(['Piano', 'Flute', 'Trumpet', 'Sax']);
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
