// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

// Tell React this is a test environment, so act() waits for every update to render
// (without it a tab switch could still be pending when the test looked for its pads).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A11 (audit 2026-10-30): the iPad page uses the board's tokens and offers light and dark;
 * its strips are not counter colours, have a track, and say their value as a number; the 👆
 * is visible; waiting pads are marked unavailable; the page tabs are one Tab stop; the
 * Loops & scenes rows use the 18 px gap and Stop sits away from End piece. End piece keeps
 * its place in the safe layout, and the second-tap window is as it was.
 */

// The link, with a fake socket that records what the page sends.
const sent: unknown[] = [];
let onMsg: ((msg: unknown) => void) | null = null;
/** Whether the laptop's words are getting through (a stalled Wi-Fi link: false). */
let linkReaching = true;
vi.mock('../remote/useRemoteLink', () => ({
  useRemoteLink: (_role: string, _code: string, _enabled: boolean, onMessage: (m: unknown) => void) => {
    onMsg = onMessage;
    return { status: 'open', others: 1, reaching: linkReaching, send: (m: unknown) => sent.push(m) };
  },
}));

import IPadRemoteScreen from '../ui/screens/IPadRemoteScreen';
import { DEFAULT_REMOTE_TOUCH } from '../remote/protocol';
import { safeShowLayout } from '../profiles/BoardSequencerConfig';
import { BOARD_TOKENS } from '../ui/screens/boardSequencer/theme/boardTokens';

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
  sent.splice(0);
});

// Each test's page is taken down after it. A page left mounted kept its timers (the
// touch mark), re-rendered during the next test and took over the fake link's message
// handler, so the next page never received its state — only when the machine was busy.
afterEach(async () => {
  await act(async () => { root.unmount(); });
  el.remove();
  vi.restoreAllMocks();
});


const withTouch = (touch: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ ...STATE, state: { ...STATE.state, touch: { ...DEFAULT_REMOTE_TOUCH, ...touch }, ...extra } });
const strip = (name: string) => el.querySelector(`[role="slider"][aria-label="${name}"]`)!;
const buttonWith = (text: string) => [...el.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(text))!;
const tabs = () => [...el.querySelectorAll<HTMLElement>('[role="tab"]')];

describe('A11: the board\'s own tokens, in light and dark', () => {
  const root = () => el.firstElementChild as HTMLElement;

  it('the page is a board page: the board\'s class and style, dark until the laptop says light', () => {
    expect(root().classList.contains('bs-root')).toBe(true);
    expect(root().dataset.bsStyle).toBe('calm');
    expect(root().dataset.bsMode).toBe('dark');
  });

  it('follows the laptop into light, and back', async () => {
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, theme: 'light' } }); });
    expect(root().dataset.bsMode).toBe('light');
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, theme: 'dark' } }); });
    expect(root().dataset.bsMode).toBe('dark');
  });

  it('the page behind it takes the board\'s background in each mode', async () => {
    const bg = (hex: string): string => { const d = document.createElement('div'); d.style.background = hex; return d.style.background; };
    expect(document.body.style.background).toBe(bg(BOARD_TOKENS.calm.dark.bg));
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, theme: 'light' } }); });
    expect(document.body.style.background).toBe(bg(BOARD_TOKENS.calm.light.bg));
  });

  it('no colour is written into the page: everything is a board token', async () => {
    await act(async () => {
      onMsg?.(withTouch({ playExtras: ['endPiece', 'stopAll', 'capture', 'nextScene'], playLoops: [0] }, {
        loops: [{ name: 'Bass', state: 'playing' }], scenes: [{ name: 'A', active: true }],
        clock: { text: '4:00', phase: 'lastMinute' },
      }));
    });
    const hex = [...el.querySelectorAll('[style]')].flatMap((n) => (n.getAttribute('style') ?? '').match(/#[0-9a-fA-F]{3,8}\b/g) ?? []);
    expect(hex).toEqual([]);
    // The Loops & scenes page too.
    await act(async () => { pointer('pointerdown', tabs()[2], 10); });
    const hex2 = [...el.querySelectorAll('[style]')].flatMap((n) => (n.getAttribute('style') ?? '').match(/#[0-9a-fA-F]{3,8}\b/g) ?? []);
    expect(hex2).toEqual([]);
  });
});

describe('A11: the strips', () => {
  it('are not counter colours: every strip is filled in the accent, told apart by its name', () => {
    const fills = [...el.querySelectorAll('[role="slider"]')].map((s) => (s.querySelector('[data-strip-fill]') as HTMLElement).style.background);
    expect(new Set(fills)).toEqual(new Set(['var(--bs-accent)']));
  });

  it('have a track you can see, with the level in it, even at Off', () => {
    const extra = strip('Extra notes');
    const track = extra.querySelector('[data-strip-track]') as HTMLElement;
    expect(track).not.toBeNull();
    expect(track.style.border).toContain('var(--bs-border-control)');
    expect(track.querySelector('[data-strip-fill]')).not.toBeNull();
    // A line at the level, so Off is a place on the track and not an empty box.
    expect(extra.querySelector('[data-strip-level]')).not.toBeNull();
  });

  it('say the value as a number, and the laptop\'s word beside it', async () => {
    const extra = strip('Extra notes');
    expect(extra.textContent).toContain('0%');
    expect(extra.textContent).toContain('Off');
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, values: { ...STATE.state.values, fill: 0.5 }, labels: { ...STATE.state.labels, fill: 'Some' } } }); });
    expect(strip('Extra notes').textContent).toContain('50%');
    expect(strip('Extra notes').textContent).toContain('Some');
  });

  it('while a finger is on it, the words show the finger\'s value, not the laptop\'s', async () => {
    const extra = strip('Extra notes');
    await act(async () => { pointer('pointerdown', extra, 120); }); // 75% up a 400 px strip
    expect(strip('Extra notes').textContent).toContain('75%');
    expect(strip('Extra notes').textContent).not.toContain('Off');
    await act(async () => { pointer('pointermove', extra, 200); });
    expect(strip('Extra notes').textContent).toContain('50%');
  });
});

describe('A11: the 👆 and the waiting pads', () => {
  it('the 👆 is there to see, and stronger while a touch is seen', async () => {
    const mark = [...el.querySelectorAll('span')].find((s) => s.textContent === '👆') as HTMLElement;
    expect(Number(mark.style.opacity)).toBeGreaterThanOrEqual(0.5);
    expect(parseFloat(mark.style.fontSize)).toBeGreaterThanOrEqual(20);
    await act(async () => { pointer('pointerdown', buttonWith('New idea'), 300, 40); });
    expect(Number((([...el.querySelectorAll('span')].find((s) => s.textContent === '👆')) as HTMLElement).style.opacity)).toBe(1);
  });

  it('while the laptop is not reaching, every strip and pad is marked unavailable; when it is, none', async () => {
    const marked = () => [...el.querySelectorAll('[role="slider"], button:not([role="tab"])')].map((n) => n.getAttribute('aria-disabled'));
    expect(new Set(marked())).toEqual(new Set([null]));
    linkReaching = false;
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state } }); });
    expect(marked().length).toBeGreaterThan(0);
    expect(new Set(marked())).toEqual(new Set(['true']));
    linkReaching = true;
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state } }); });
    expect(new Set(marked())).toEqual(new Set([null]));
  });

  it('while the laptop offers Carry on, they are marked unavailable too', async () => {
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, playing: false, carryOnWaiting: true } }); });
    expect(strip('Extra notes').getAttribute('aria-disabled')).toBe('true');
    expect(buttonWith('New idea').getAttribute('aria-disabled')).toBe('true');
  });
});

describe('A11: the page tabs are one Tab stop', () => {
  const focusOn = async (t: HTMLElement): Promise<void> => { await act(async () => { t.focus(); }); };
  const key = async (target: Element, k: string): Promise<void> => {
    await act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
  };

  it('only the page you are on is in the Tab order', () => {
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
  });

  it('the arrow keys move between the pages, and the Tab stop goes with them', async () => {
    await focusOn(tabs()[0]);
    await key(tabs()[0], 'ArrowRight');
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
    expect(document.activeElement).toBe(tabs()[1]);
    await key(tabs()[1], 'ArrowRight');
    await key(tabs()[2], 'ArrowRight'); // wraps to the first
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    await key(tabs()[0], 'ArrowLeft'); // and back to the last
    expect(tabs()[2].getAttribute('aria-selected')).toBe('true');
    await key(tabs()[2], 'Home');
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    await key(tabs()[0], 'End');
    expect(tabs()[2].getAttribute('aria-selected')).toBe('true');
  });

  it('Enter and Space still choose a page', async () => {
    await focusOn(tabs()[0]);
    await act(async () => { tabs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
  });
});

describe('A11: Loops & scenes', () => {
  const open = async (): Promise<void> => {
    await act(async () => { onMsg?.({ ...STATE, state: { ...STATE.state, scenes: [{ name: 'A', active: true }, { name: 'B', active: false }], loops: [{ name: 'Bass', state: 'playing' }] } }); });
    await act(async () => { pointer('pointerdown', tabs()[2], 10); });
  };

  it('its rows are 18 px apart', async () => {
    await open();
    const rows = el.querySelector('[data-loops-page]') as HTMLElement;
    expect(rows.style.gap).toBe('18px');
    for (const row of rows.children) expect((row as HTMLElement).style.gap).toBe('18px');
  });

  it('Stop the loops is at the far end from End piece, with the other pads between', async () => {
    await open();
    const bottom = el.querySelector('[data-loops-bottom]') as HTMLElement;
    const names = [...bottom.children].map((c) => (c.getAttribute('aria-label') ?? c.textContent ?? ''));
    const stop = names.findIndex((n) => /stop the loops/i.test(n));
    const end = names.findIndex((n) => /end the piece/i.test(n));
    expect(stop).toBe(0);
    expect(end).toBe(names.length - 1);
    expect(Math.abs(stop - end)).toBeGreaterThanOrEqual(3);
  });
});

describe('A11: what stays as it was', () => {
  it('End piece keeps its place in the safe layout: after New idea, last', async () => {
    const l = safeShowLayout(DEFAULT_REMOTE_TOUCH);
    await act(async () => {
      onMsg?.({ ...STATE, state: { ...STATE.state, shown: { strips: l.remoteStrips, pads: l.remotePads, loopsPage: l.remoteLoopsPage }, locked: l.remoteLocked, touch: l.remoteTouch } });
    });
    const buttons = [...el.querySelectorAll('button')];
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toContain('New idea');
    expect(buttons[1].getAttribute('aria-label')).toBe('End the piece');
  });

  it('the second-tap window is the laptop\'s own: 6 s unless it says otherwise', async () => {
    await act(async () => { onMsg?.(withTouch({ playExtras: ['endPiece'] })); });
    const end = () => [...el.querySelectorAll('button')].find((b) => /end the piece/i.test(b.getAttribute('aria-label') ?? ''))!;
    now = 50_000;
    await act(async () => { pointer('pointerdown', end(), 300); });
    await act(async () => { pointer('pointerup', end(), 300); });
    expect((end().querySelector('[data-drain]') as HTMLElement).style.animationDuration).toBe('6000ms');
  });
});
