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
/** Whether the laptop's words are getting through (a stalled Wi-Fi link: false). */
let linkReaching = true;
let heartbeatOf: (() => unknown) | undefined;
vi.mock('../remote/useRemoteLink', () => ({
  useRemoteLink: (_role: string, _code: string, _enabled: boolean, onMessage: (m: unknown) => void, heartbeat?: () => unknown) => {
    onMsg = onMessage;
    heartbeatOf = heartbeat;
    return { status: 'open', others: 1, reaching: linkReaching, send: (m: unknown) => sent.push(m) };
  },
}));

import IPadRemoteScreen from '../ui/screens/IPadRemoteScreen';
import { DEFAULT_REMOTE_TOUCH } from '../remote/protocol';
import { BUILD_ID, reloadPage } from '../remote/buildId';
import { safeShowLayout } from '../profiles/BoardSequencerConfig';
import { nameStartsWithVisible } from '../ui/screens/boardSequencer/labelInName';

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
  linkReaching = true;
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
  // What the page sent on its own (its hello), apart from what each test does.
  sentOnJoining = sent.splice(0);
});
let sentOnJoining: unknown[] = [];

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
    const loop = [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Bass'))!;
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
const endPad = () => [...el.querySelectorAll('button')].find((b) => /^(end piece|tap again to end)/i.test(b.getAttribute('aria-label') ?? ''))!;
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
    const loop = [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Bass'))!;
    expect(loop).toBeTruthy();
    await act(async () => { pointer('pointerdown', loop, 300); });
    expect(sent).toContainEqual({ type: 'loop', index: 0 });
    now = 20_000;
    const end = button('End piece');
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

describe('two taps, safe from a bounce: End piece, Stop the loops and Mute', () => {
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

  it('End piece: a second tap after the guard of quiet ends the piece; bounces in between change nothing', async () => {
    await act(async () => { onMsg?.(withTouch({ playExtras: ['endPiece'] })); });
    await touchAt(20_000, () => button('End piece'));
    await touchAt(20_060, () => button('Tap again to end'));
    await touchAt(20_250, () => button('Tap again to end'));
    // 600 ms after the first touch, but only 350 after the last bounce: the same press.
    await touchAt(20_600, () => button('Tap again to end'));
    expect(sent).not.toContainEqual(END);
    await touchAt(21_200, () => button('Tap again to end'));
    expect(sent.filter((m) => JSON.stringify(m) === JSON.stringify(END))).toHaveLength(1);
  });

  it('End piece: a press that chatters at 0, 200, 400 and 600 ms never ends the piece', async () => {
    await act(async () => { onMsg?.(withTouch({ playExtras: ['endPiece'] })); });
    for (const t of [20_000, 20_200, 20_400, 20_600]) await touchAt(t, endPad);
    expect(sent).not.toContainEqual(END);
    // Still only armed, by the first touch.
    expect(button('Tap again to end')).toBeTruthy();
  });

  it('End piece: a touch 100 ms after the confirming tap is a bounce: it does not arm End piece again', async () => {
    await act(async () => { onMsg?.(withTouch({ playExtras: ['endPiece'] })); });
    await touchAt(20_000, endPad);
    await touchAt(20_600, endPad);
    expect(sent.filter((m) => JSON.stringify(m) === JSON.stringify(END))).toHaveLength(1);
    await touchAt(20_700, endPad);
    expect(button('Tap again to end')).toBeUndefined();
    expect(button('End piece')).toBeTruthy();
  });

  it('End piece: armed, then the laptop stops: the pad is no longer waiting, and the next piece needs two taps again', async () => {
    await act(async () => { onMsg?.(withTouch({ playExtras: ['endPiece'] })); });
    await touchAt(20_000, endPad);
    expect(button('Tap again to end')).toBeTruthy();
    await act(async () => { onMsg?.(withTouch({ playExtras: ['endPiece'] }, { playing: false })); });
    expect(button('Tap again to end')).toBeUndefined();
    await act(async () => { onMsg?.(withTouch({ playExtras: ['endPiece'] })); });
    await touchAt(21_000, endPad);
    expect(sent).not.toContainEqual(END);
    expect(button('Tap again to end')).toBeTruthy();
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
    await touchAt(20_000, () => button('End piece'));
    await touchAt(20_120, () => button('Tap again to end'));
    expect(sent).not.toContainEqual(END);
    await touchAt(20_700, () => button('Tap again to end'));
    expect(sent).toContainEqual(END);
  });

  it("follows the player's own bounce guard", async () => {
    await act(async () => { onMsg?.(withTouch({ playExtras: ['endPiece'], secondTapMinMs: 1200 })); });
    await touchAt(20_000, () => button('End piece'));
    await touchAt(20_800, () => button('Tap again to end'));
    expect(sent).not.toContainEqual(END);
    await touchAt(22_100, () => button('Tap again to end'));
    expect(sent).toContainEqual(END);
  });

  it('Stop the loops (was Stop all, A2): a bounce 120 ms after the first touch never stops the loops; a tap 580 ms after the bounce does', async () => {
    await act(async () => { onMsg?.(withTouch({ playExtras: ['stopAll'] })); });
    await touchAt(20_000, () => button('Stop the loops'));
    await touchAt(20_120, () => button('Tap again to stop the loops'));
    expect(sent).not.toContainEqual(STOP);
    await touchAt(20_700, () => button('Tap again to stop the loops'));
    expect(sent).toContainEqual(STOP);
  });

  it('Mute takes two taps too, and says in words that it is waiting for the second', async () => {
    const mute = () => [...el.querySelectorAll('button')].find((b) => /Mute|Muted|Tap again/.test(b.textContent ?? ''))!;
    await touchAt(20_000, mute);
    expect(sent).not.toContainEqual(MUTE);
    expect(mute().textContent).toContain('Tap again to mute');
    await touchAt(20_120, mute); // a bounce
    expect(sent).not.toContainEqual(MUTE);
    await touchAt(20_700, mute);
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
    const end = button('End piece');
    await act(async () => { pointer('pointerdown', end, 300); });
    await act(async () => { pointer('pointerup', end, 600); });
    expect(button('End piece')).toBeTruthy();
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
    expect(buttons[1].getAttribute('aria-label')).toBe('End piece');
    // No page tabs: the loop and scene pages are not there to switch to.
    expect(el.querySelectorAll('[role="tab"]')).toHaveLength(0);
    for (const gone of ['Mute', 'Stop the loops', 'Stop all', 'Next scene', 'Capture', 'Bass', 'Bed', 'Scene ']) {
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
    const loop = [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Bass'))!;
    await act(async () => { pointer('pointerdown', loop, 100); });
    expect(sent.filter((m) => (m as { type: string }).type === 'loop')).toEqual([]);
    expect(el.textContent).toContain(PRESS_PLAY);
  });

  it('on the Play page and the Loops & scenes page: refused the same way', async () => {
    await act(async () => { onMsg?.(withTouch({ playLoops: [0] }, { playing: false })); });
    const playLoop = [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Bass'))!;
    await act(async () => { pointer('pointerdown', playLoop, 100); });
    expect(el.textContent).toContain(PRESS_PLAY);
    const tab = [...el.querySelectorAll('[role="tab"]')].find((b) => b.textContent === 'Loops & scenes')!;
    await act(async () => { pointer('pointerdown', tab, 10); });
    now += 1000;
    const loop = [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Bass'))!;
    await act(async () => { pointer('pointerdown', loop, 100); });
    expect(sent.filter((m) => (m as { type: string }).type === 'loop')).toEqual([]);
  });

  it('while Play is starting on the laptop (the sound still loading), the tap is taken, not refused', async () => {
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, playing: false, starting: true } }); });
    const tab = [...el.querySelectorAll('[role="tab"]')].find((b) => b.textContent === 'Loops')!;
    await act(async () => { pointer('pointerdown', tab, 10); });
    const loop = [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Bass'))!;
    await act(async () => { pointer('pointerdown', loop, 100); });
    expect(sent).toContainEqual({ type: 'loop', index: 0 });
    expect(el.textContent).not.toContain(PRESS_PLAY);
  });

  it('a scene pad or Next scene while stopped: refused the same way, so no scene changes the player settings', async () => {
    const scenes = [{ name: 'Arrival', active: false }, { name: 'Open', active: false }];
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, playing: false, scenes } }); });
    const tab = [...el.querySelectorAll('[role="tab"]')].find((b) => b.textContent === 'Loops & scenes')!;
    await act(async () => { pointer('pointerdown', tab, 10); });
    const scene = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Scene 2: Open')!;
    await act(async () => { pointer('pointerdown', scene, 100); });
    now += 1000;
    const next = [...el.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Next scene'))!;
    await act(async () => { pointer('pointerdown', next, 100); });
    expect(sent.filter((m) => (m as { type: string }).type === 'scene')).toEqual([]);
    expect(el.textContent).toContain(PRESS_PLAY);
    // Playing: the same pad changes the scene.
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, scenes } }); });
    now += 1000;
    await act(async () => { pointer('pointerdown', [...el.querySelectorAll('button')].find((b) => b.textContent === 'Scene 2: Open')!, 100); });
    expect(sent).toContainEqual({ type: 'scene', index: 1 });
  });

  it('once the laptop plays, the same tap starts the loop', async () => {
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, playing: false } }); });
    const tab = [...el.querySelectorAll('[role="tab"]')].find((b) => b.textContent === 'Loops')!;
    await act(async () => { pointer('pointerdown', tab, 10); });
    await act(async () => { onMsg?.(STATE); });
    const loop = [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Bass'))!;
    await act(async () => { pointer('pointerdown', loop, 100); });
    expect(sent).toContainEqual({ type: 'loop', index: 0 });
    expect(el.textContent).not.toContain(PRESS_PLAY);
  });
});

describe('an iPad page of another build than the laptop', () => {
  const reload = vi.fn();
  beforeEach(() => {
    reload.mockClear();
    reloadPage.current = reload;
    sessionStorage.clear();
  });
  const fromLaptop = (extra: Record<string, unknown>) => ({ ...STATE, state: { ...STATE.state, ...extra } });

  it("answers the laptop's question with its own build, once per question", async () => {
    await act(async () => { onMsg?.(fromLaptop({ ask: 4 })); });
    await act(async () => { onMsg?.(fromLaptop({ ask: 4, beat: true })); });
    expect(sent.filter((m) => (m as { type: string }).type === 'hello')).toEqual([{ type: 'hello', build: BUILD_ID, ask: 4 }]);
    await act(async () => { onMsg?.(fromLaptop({ ask: 5 })); });
    expect(sent).toContainEqual({ type: 'hello', build: BUILD_ID, ask: 5 });
    // A laptop that never asks (one from before builds were compared) gets no hello.
    expect(sentOnJoining.filter((m) => (m as { type: string }).type === 'hello')).toEqual([]);
  });

  it("reloads itself when the laptop's build is different, but only once for that build", async () => {
    await act(async () => { onMsg?.(fromLaptop({ build: 'laptop-2' })); });
    expect(reload).toHaveBeenCalledTimes(1);
    // The page after the reload (the same tab): still different, say the laptop is the old
    // one. It must not reload again, or it would never stop.
    await act(async () => { root.unmount(); });
    root = createRoot(el);
    await act(async () => { root.render(<IPadRemoteScreen code="4821" />); });
    await act(async () => { onMsg?.(fromLaptop({ build: 'laptop-2' })); });
    await act(async () => { onMsg?.(fromLaptop({ build: 'laptop-2', beat: true })); });
    expect(reload).toHaveBeenCalledTimes(1);
    // A laptop updated again: once more.
    await act(async () => { onMsg?.(fromLaptop({ build: 'laptop-3' })); });
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('the same build, or a laptop that does not say, never reloads it', async () => {
    await act(async () => { onMsg?.(fromLaptop({ build: BUILD_ID })); });
    await act(async () => { onMsg?.(fromLaptop({})); });
    expect(reload).not.toHaveBeenCalled();
  });

  it('nothing about it is shown on the iPad', async () => {
    await act(async () => { onMsg?.(fromLaptop({ build: 'laptop-2', ask: 1 })); });
    expect(el.textContent).not.toMatch(/out of date|reload|build/i);
  });
});

describe('Capture while the piece clock runs (no new loop during the piece, F2)', () => {
  const CAPTURE = { type: 'trigger', name: 'capture' };
  const capturePad = () => [...el.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Capture'))!;

  it('looks unavailable and sends nothing, with no warning on the iPad; once the piece is over it works again', async () => {
    await act(async () => { onMsg?.(withTouch({ playExtras: ['capture'] }, { clock: { text: '5:12', phase: 'running' } })); });
    expect(capturePad().disabled).toBe(true);
    await act(async () => { pointer('pointerdown', capturePad(), 300); });
    expect(sent).not.toContainEqual(CAPTURE);
    expect(el.textContent).not.toMatch(/stop the piece|not now|can't/i);
    // The piece over (no clock running): Capture is there again.
    now += 1000;
    await act(async () => { onMsg?.(withTouch({ playExtras: ['capture'] })); });
    expect(capturePad().disabled).toBe(false);
    await act(async () => { pointer('pointerdown', capturePad(), 300); });
    expect(sent).toContainEqual(CAPTURE);
  });

  it('while the laptop is starting the piece (its sound still loading), Capture looks unavailable and sends nothing, on both pages', async () => {
    const loading = { playing: false, starting: true, pieceStarting: true };
    await act(async () => { onMsg?.(withTouch({ playExtras: ['capture'] }, loading)); });
    expect(capturePad().disabled).toBe(true);
    await act(async () => { pointer('pointerdown', capturePad(), 300); });
    const tab = [...el.querySelectorAll('[role="tab"]')].find((b) => b.textContent === 'Loops & scenes')!;
    await act(async () => { pointer('pointerdown', tab, 10); });
    now += 1000;
    await act(async () => { pointer('pointerdown', capturePad(), 300); });
    expect(capturePad().disabled).toBe(true);
    expect(sent).not.toContainEqual(CAPTURE);
    // Plain Play starting (no piece): Capture works as it always has.
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, playing: false, starting: true } }); });
    now += 1000;
    await act(async () => { pointer('pointerdown', capturePad(), 300); });
    expect(sent).toContainEqual(CAPTURE);
  });

  it('the same on the Loops & scenes page, in every phase of the clock but idle', async () => {
    for (const phase of ['running', 'lastMinute', 'lastMoments', 'ending', 'over'] as const) {
      await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, clock: { text: '0:20', phase } } }); });
      const tab = [...el.querySelectorAll('[role="tab"]')].find((b) => b.textContent === 'Loops & scenes')!;
      await act(async () => { pointer('pointerdown', tab, 10); });
      now += 1000;
      await act(async () => { pointer('pointerdown', capturePad(), 300); });
      expect(capturePad().disabled).toBe(true);
    }
    expect(sent).not.toContainEqual(CAPTURE);
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, clock: { text: '7:00', phase: 'idle' } } }); });
    now += 1000;
    await act(async () => { pointer('pointerdown', capturePad(), 300); });
    expect(sent).toContainEqual(CAPTURE);
  });
});

describe('show safety on the iPad (audit 2026-10-30)', () => {
  const sentOf = (type: string) => sent.filter((m) => (m as { type: string }).type === type);

  it('B2: says a hello every heartbeat that answers no question, so the laptop knows it is reaching', () => {
    expect(heartbeatOf?.()).toEqual({ type: 'hello', build: BUILD_ID, ask: null });
  });

  it('B2: a stalled link greys the page out, says "Not reaching the laptop", and a touch is neither sent nor shown as applied', async () => {
    linkReaching = false;
    // A fresh state, so the page draws again with the link as it now is.
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state } }); });
    expect(el.querySelector('[role="status"]')?.textContent).toBe('Not reaching the laptop');
    const strip = el.querySelector('[role="slider"][aria-label="Extra notes"]')!;
    const before = strip.getAttribute('aria-valuenow');
    await act(async () => { pointer('pointerdown', strip, 40); });
    await act(async () => { pointer('pointerup', strip, 40); });
    expect(strip.getAttribute('aria-valuenow')).toBe(before);
    await act(async () => { pointer('pointerdown', button('New idea'), 300); });
    expect(sentOf('control')).toEqual([]);
    expect(sentOf('trigger')).toEqual([]);
    // Back: the same touch works.
    linkReaching = true;
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state } }); });
    now += 1000;
    await act(async () => { pointer('pointerdown', button('New idea'), 300); });
    expect(sent).toContainEqual({ type: 'trigger', name: 'newIdea' });
  });

  it('B18: New idea while the laptop is stopped is refused, says why, and sends nothing', async () => {
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, playing: false } }); });
    await act(async () => { pointer('pointerdown', button('New idea'), 300); });
    expect(sentOf('trigger')).toEqual([]);
    expect(el.textContent).toContain('Press Play on the laptop first');
  });

  it('B19: while the laptop offers Carry on, the iPad says it is waiting, and its touches are refused', async () => {
    await act(async () => { onMsg?.(withTouch({ playExtras: ['endPiece'] }, { playing: false, carryOnWaiting: true })); });
    expect(el.querySelector('[role="status"]')?.textContent).toBe('The laptop is getting back: waiting for Carry on');
    const strip = el.querySelector('[role="slider"][aria-label="Extra notes"]')!;
    await act(async () => { pointer('pointerdown', strip, 40); });
    await act(async () => { pointer('pointerup', strip, 40); });
    await touchAt(30_000, endPad);
    await touchAt(31_000, endPad);
    expect(sentOf('control')).toEqual([]);
    expect(sentOf('trigger')).toEqual([]);
    expect(sentOf('armed')).toEqual([]);
  });

  it('B20: the first End piece tap tells the laptop, and so does the end of the wait; the armed pad keeps its text size and drains its border', async () => {
    await act(async () => { onMsg?.(withTouch({ playExtras: ['endPiece'], confirmSec: 6 })); });
    const size = endPad().style.fontSize;
    await touchAt(40_000, endPad);
    expect(sent).toContainEqual({ type: 'armed', name: 'endPiece', on: true });
    expect(endPad().style.fontSize).toBe(size);
    const ring = endPad().querySelector('[data-drain]') as HTMLElement | null;
    expect(ring).not.toBeNull();
    expect(ring!.style.animationDuration).toBe('6000ms');
    // The second tap ends the piece, and the wait is over.
    await touchAt(41_000, endPad);
    expect(sent).toContainEqual(END);
    expect(sent).toContainEqual({ type: 'armed', name: 'endPiece', on: false });
    expect(endPad().querySelector('[data-drain]')).toBeNull();
  });
});


describe('the iPad page in the board\u2019s own look (A11)', () => {
  const root1 = (): HTMLElement => el.firstElementChild as HTMLElement;
  const tabsOf = (): HTMLElement[] => [...el.querySelectorAll<HTMLElement>('[role="tab"]')];
  const loopsPage = async (): Promise<void> => {
    await act(async () => { pointer('pointerdown', tabsOf().find((t) => t.textContent === 'Loops & scenes')!, 10); });
  };

  it('uses the board\u2019s tokens and offers light and dark (while the laptop is stopped)', async () => {
    try { localStorage.removeItem('admi-ipad-mode'); } catch { /* no storage */ }
    expect(root1().classList.contains('bs-root')).toBe(true);
    expect(root1().getAttribute('data-bs-mode')).toBe('dark');
    // Not while playing: the safe layout has no extra control to touch by mistake.
    expect(el.querySelector('[data-mode-toggle]')).toBeNull();
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, playing: false } }); });
    const toggle = el.querySelector('[data-mode-toggle]') as HTMLButtonElement;
    expect(toggle.textContent).toBe('Light');
    await act(async () => { pointer('pointerdown', toggle, 10); });
    expect(root1().getAttribute('data-bs-mode')).toBe('light');
    expect(el.querySelector('[data-mode-toggle]')!.textContent).toBe('Dark');
  });

  it('the strips are not in a counter hue: one accent for every strip, and a track behind it', () => {
    for (const strip of el.querySelectorAll('[role="slider"]')) {
      const fill = strip.querySelector('[data-fill]') as HTMLElement;
      expect(fill.style.background).toBe('var(--bs-accent)');
      expect(strip.querySelector('[data-track]')).not.toBeNull();
    }
    expect(el.innerHTML).not.toMatch(/#4fc3f7|#ffb74d|#81c784|#ce93d8|#ef5350/i);
  });

  it('the Extra notes strip shows its value as a number, and while touched the finger\u2019s own', async () => {
    const strip = el.querySelector('[role="slider"][aria-label="Extra notes"]')!;
    expect(strip.querySelector('[data-number]')!.textContent).toBe('0%');
    expect(strip.textContent).toContain('Off');
    await act(async () => { pointer('pointerdown', strip, 40); }); // near the top of the 400 px strip
    const touched = strip.querySelector('[data-number]')!.textContent;
    expect(Number.parseInt(touched ?? '', 10)).toBeGreaterThan(80);
    expect(strip.textContent).not.toContain('Off'); // the laptop\u2019s word is stale while a finger is on it
    expect(strip.getAttribute('aria-valuetext')).toBe(touched);
    await act(async () => { pointer('pointerup', strip, 40); });
  });

  it('the 👆 mark is easy to see, and brighter on a touch', async () => {
    const mark = [...el.querySelectorAll('span')].find((x) => x.textContent === '👆')!;
    expect(Number(mark.style.opacity)).toBeGreaterThanOrEqual(0.6);
  });

  it('while waiting for the laptop, strips and pads say they are unavailable', async () => {
    const pads = (): HTMLElement[] => [...el.querySelectorAll<HTMLElement>('button:not([role="tab"]), [role="slider"]')];
    expect(pads().every((p) => p.getAttribute('aria-disabled') !== 'true')).toBe(true);
    linkReaching = false;
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state } }); });
    expect(pads().length).toBeGreaterThan(0);
    expect(pads().every((p) => p.getAttribute('aria-disabled') === 'true')).toBe(true);
  });

  it('the page tabs are one Tab stop, and the arrows move between them', async () => {
    expect(tabsOf().map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    await act(async () => { tabsOf()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(tabsOf().map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(tabsOf().map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
    await act(async () => { tabsOf()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); });
    expect(tabsOf().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
  });

  it('Loops & scenes: rows 18 px apart, End piece stays third and Stop the loops sits away from it', async () => {
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, scenes: [{ name: 'Arrival', active: true }, { name: 'Build', active: false }] } }); });
    await loopsPage();
    const pageBox = el.querySelector('[role="tablist"]')!.parentElement!;
    const rows = [...pageBox.children].filter((c) => (c as HTMLElement).style.display === 'grid' || (c as HTMLElement).style.display === 'flex');
    const column = [...pageBox.querySelectorAll<HTMLElement>(':scope > div')].find((d) => d.style.flexDirection === 'column')!;
    expect(rows.length).toBeGreaterThan(0);
    expect(column.style.gap).toBe('18px');
    const bottom = [...column.children].at(-1) as HTMLElement;
    const names = [...bottom.children].map((c) => c.getAttribute('aria-label') ?? c.textContent ?? '');
    const end = names.findIndex((n) => /^End piece/.test(n));
    const stop = names.findIndex((n) => /^Stop the loops/.test(n));
    expect(end).toBe(2); // End piece keeps its place (a question for Tim)
    expect(Math.abs(end - stop)).toBeGreaterThanOrEqual(2);
  });

  it('every pad\u2019s name starts with what it shows', async () => {
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, scenes: [{ name: 'Arrival', active: true }] } }); });
    await loopsPage();
    for (const b of el.querySelectorAll<HTMLElement>('button')) {
      const label = b.getAttribute('aria-label');
      if (!label) continue;
      // What is drawn, word by word (spans stacked in a pad have no space between them in textContent).
      const parts: string[] = [];
      for (const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); w.nextNode();) parts.push(w.currentNode.textContent ?? '');
      expect({ label, ok: nameStartsWithVisible(label, parts.join(' ')) }).toEqual({ label, ok: true });
    }
  });
});
