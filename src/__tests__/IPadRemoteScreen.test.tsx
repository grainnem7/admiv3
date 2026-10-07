// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

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
