// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The second performer's page (owner, 7 Nov 2026): the iPad's page opened on another laptop
 * with `&performer=1`. Everything is on it, whatever Tim's iPad is set to.
 */

const sent: unknown[] = [];
let onMsg: ((msg: unknown) => void) | null = null;
let heartbeat: (() => unknown) | null = null;
vi.mock('../remote/useRemoteLink', () => ({
  useRemoteLink: (_role: string, _code: string, _enabled: boolean, onMessage: (m: unknown) => void, beat?: () => unknown) => {
    onMsg = onMessage;
    heartbeat = beat ?? null;
    return { status: 'open', others: 1, reaching: true, send: (m: unknown) => sent.push(m) };
  },
}));

import IPadRemoteScreen from '../ui/screens/IPadRemoteScreen';
import { DEFAULT_REMOTE_TOUCH } from '../remote/protocol';

// Tim's iPad: the simple layout, one strip shown, Speed locked, a narrow reach, acting on lift.
const TIM = {
  values: { tempo: 0.5, dynamics: 0.5, fill: 0, evolve: 0 },
  labels: { tempo: '90 BPM', dynamics: '50%', fill: 'Off', evolve: 'Off' },
  kept: false, muted: false, playing: true,
  layout: 'simple',
  shown: { strips: ['tempo'], pads: ['mute'], loopsPage: false },
  locked: ['tempo'],
  reach: { tempo: { low: 0.2, high: 0.6 }, dynamics: { low: 0.2, high: 0.6 }, fill: { low: 0, high: 1 }, evolve: { low: 0, high: 1 } },
  touch: { ...DEFAULT_REMOTE_TOUCH, actOn: 'lift' },
  rows: ['counters'],
  melody: { sound: 'trumpet' },
  colours: [{ id: 'c1', number: 1, name: 'Red', swatch: '#ff0000', role: 'melody', words: 'Melody · Trumpet', picture: '🎺' }],
  silentColours: [],
  loops: [{ name: 'Bed', state: 'playing' }],
  scenes: [{ name: 'Arrival', active: true }, { name: 'Storm', active: false }],
  clock: { text: '4:12', phase: 'running' },
  piece: { now: 'Arrival', next: 'Storm', nextIn: '0:20' },
};

function pointer(type: string, target: Element): void {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }) as MouseEvent & Record<string, unknown>;
  Object.defineProperties(ev, { pointerId: { value: 1 }, pointerType: { value: 'mouse' }, width: { value: 1 }, height: { value: 1 }, isPrimary: { value: true } });
  target.dispatchEvent(ev);
}

let root: Root;
let el: HTMLDivElement;
let now = 10_000;
beforeEach(async () => {
  sent.length = 0;
  now = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  el = document.createElement('div');
  document.body.appendChild(el);
  Element.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
  root = createRoot(el);
  await act(async () => { root.render(<IPadRemoteScreen code="4821" performer />); });
  await act(async () => { onMsg?.({ type: 'state', state: TIM }); });
  sent.splice(0);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  el.remove();
  vi.restoreAllMocks();
});

const tabs = (): string[] => [...el.querySelectorAll('[role="tab"]')].map((t) => t.textContent ?? '');
const tab = (name: string): Element => {
  const t = [...el.querySelectorAll('[role="tab"]')].find((x) => x.textContent === name);
  if (!t) throw new Error(`no tab ${name} in ${tabs().join(' | ')}`);
  return t;
};
/** A button or strip by its spoken label, or its words after the picture. */
const button = (start: string): HTMLElement => {
  const b = [...el.querySelectorAll<HTMLElement>('button, [role="slider"]')].find((x) => (x.getAttribute('aria-label') ?? x.textContent ?? '').replace(/^[^A-Za-z]+/, '').startsWith(start));
  if (!b) throw new Error(`no button ${start} in ${[...el.querySelectorAll('button, [role="slider"]')].map((x) => x.getAttribute('aria-label') ?? x.textContent).join(' | ')}`);
  return b;
};

describe('the second performer’s page', () => {
  it('says whose it is, and has every page: Play, Instruments & colours, Loops, Loops & scenes', () => {
    expect(el.textContent).toContain('Second performer · code 4821');
    expect(tabs()).toEqual(['Play', 'Instruments & colours', 'Loops', 'Loops & scenes']);
    expect(el.textContent).toContain('Now: Arrival');
    expect(el.textContent).toContain('Next: Storm in 0:20');
    expect(el.textContent).toContain('4:12');
  });

  it('all four strips and the pads, whatever Tim’s iPad shows; Speed stays locked; Next scene and End piece on Play', () => {
    expect(el.querySelectorAll('[role="slider"]')).toHaveLength(4);
    expect(button('Speed').getAttribute('aria-label')).toBe('Speed, locked');
    for (const p of ['New idea', 'New sound', 'Keep', 'Mute', 'Next scene', 'End the piece']) expect(() => button(p)).not.toThrow();
  });

  it('a pad acts on touch (Tim’s “on lift” is his), from a mouse too', async () => {
    await act(async () => { pointer('pointerdown', button('New idea')); });
    expect(sent).toContainEqual({ type: 'trigger', name: 'newIdea' });
  });

  it('the instruments and the colours on a page of their own, both rows whatever Tim’s iPad shows', async () => {
    await act(async () => { pointer('pointerdown', tab('Instruments & colours')); });
    expect(el.querySelector('[role="radiogroup"]')).not.toBeNull();
    expect(el.querySelector('[role="group"][aria-label="Counters"]')).not.toBeNull();
    await act(async () => { pointer('pointerdown', button('Flute')); });
    expect(sent).toContainEqual({ type: 'melodySound', sound: 'flute' });
    now += 1000;
    await act(async () => { pointer('pointerdown', button('Red')); });
    expect(sent).toContainEqual({ type: 'colourSound', id: 'c1', silent: true });
  });

  it('▶ Start the piece on Play while the piece is not running, from here too (owner, 7 Nov 2026); gone once it runs', async () => {
    expect(() => button('Start the piece')).toThrow();
    await act(async () => { onMsg?.({ type: 'state', state: { ...TIM, playing: false, clock: { text: '7:00', phase: 'idle' } } }); });
    await act(async () => { pointer('pointerdown', button('Start the piece')); });
    expect(sent).toContainEqual({ type: 'startPiece' });
    // A bounce of the same press sends nothing more.
    now += 200;
    await act(async () => { pointer('pointerdown', button('Start the piece')); });
    expect(sent.filter((m) => (m as { type: string }).type === 'startPiece')).toHaveLength(1);
  });

  it('Hold the hat, and let it go: only with a hat in use; it says which', async () => {
    expect(() => button('Hold the hat')).toThrow();
    await act(async () => { onMsg?.({ type: 'state', state: { ...TIM, hatHeld: false } }); });
    await act(async () => { pointer('pointerdown', button('Hold the hat')); });
    expect(sent).toContainEqual({ type: 'hatHold', on: true });
    await act(async () => { onMsg?.({ type: 'state', state: { ...TIM, hatHeld: true } }); });
    now += 1000;
    await act(async () => { pointer('pointerdown', button('Hat held')); });
    expect(sent).toContainEqual({ type: 'hatHold', on: false });
  });

  it('its heartbeat says it is the second performer, so the laptop can tell it from the iPad', () => {
    expect(heartbeat?.()).toMatchObject({ type: 'hello', ask: null, who: 'performer' });
  });
});
