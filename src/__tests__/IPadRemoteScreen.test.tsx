// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

// Tell React this is a test environment, so act() waits for every update to render
// (without it a tab switch could still be pending when the test looked for its pads).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The iPad page, touched in a simulated browser: a finger on a strip sends a control, a
 * finger on a pad sends a trigger. Everything else about the page is checked by the
 * protocol tests; this one exists because a handler that threw on every touch (a helper
 * that called itself) passed typecheck and every other test, and was only found on the
 * iPad in the room.
 */

// The link, with a fake socket that records what the page sends.
const sent: unknown[] = [];
let onMsg: ((msg: unknown) => void) | null = null;
vi.mock('../remote/useRemoteLink', () => ({
  useRemoteLink: (_role: string, _code: string, _enabled: boolean, onMessage: (m: unknown) => void) => {
    onMsg = onMessage;
    return { status: 'open', others: 1, send: (m: unknown) => sent.push(m) };
  },
}));

import IPadRemoteScreen from '../ui/screens/IPadRemoteScreen';

const STATE = {
  type: 'state',
  state: {
    values: { tempo: 0.5, dynamics: 0.5, fill: 0, evolve: 0 },
    labels: { tempo: '100 BPM', dynamics: '50%', fill: 'Off', evolve: 'Off' },
    kept: false, muted: false, playing: true,
    loops: [{ name: 'Bass', state: 'stopped' }],
    scenes: [],
  },
};

function pointer(type: string, el: Element, y: number, width = 40): void {
  const box = el.getBoundingClientRect();
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: box.left + 10, clientY: y }) as MouseEvent & Record<string, unknown>;
  Object.defineProperties(ev, {
    pointerId: { value: 1 }, pointerType: { value: 'touch' }, width: { value: width }, height: { value: width }, isPrimary: { value: true },
  });
  el.dispatchEvent(ev);
}

let root: Root;
let el: HTMLDivElement;
beforeEach(async () => {
  sent.length = 0;
  el = document.createElement('div');
  document.body.appendChild(el);
  // jsdom has no pointer capture; the page asks for it on every touch.
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => {});
  Element.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
  root = createRoot(el);
  await act(async () => { root.render(<IPadRemoteScreen code="4821" />); });
  await act(async () => { onMsg?.(STATE); });
});

// Each test's page is taken down after it. A page left mounted kept its timers (the
// touch mark), re-rendered during the next test and took over the fake link's message
// handler, so the next page never received its state — only when the machine was busy.
afterEach(async () => {
  await act(async () => { root.unmount(); });
  el.remove();
});

describe('the iPad page, touched', () => {
  it('a finger on a strip sends the value where it landed', async () => {
    const strip = el.querySelector('[role="slider"][aria-label="Speed"]')!;
    expect(strip).toBeTruthy();
    await act(async () => { pointer('pointerdown', strip, 40); });
    await act(async () => { pointer('pointerup', strip, 40); });
    const controls = sent.filter((m) => (m as { type: string }).type === 'control') as { name: string; value: number }[];
    expect(controls.length).toBeGreaterThan(0);
    expect(controls[0].name).toBe('tempo');
    expect(controls[0].value).toBeGreaterThan(0.8); // near the top of a 400 px strip
  });

  it('a finger on a pad sends its trigger; a palm the width of a hand does not', async () => {
    const pad = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('New idea'))!;
    expect(pad).toBeTruthy();
    await act(async () => { pointer('pointerdown', pad, 300); });
    expect(sent).toContainEqual({ type: 'trigger', name: 'newIdea' });
    sent.length = 0;
    const pad2 = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('New sound'))!;
    await act(async () => { pointer('pointerdown', pad2, 300, 400); });
    expect(sent).toEqual([]);
  });

  it('a loop pad launches its loop', async () => {
    const tab = [...el.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.includes('Loops'))!;
    await act(async () => { pointer('pointerdown', tab, 10); });
    const loop = [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Bass:'))!;
    expect(loop).toBeTruthy();
    await act(async () => { pointer('pointerdown', loop, 100); });
    expect(sent).toContainEqual({ type: 'loop', index: 0 });
  });
});

describe('the iPad page, set up for the player', () => {
  const withTouch = (touch: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    ({ ...STATE, state: { ...STATE.state, touch: { actOn: 'touch', confirmSec: 6, playExtras: [], playLoops: [], showNext: true, ...touch }, ...extra } });
  const button = (text: string) => [...el.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(text) || (b.getAttribute('aria-label') ?? '').includes(text))!;

  it('acting on lift: nothing on landing, the pad acts when the finger lifts on it — not if it slid off', async () => {
    await act(async () => { onMsg?.(withTouch({ actOn: 'lift' })); });
    const pad = button('New idea');
    await act(async () => { pointer('pointerdown', pad, 300); });
    expect(sent).toEqual([]);
    await act(async () => { pointer('pointerup', pad, 300); });
    expect(sent).toContainEqual({ type: 'trigger', name: 'newIdea' });
    sent.length = 0;
    const other = button('New sound');
    await act(async () => { pointer('pointerdown', other, 300); });
    await act(async () => { other.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body })); });
    await act(async () => { pointer('pointerup', other, 300); });
    expect(sent).toEqual([]);
  });

  it('every pad works from a keyboard or a switch', async () => {
    const pad = button('New sound');
    await act(async () => { pad.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(sent).toContainEqual({ type: 'trigger', name: 'newSound' });
  });

  it('Keep only keeps: once kept, another tap sends nothing', async () => {
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, kept: true } }); });
    await act(async () => { pointer('pointerdown', button('Kept'), 300); });
    expect(sent).toEqual([]);
  });

  it('pads the facilitator chose appear on the Play page; End piece takes two taps', async () => {
    await act(async () => { onMsg?.(withTouch({ playExtras: ['endPiece'], playLoops: [0] })); });
    const loop = [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Bass:'))!;
    expect(loop).toBeTruthy();
    await act(async () => { pointer('pointerdown', loop, 300); });
    expect(sent).toContainEqual({ type: 'loop', index: 0 });
    const end = button('End the piece');
    await act(async () => { pointer('pointerdown', end, 300); });
    expect(sent).not.toContainEqual({ type: 'trigger', name: 'endPiece' });
    await act(async () => { pointer('pointerdown', button('Tap again to end'), 300); });
    expect(sent).toContainEqual({ type: 'trigger', name: 'endPiece' });
  });

  it('scene pads follow the piece, however many scenes there are', async () => {
    const scenes = Array.from({ length: 8 }, (_, i) => ({ name: `S${i + 1}`, active: i === 5 }));
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, scenes } }); });
    const tab = [...el.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.includes('Loops'))!;
    await act(async () => { pointer('pointerdown', tab, 10); });
    const labels = [...el.querySelectorAll('button')].map((b) => b.textContent ?? '').filter((t) => t.startsWith('Scene '));
    expect(labels).toEqual(['Scene 5: S5', 'Scene 6: S6', 'Scene 7: S7', 'Scene 8: S8']);
  });

  it('shows what is on, what comes next, and when', async () => {
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, piece: { now: 'Build', next: 'Open', nextIn: '1:12' }, beat: true } }); });
    expect(el.textContent).toContain('Now: Build');
    expect(el.textContent).toContain('Next: Open in 1:12');
  });
});
