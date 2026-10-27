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
import { DEFAULT_REMOTE_TOUCH } from '../remote/protocol';
import { safeShowLayout } from '../profiles/BoardSequencerConfig';

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

/** The page's clock (performance.now), moved by hand so the gaps between touches are exact. */
let now = 10_000;

let root: Root;
let el: HTMLDivElement;
beforeEach(async () => {
  sent.length = 0;
  now = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
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
  vi.restoreAllMocks();
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
    const tab = [...el.querySelectorAll('[role="tab"]')].find((b) => b.textContent === 'Loops & scenes')!;
    await act(async () => { pointer('pointerdown', tab, 10); });
    const loop = [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Bass:'))!;
    expect(loop).toBeTruthy();
    await act(async () => { pointer('pointerdown', loop, 100); });
    expect(sent).toContainEqual({ type: 'loop', index: 0 });
  });
});

const withTouch = (touch: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ ...STATE, state: { ...STATE.state, touch: { ...DEFAULT_REMOTE_TOUCH, ...touch }, ...extra } });
const button = (text: string) => [...el.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(text) || (b.getAttribute('aria-label') ?? '').includes(text))!;
/** One touch on a pad at a moment on the page's clock: landing, then lifting where it landed. */
async function touchAt(t: number, target: () => Element, y = 300): Promise<void> {
  now = t;
  const pad = target(); // the finger lifts from the pad it landed on, whatever it says by then
  await act(async () => { pointer('pointerdown', pad, y); });
  await act(async () => { pointer('pointerup', pad, y); });
}
/** The End piece pad, armed or not (its name changes to "Tap again to end the piece"). */
const endPad = () => [...el.querySelectorAll('button')].find((b) => /end the piece/i.test(b.getAttribute('aria-label') ?? ''))!;
const END = { type: 'trigger', name: 'endPiece' };
const STOP = { type: 'trigger', name: 'stopAll' };
const MUTE = { type: 'trigger', name: 'mute' };

describe('the iPad page, set up for the player', () => {

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
    now = 20_000;
    const end = button('End the piece');
    await act(async () => { pointer('pointerdown', end, 300); });
    expect(sent).not.toContainEqual({ type: 'trigger', name: 'endPiece' });
    now = 20_600;
    await act(async () => { pointer('pointerdown', button('Tap again to end'), 300); });
    expect(sent).toContainEqual({ type: 'trigger', name: 'endPiece' });
  });

  it('scene pads follow the piece, however many scenes there are', async () => {
    const scenes = Array.from({ length: 8 }, (_, i) => ({ name: `S${i + 1}`, active: i === 5 }));
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, scenes } }); });
    const tab = [...el.querySelectorAll('[role="tab"]')].find((b) => b.textContent === 'Loops & scenes')!;
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

describe('two taps, safe from a bounce: End piece, Stop all and Mute', () => {
  it('End piece: a bounce 60, 120 or 250 ms after the first touch never ends the piece', async () => {
    await act(async () => { onMsg?.(withTouch({ playExtras: ['endPiece'] })); });
    let t = 20_000;
    for (const gap of [60, 120, 250]) {
      t += 20_000; // long after the last window, so each try starts afresh
      await touchAt(t, endPad);
      await touchAt(t + gap, () => button('Tap again to end'));
      expect(sent).not.toContainEqual(END);
      // Still armed by the first touch, not cancelled or re-armed by the bounce.
      expect(button('Tap again to end')).toBeTruthy();
    }
  });

  it('End piece: a second tap 600 ms after the first ends the piece; bounces in between change nothing', async () => {
    await act(async () => { onMsg?.(withTouch({ playExtras: ['endPiece'] })); });
    await touchAt(20_000, () => button('End the piece'));
    await touchAt(20_060, () => button('Tap again to end'));
    await touchAt(20_250, () => button('Tap again to end'));
    expect(sent).not.toContainEqual(END);
    await touchAt(20_600, () => button('Tap again to end'));
    expect(sent.filter((m) => JSON.stringify(m) === JSON.stringify(END))).toHaveLength(1);
  });

  it('End piece: after the window lapses, a tap arms again rather than ending', async () => {
    await act(async () => { onMsg?.(withTouch({ playExtras: ['endPiece'], confirmSec: 3 })); });
    await touchAt(20_000, endPad);
    await touchAt(23_100, endPad);
    expect(sent).not.toContainEqual(END);
    await touchAt(23_700, () => button('Tap again to end'));
    expect(sent).toContainEqual(END);
  });

  it('End piece: the same with "act on lift", where a bounce is a quick land-lift-land-lift', async () => {
    await act(async () => { onMsg?.(withTouch({ playExtras: ['endPiece'], actOn: 'lift' })); });
    await touchAt(20_000, () => button('End the piece'));
    await touchAt(20_120, () => button('Tap again to end'));
    expect(sent).not.toContainEqual(END);
    await touchAt(20_700, () => button('Tap again to end'));
    expect(sent).toContainEqual(END);
  });

  it("follows the player's own bounce guard", async () => {
    await act(async () => { onMsg?.(withTouch({ playExtras: ['endPiece'], secondTapMinMs: 1200 })); });
    await touchAt(20_000, () => button('End the piece'));
    await touchAt(20_800, () => button('Tap again to end'));
    expect(sent).not.toContainEqual(END);
    await touchAt(21_300, () => button('Tap again to end'));
    expect(sent).toContainEqual(END);
  });

  it('Stop all: a bounce 120 ms after the first touch never stops the loops; 600 ms does', async () => {
    await act(async () => { onMsg?.(withTouch({ playExtras: ['stopAll'] })); });
    await touchAt(20_000, () => button('Stop all loops'));
    await touchAt(20_120, () => button('Tap again to stop all'));
    expect(sent).not.toContainEqual(STOP);
    await touchAt(20_600, () => button('Tap again to stop all'));
    expect(sent).toContainEqual(STOP);
  });

  it('Mute takes two taps too, and says in words that it is waiting for the second', async () => {
    const mute = () => [...el.querySelectorAll('button')].find((b) => /Mute|Muted|Tap again/.test(b.textContent ?? ''))!;
    await touchAt(20_000, mute);
    expect(sent).not.toContainEqual(MUTE);
    expect(mute().textContent).toContain('Tap again to mute');
    await touchAt(20_120, mute); // a bounce
    expect(sent).not.toContainEqual(MUTE);
    await touchAt(20_600, mute);
    expect(sent).toContainEqual(MUTE);
  });

  it('Mute: turning the sound back on takes two taps as well', async () => {
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, muted: true } }); });
    const mute = () => [...el.querySelectorAll('button')].find((b) => /Muted|Tap again/.test(b.textContent ?? ''))!;
    await touchAt(20_000, mute);
    expect(sent).not.toContainEqual(MUTE);
    expect(mute().textContent).toContain('Tap again to unmute');
    await touchAt(20_600, mute);
    expect(sent).toContainEqual(MUTE);
  });
});

describe('acting on lift: a finger that slides off a pad takes it back', () => {
  it('lifting outside the pad does nothing', async () => {
    await act(async () => { onMsg?.(withTouch({ actOn: 'lift' })); });
    const pad = button('New idea');
    await act(async () => { pointer('pointerdown', pad, 300); });
    await act(async () => { pointer('pointermove', pad, 600); });
    await act(async () => { pointer('pointerup', pad, 600); }); // the pad is 400 tall
    expect(sent).toEqual([]);
  });

  it('sliding off and back on before lifting does nothing', async () => {
    await act(async () => { onMsg?.(withTouch({ actOn: 'lift' })); });
    const pad = button('New idea');
    await act(async () => { pointer('pointerdown', pad, 300); });
    await act(async () => { pointer('pointermove', pad, 600); });
    await act(async () => { pointer('pointermove', pad, 300); });
    await act(async () => { pointer('pointerup', pad, 300); });
    expect(sent).toEqual([]);
  });

  it('a touch the browser cancels does nothing', async () => {
    await act(async () => { onMsg?.(withTouch({ actOn: 'lift' })); });
    const pad = button('New idea');
    await act(async () => { pointer('pointerdown', pad, 300); });
    await act(async () => { pointer('pointercancel', pad, 300); });
    await act(async () => { pointer('pointerup', pad, 300); });
    expect(sent).toEqual([]);
  });

  it('a finger that wobbles but stays on the pad still presses it', async () => {
    await act(async () => { onMsg?.(withTouch({ actOn: 'lift' })); });
    const pad = button('New idea');
    await act(async () => { pointer('pointerdown', pad, 300); });
    await act(async () => { pointer('pointermove', pad, 350); });
    await act(async () => { pointer('pointerup', pad, 380); });
    expect(sent).toContainEqual({ type: 'trigger', name: 'newIdea' });
  });

  it('a slid-off first tap does not arm End piece', async () => {
    await act(async () => { onMsg?.(withTouch({ actOn: 'lift', playExtras: ['endPiece'] })); });
    now = 20_000;
    const end = button('End the piece');
    await act(async () => { pointer('pointerdown', end, 300); });
    await act(async () => { pointer('pointerup', end, 600); });
    expect(button('End the piece')).toBeTruthy();
    expect(button('Tap again to end')).toBeUndefined();
  });
});

describe("the safe show layout on Tim's iPad", () => {
  it('shows only the Extra notes strip, New idea and End piece', async () => {
    const l = safeShowLayout(DEFAULT_REMOTE_TOUCH);
    await act(async () => {
      onMsg?.({
        ...STATE,
        state: {
          ...STATE.state,
          scenes: [{ name: 'Arrival', active: true }, { name: 'Build', active: false }],
          loops: [{ name: 'Bass', state: 'playing' }, { name: 'Bed', state: 'stopped' }],
          shown: { strips: l.remoteStrips, pads: l.remotePads, loopsPage: l.remoteLoopsPage },
          locked: l.remoteLocked,
          touch: l.remoteTouch,
        },
      });
    });
    const strips = [...el.querySelectorAll('[role="slider"]')].map((x) => x.getAttribute('aria-label'));
    expect(strips).toEqual(['Extra notes']);
    const buttons = [...el.querySelectorAll('button')];
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toContain('New idea');
    expect(buttons[1].getAttribute('aria-label')).toBe('End the piece');
    // No page tabs: the loop and scene pages are not there to switch to.
    expect(el.querySelectorAll('[role="tab"]')).toHaveLength(0);
    for (const gone of ['Mute', 'Stop all', 'Next scene', 'Capture', 'Bass', 'Bed', 'Scene ']) {
      expect(el.textContent).not.toContain(gone);
    }
  });
});

describe('a loop pad while the laptop is stopped', () => {
  const PRESS_PLAY = 'Press Play on the laptop first';

  it('on the Loops page: refused, and the iPad says why', async () => {
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, playing: false } }); });
    const tab = [...el.querySelectorAll('[role="tab"]')].find((b) => b.textContent === 'Loops')!;
    await act(async () => { pointer('pointerdown', tab, 10); });
    const loop = [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Bass:'))!;
    await act(async () => { pointer('pointerdown', loop, 100); });
    expect(sent.filter((m) => (m as { type: string }).type === 'loop')).toEqual([]);
    expect(el.textContent).toContain(PRESS_PLAY);
  });

  it('on the Play page and the Loops & scenes page: refused the same way', async () => {
    await act(async () => { onMsg?.(withTouch({ playLoops: [0] }, { playing: false })); });
    const playLoop = [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Bass:'))!;
    await act(async () => { pointer('pointerdown', playLoop, 100); });
    expect(el.textContent).toContain(PRESS_PLAY);
    const tab = [...el.querySelectorAll('[role="tab"]')].find((b) => b.textContent === 'Loops & scenes')!;
    await act(async () => { pointer('pointerdown', tab, 10); });
    now += 1000;
    const loop = [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Bass:'))!;
    await act(async () => { pointer('pointerdown', loop, 100); });
    expect(sent.filter((m) => (m as { type: string }).type === 'loop')).toEqual([]);
  });

  it('once the laptop plays, the same tap starts the loop', async () => {
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, playing: false } }); });
    const tab = [...el.querySelectorAll('[role="tab"]')].find((b) => b.textContent === 'Loops')!;
    await act(async () => { pointer('pointerdown', tab, 10); });
    await act(async () => { onMsg?.(STATE); });
    const loop = [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Bass:'))!;
    await act(async () => { pointer('pointerdown', loop, 100); });
    expect(sent).toContainEqual({ type: 'loop', index: 0 });
    expect(el.textContent).not.toContain(PRESS_PLAY);
  });
});
