import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import {
  CONFIRM_SECONDS, DEFAULT_REMOTE_TOUCH, sanitizeRemoteTouch, SECOND_TAP_MIN_MS, secondTap, TWO_TAP_IDLE, type TwoTapPad,
} from '../remote/protocol';
import {
  dynamicsFromValue, isRemoteCode, makeRemoteCode, parseRemoteMessage, REMOTE_PATH, stripValue,
  STRIP_STEP, tempoFromValue, TEMPO_MAX, TEMPO_MIN, valueFromTempo, valueFromVelocity,
} from '../remote/protocol';
import { allowedFrom, attachRemoteRelay, MAX_MESSAGE_BYTES } from '../remote/relay';

describe('finger → value, for imprecise fingers', () => {
  it('the ends of a strip are generous "all the way" zones', () => {
    expect(stripValue(0)).toBe(0);
    expect(stripValue(0.07)).toBe(0);
    expect(stripValue(0.93)).toBe(1);
    expect(stripValue(1)).toBe(1);
  });

  it('values move in steps, so a trembling finger does not flicker them', () => {
    const a = stripValue(0.5);
    expect(stripValue(0.505)).toBe(a);
    expect(Math.abs(a / STRIP_STEP - Math.round(a / STRIP_STEP))).toBeLessThan(1e-9);
  });

  it('never goes outside 0–1, wherever the finger strays', () => {
    expect(stripValue(-3)).toBe(0);
    expect(stripValue(9)).toBe(1);
  });
});

describe('values ↔ settings', () => {
  it('speed covers a usable range and round-trips', () => {
    expect(tempoFromValue(0)).toBe(TEMPO_MIN);
    expect(tempoFromValue(1)).toBe(TEMPO_MAX);
    expect(tempoFromValue(valueFromTempo(96))).toBe(96);
  });

  it('dynamics never reaches silence (Mute is for that) and round-trips', () => {
    expect(dynamicsFromValue(0).volume).toBeGreaterThan(0);
    expect(dynamicsFromValue(0).velocity).toBeGreaterThan(0);
    expect(valueFromVelocity(dynamicsFromValue(0.6).velocity)).toBeCloseTo(0.6, 9);
  });
});

describe('messages', () => {
  it('accepts well-formed controls and taps', () => {
    expect(parseRemoteMessage('{"type":"control","name":"tempo","value":0.5}')).toEqual({ type: 'control', name: 'tempo', value: 0.5 });
    expect(parseRemoteMessage({ type: 'trigger', name: 'keep' })).toEqual({ type: 'trigger', name: 'keep' });
  });

  it('drops anything malformed rather than half-applying it', () => {
    expect(parseRemoteMessage('not json')).toBeNull();
    expect(parseRemoteMessage({ type: 'control', name: 'volume', value: 0.5 })).toBeNull();
    expect(parseRemoteMessage({ type: 'control', name: 'tempo', value: 7 })).toBeNull();
    expect(parseRemoteMessage({ type: 'trigger', name: 'deleteEverything' })).toBeNull();
    expect(parseRemoteMessage({ type: 'state', state: { values: {}, labels: {} } })).toBeNull();
  });

  it('codes are four digits', () => {
    expect(isRemoteCode(makeRemoteCode())).toBe(true);
    expect(isRemoteCode('12a4')).toBe(false);
  });

  it('the iPad may only send controls and taps; the laptop only state', () => {
    expect(allowedFrom('remote', 'control')).toBe(true);
    expect(allowedFrom('remote', 'state')).toBe(false);
    expect(allowedFrom('host', 'state')).toBe(true);
    expect(allowedFrom('host', 'trigger')).toBe(false);
  });
});

// ---- the relay, over real sockets ----

let server: Server | null = null;
const sockets: WebSocket[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
});

async function relay(): Promise<number> {
  server = createServer();
  attachRemoteRelay(server);
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  return (server.address() as AddressInfo).port;
}
function join(port: number, code: string, role: string): Promise<{ ws: WebSocket; got: unknown[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${REMOTE_PATH}?code=${code}&role=${role}`);
    sockets.push(ws);
    const got: unknown[] = [];
    ws.on('message', (d) => got.push(JSON.parse(d.toString())));
    ws.on('open', () => resolve({ ws, got }));
    ws.on('error', reject);
  });
}
// Real sockets: under a loaded test run 60 ms was sometimes too short for a message to arrive.
const settle = () => new Promise((r) => setTimeout(r, 200));

describe('relay', () => {
  it('passes the iPad\'s slides to the laptop with the same code, and the laptop\'s state back', async () => {
    const port = await relay();
    const host = await join(port, '4821', 'host');
    const ipad = await join(port, '4821', 'remote');
    await settle();
    ipad.ws.send(JSON.stringify({ type: 'control', name: 'fill', value: 0.7 }));
    const state = { values: { tempo: 0.5, dynamics: 0.5, fill: 0.7, evolve: 0 }, labels: { tempo: '100 BPM', dynamics: '50%', fill: '70%', evolve: 'Off' }, kept: false, muted: false, playing: true };
    host.ws.send(JSON.stringify({ type: 'state', state }));
    await settle();
    expect(host.got).toContainEqual({ type: 'control', name: 'fill', value: 0.7 });
    expect(ipad.got).toContainEqual({ type: 'state', state });
    expect(host.got).toContainEqual({ type: 'peers', hosts: 1, remotes: 1 });
  });

  it('a different code hears nothing', async () => {
    const port = await relay();
    const host = await join(port, '1111', 'host');
    const stranger = await join(port, '2222', 'remote');
    await settle();
    stranger.ws.send(JSON.stringify({ type: 'trigger', name: 'mute' }));
    await settle();
    expect(host.got.filter((m) => (m as { type: string }).type !== 'peers')).toEqual([]);
  });

  it('drops a malformed message, and one the sender may not send', async () => {
    const port = await relay();
    const host = await join(port, '4821', 'host');
    const ipad = await join(port, '4821', 'remote');
    await settle();
    ipad.ws.send('{"type":"control","name":"tempo","value":42}');
    ipad.ws.send(JSON.stringify({ type: 'state', state: {} }));
    await settle();
    expect(host.got.filter((m) => (m as { type: string }).type !== 'peers')).toEqual([]);
  });

  it('an oversized message closes only that connection; the server and the others carry on', async () => {
    const port = await relay();
    const host = await join(port, '4821', 'host');
    const bully = await join(port, '4821', 'remote');
    await settle();
    const closed = new Promise<void>((r) => bully.ws.on('close', () => r()));
    bully.ws.on('error', () => {});
    bully.ws.send('x'.repeat(MAX_MESSAGE_BYTES + 10));
    await closed;
    // Still serving: a fresh iPad joins and its taps reach the laptop.
    const ipad = await join(port, '4821', 'remote');
    await settle();
    ipad.ws.send(JSON.stringify({ type: 'trigger', name: 'keep' }));
    await settle();
    expect(host.got).toContainEqual({ type: 'trigger', name: 'keep' });
    expect(host.got).toContainEqual({ type: 'peers', hosts: 1, remotes: 1 });
  });

  it('a long set list fits: the laptop state with every name is passed on', async () => {
    const port = await relay();
    const host = await join(port, '4821', 'host');
    const ipad = await join(port, '4821', 'remote');
    await settle();
    const name = 'A long loop name here!!';
    const state = {
      values: { tempo: 0.5, dynamics: 0.5, fill: 0, evolve: 0 }, labels: { tempo: '100 BPM', dynamics: '50%', fill: 'Off', evolve: 'Off' },
      kept: false, muted: false, playing: true,
      loops: Array.from({ length: 8 }, () => ({ name, state: 'stopped' })),
      scenes: Array.from({ length: 12 }, () => ({ name, current: false })),
    };
    const text = JSON.stringify({ type: 'state', state });
    expect(text.length).toBeGreaterThan(1000);
    host.ws.send(text);
    await settle();
    expect(ipad.got.some((m) => (m as { type: string }).type === 'state')).toBe(true);
  });

  it('refuses a connection without a proper code', async () => {
    const port = await relay();
    await expect(join(port, 'abcd', 'remote')).rejects.toBeTruthy();
  });
});

// ---- reach: the player's comfortable slide becomes the whole strip ----
import {
  FULL_REACH, mapReach, MIN_REACH_SPAN, reachFromSamples, sanitizeReach, unmapReach,
} from '../remote/protocol';

describe('reach', () => {
  it('maps the player\'s reach onto the whole range, and back', () => {
    const reach = { low: 0.1, high: 0.8 };
    expect(mapReach(0.1, reach)).toBe(0);
    expect(mapReach(0.8, reach)).toBe(1);
    expect(mapReach(0.45, reach)).toBeCloseTo(0.5, 9);
    expect(mapReach(0.95, reach)).toBe(1); // past the reach is still "all the way"
    expect(unmapReach(0.5, reach)).toBeCloseTo(0.45, 9);
  });

  it('learns a reach from where the finger went, pulled in by a margin', () => {
    const r = reachFromSamples([0.12, 0.3, 0.5, 0.82, 0.79], FULL_REACH);
    expect(r.low).toBeCloseTo(0.15, 9);
    expect(r.high).toBeCloseTo(0.79, 9);
  });

  it('keeps the old reach when the finger hardly moved, or never touched', () => {
    const prev = { low: 0.2, high: 0.7 };
    expect(reachFromSamples([], prev)).toEqual(prev);
    expect(reachFromSamples([0.5, 0.52, 0.55], prev)).toEqual(prev);
  });

  it('a stored reach is made safe', () => {
    expect(sanitizeReach({ low: 0.9, high: 0.2 })).toEqual({ low: 0.2, high: 0.9 });
    const narrow = sanitizeReach({ low: 0.5, high: 0.52 });
    expect(narrow.high - narrow.low).toBeCloseTo(MIN_REACH_SPAN, 9);
    expect(sanitizeReach('junk')).toEqual({ low: 0, high: 1 });
  });

  it('reach reports are messages the iPad may send, and the laptop may say it is learning', () => {
    expect(parseRemoteMessage({ type: 'reach', name: 'fill', fraction: 0.3 })).toEqual({ type: 'reach', name: 'fill', fraction: 0.3 });
    expect(parseRemoteMessage({ type: 'reach', name: 'fill', fraction: 3 })).toBeNull();
    expect(allowedFrom('remote', 'reach')).toBe(true);
    expect(allowedFrom('host', 'reach')).toBe(false);
    const state = { values: { tempo: 0, dynamics: 0, fill: 0, evolve: 0 }, labels: { tempo: '', dynamics: '', fill: '', evolve: '' }, learning: true, reach: { fill: { low: 0.1, high: 0.9 } } };
    const parsed = parseRemoteMessage({ type: 'state', state });
    expect(parsed).toMatchObject({ type: 'state', state: { learning: true } });
    expect(parsed && parsed.type === 'state' ? parsed.state.reach?.fill : null).toEqual({ low: 0.1, high: 0.9 });
    expect(parsed && parsed.type === 'state' ? parsed.state.reach?.tempo : null).toEqual({ low: 0, high: 1 });
  });
});

// ---- loops and scenes from the iPad ----
describe('loops and scenes over the link', () => {
  it('the iPad may launch a loop, recall a scene or the next one, and stop everything', () => {
    expect(parseRemoteMessage({ type: 'loop', index: 3 })).toEqual({ type: 'loop', index: 3 });
    expect(parseRemoteMessage({ type: 'loop', index: 2.5 })).toBeNull();
    expect(parseRemoteMessage({ type: 'scene', index: 'next' })).toEqual({ type: 'scene', index: 'next' });
    expect(parseRemoteMessage({ type: 'scene', index: 1 })).toEqual({ type: 'scene', index: 1 });
    expect(parseRemoteMessage({ type: 'scene', index: 'previous' })).toBeNull();
    expect(parseRemoteMessage({ type: 'trigger', name: 'stopAll' })).toEqual({ type: 'trigger', name: 'stopAll' });
    expect(allowedFrom('remote', 'loop')).toBe(true);
    expect(allowedFrom('remote', 'scene')).toBe(true);
    expect(allowedFrom('host', 'loop')).toBe(false);
  });

  it('the laptop tells the iPad each loop\'s name and state, and which scene is on', () => {
    const state = {
      values: { tempo: 0, dynamics: 0, fill: 0, evolve: 0 }, labels: { tempo: '', dynamics: '', fill: '', evolve: '' },
      loops: [{ name: 'Bass line', state: 'playing' }, { name: '', state: 'nonsense' }],
      scenes: [{ name: 'Intro', active: true }, { name: 'Verse', active: false }],
    };
    const parsed = parseRemoteMessage({ type: 'state', state });
    expect(parsed && parsed.type === 'state' ? parsed.state.loops : null).toEqual([{ name: 'Bass line', state: 'playing' }, { name: '', state: 'empty' }]);
    expect(parsed && parsed.type === 'state' ? parsed.state.scenes : null).toEqual([{ name: 'Intro', active: true }, { name: 'Verse', active: false }]);
  });
});

describe('what the iPad is told to show', () => {
  it('carries which strips and pads to show, locks and the strip mode, made safe', () => {
    const state = {
      values: { tempo: 0, dynamics: 0, fill: 0, evolve: 0 }, labels: { tempo: '', dynamics: '', fill: '', evolve: '' },
      shown: { strips: ['fill', 'bogus'], pads: ['keep', 'stopAll'], loopsPage: false },
      locked: ['tempo', 'nope'], stripMode: 'follow', loopsFade: true,
    };
    const parsed = parseRemoteMessage({ type: 'state', state });
    expect(parsed && parsed.type === 'state' ? parsed.state : null).toMatchObject({
      shown: { strips: ['fill'], pads: ['keep'], loopsPage: false }, locked: ['tempo'], stripMode: 'follow', loopsFade: true,
    });
  });
});

describe('the clock on the iPad, and the End and Capture pads', () => {
  it('the laptop sends the countdown and its phase, made safe', () => {
    const base = { values: { tempo: 0, dynamics: 0, fill: 0, evolve: 0 }, labels: { tempo: '', dynamics: '', fill: '', evolve: '' } };
    const good = parseRemoteMessage({ type: 'state', state: { ...base, clock: { text: '6:42', phase: 'lastMinute' } } });
    expect(good && good.type === 'state' ? good.state.clock : null).toEqual({ text: '6:42', phase: 'lastMinute' });
    const bad = parseRemoteMessage({ type: 'state', state: { ...base, clock: { text: '6:42', phase: 'panic' } } });
    expect(bad && bad.type === 'state' ? bad.state.clock : 'x').toBeUndefined();
  });

  it('End piece and Capture are triggers the iPad may send', () => {
    expect(parseRemoteMessage({ type: 'trigger', name: 'endPiece' })).toEqual({ type: 'trigger', name: 'endPiece' });
    expect(parseRemoteMessage({ type: 'trigger', name: 'capture' })).toEqual({ type: 'trigger', name: 'capture' });
  });
});

describe('the player touch settings', () => {
  it('are made safe: unknown pads dropped, loops in range, the second-tap window one of the choices', () => {
    expect(sanitizeRemoteTouch(null)).toEqual(DEFAULT_REMOTE_TOUCH);
    expect(sanitizeRemoteTouch({ actOn: 'lift', confirmSec: 10, secondTapMinMs: 800, playExtras: ['endPiece', 'explode'], playLoops: [3, 3, 9, -1, 1], showNext: false }))
      .toEqual({ actOn: 'lift', confirmSec: 10, secondTapMinMs: 800, playExtras: ['endPiece'], playLoops: [1, 3], showNext: false });
    expect(sanitizeRemoteTouch({ confirmSec: 4 }).confirmSec).toBe(DEFAULT_REMOTE_TOUCH.confirmSec);
  });

  it('the bounce guard is half a second unless chosen, and an old or odd value falls back to that', () => {
    expect(DEFAULT_REMOTE_TOUCH.secondTapMinMs).toBe(500);
    // A player saved before the guard existed.
    expect(sanitizeRemoteTouch({ actOn: 'lift', confirmSec: 3 }).secondTapMinMs).toBe(500);
    for (const ms of SECOND_TAP_MIN_MS) expect(sanitizeRemoteTouch({ secondTapMinMs: ms }).secondTapMinMs).toBe(ms);
    for (const odd of [0, 120, -500, 99999, '500', null]) expect(sanitizeRemoteTouch({ secondTapMinMs: odd }).secondTapMinMs).toBe(500);
    // Every choice is shorter than the shortest window, so a second tap can always count.
    for (const ms of SECOND_TAP_MIN_MS) expect(ms).toBeLessThan(Math.min(...CONFIRM_SECONDS) * 1000);
  });

  it('travels to the iPad with the rest of the state', () => {
    const base = { values: { tempo: 0, dynamics: 0, fill: 0, evolve: 0 }, labels: { tempo: '', dynamics: '', fill: '', evolve: '' } };
    const m = parseRemoteMessage({ type: 'state', state: { ...base, touch: { ...DEFAULT_REMOTE_TOUCH, secondTapMinMs: 1200 } } });
    expect(m && m.type === 'state' ? m.state.touch?.secondTapMinMs : null).toBe(1200);
  });
});

describe('Play starting on the laptop', () => {
  const base = { values: { tempo: 0, dynamics: 0, fill: 0, evolve: 0 }, labels: { tempo: '', dynamics: '', fill: '', evolve: '' } };

  it('reaches the iPad, so a loop tap while the sound loads is not refused', () => {
    const m = parseRemoteMessage({ type: 'state', state: { ...base, playing: false, starting: true } });
    expect(m && m.type === 'state' ? m.state.starting : null).toBe(true);
  });

  it('is left out unless it is exactly true', () => {
    const m = parseRemoteMessage({ type: 'state', state: { ...base, starting: 'yes' } });
    expect(m && m.type === 'state' ? 'starting' in m.state : null).toBe(false);
  });

  it('a start of the piece still loading reaches the iPad too (no Capture then), and only when exactly true', () => {
    const m = parseRemoteMessage({ type: 'state', state: { ...base, playing: false, starting: true, pieceStarting: true } });
    expect(m && m.type === 'state' ? m.state.pieceStarting : null).toBe(true);
    const no = parseRemoteMessage({ type: 'state', state: { ...base, starting: true, pieceStarting: 1 } });
    expect(no && no.type === 'state' ? 'pieceStarting' in no.state : null).toBe(false);
  });
});

describe('two taps, safe from a bounce (End piece, Stop all, Mute)', () => {
  const rule = { minMs: 500, windowMs: 6000 };
  /** What each touch did, for touches at these moments on one pad (from nothing armed). */
  const steps = (times: number[], r = rule): string[] => {
    let pad: TwoTapPad = TWO_TAP_IDLE;
    return times.map((t) => {
      const out = secondTap(pad, t, r);
      pad = out.pad;
      return out.step;
    });
  };

  it('the first tap arms', () => {
    expect(steps([1000])).toEqual(['arm']);
  });

  it('a bounce 60, 120 or 250 ms after the arming tap never confirms, and does not re-arm', () => {
    for (const gap of [60, 120, 250, 499]) expect(steps([1000, 1000 + gap])).toEqual(['arm', 'ignore']);
  });

  it('a second tap 600 ms after the first, inside the window, confirms', () => {
    expect(steps([0, 600])).toEqual(['arm', 'confirm']);
    expect(steps([1000, 1500])).toEqual(['arm', 'confirm']);
    expect(steps([1000, 1000 + 5999])).toEqual(['arm', 'confirm']);
  });

  it('a press that chatters longer than the guard never confirms: touches at 0, 200, 400, 600', () => {
    // Each touch is within the guard of the one before, so each is a bounce of the same
    // press and restarts the quiet. Measured from the arming touch, 600 confirmed.
    expect(steps([0, 200, 400, 600])).toEqual(['arm', 'ignore', 'ignore', 'ignore']);
    expect(steps([0, 200, 400, 600, 800, 1000, 1200])).not.toContain('confirm');
  });

  it('a confirming tap needs the guard of quiet after the last bounce: 0, 200, then 1000 confirms', () => {
    expect(steps([0, 200, 1000])).toEqual(['arm', 'ignore', 'confirm']);
    expect(steps([0, 200, 650])).toEqual(['arm', 'ignore', 'ignore']);
  });

  it('right after a confirm, a touch is a bounce: it is ignored and arms nothing', () => {
    expect(steps([0, 600, 700])).toEqual(['arm', 'confirm', 'ignore']);
    // Still chattering: still nothing armed. Once quiet, a touch arms afresh.
    expect(steps([0, 600, 700, 900, 1300, 1900])).toEqual(['arm', 'confirm', 'ignore', 'ignore', 'ignore', 'arm']);
  });

  it('the window is timed from the arming tap: after it lapses, a tap arms again rather than confirming', () => {
    expect(steps([1000, 1000 + 6000])).toEqual(['arm', 'arm']);
    expect(steps([1000, 1000 + 60_000])).toEqual(['arm', 'arm']);
    // Bounces do not stretch the window.
    expect(steps([0, 300, 5800, 6100])).toEqual(['arm', 'ignore', 'confirm', 'ignore']);
    expect(steps([0, 300, 6100])).toEqual(['arm', 'ignore', 'arm']);
  });

  it('follows the player setting', () => {
    const slow = { minMs: 800, windowMs: 3000 };
    expect(steps([1000, 1600], slow)).toEqual(['arm', 'ignore']);
    expect(steps([1000, 1900], slow)).toEqual(['arm', 'confirm']);
    expect(steps([1000, 4100], slow)).toEqual(['arm', 'arm']);
  });
});

// ---- which build each page is: an iPad page kept open from before an update ----
import { ipadPages, shouldReloadFor } from '../remote/protocol';

describe('the build each side runs', () => {
  const base = { values: { tempo: 0, dynamics: 0, fill: 0, evolve: 0 }, labels: { tempo: '', dynamics: '', fill: '', evolve: '' } };
  const stateOf = (extra: Record<string, unknown>) => {
    const m = parseRemoteMessage({ type: 'state', state: { ...base, ...extra } });
    return m && m.type === 'state' ? m.state : null;
  };

  it("the laptop's state carries its build and its question to the iPad pages", () => {
    expect(stateOf({ build: 'lq3x9a-k2', ask: 3 })).toMatchObject({ build: 'lq3x9a-k2', ask: 3 });
  });

  it('a missing or odd build or question is left out, never guessed (missing means older)', () => {
    for (const build of [42, '', 'x'.repeat(41), 'has space', '<b>', null]) expect(stateOf({ build })).not.toHaveProperty('build');
    for (const ask of [-1, 1.5, '3', null]) expect(stateOf({ ask })).not.toHaveProperty('ask');
    expect(stateOf({})).not.toHaveProperty('build');
  });

  it("the iPad's answer says its build and which question it answers; an older one says nothing", () => {
    expect(parseRemoteMessage({ type: 'hello', build: 'lq3x9a-k2', ask: 3 })).toEqual({ type: 'hello', build: 'lq3x9a-k2', ask: 3 });
    // Tolerant: whatever is missing or odd is "not known", and the message still counts.
    expect(parseRemoteMessage({ type: 'hello' })).toEqual({ type: 'hello', build: null, ask: null });
    expect(parseRemoteMessage({ type: 'hello', build: 7, ask: 'x' })).toEqual({ type: 'hello', build: null, ask: null });
  });

  it('only the iPad may say hello', () => {
    expect(allowedFrom('remote', 'hello')).toBe(true);
    expect(allowedFrom('host', 'hello')).toBe(false);
  });

  it("the relay passes the iPad's hello to the laptop", async () => {
    const port = await relay();
    const host = await join(port, '4821', 'host');
    const ipad = await join(port, '4821', 'remote');
    await settle();
    ipad.ws.send(JSON.stringify({ type: 'hello', build: 'lq3x9a-k2', ask: 1 }));
    await settle();
    expect(host.got).toContainEqual({ type: 'hello', build: 'lq3x9a-k2', ask: 1 });
  });

  describe('the laptop: are the iPad pages this build?', () => {
    it('every page connected has answered with this build: up to date', () => {
      expect(ipadPages(1, ['b1'], 'b1', false)).toBe('current');
      expect(ipadPages(2, ['b1', 'b1'], 'b1', false)).toBe('current');
    });

    it('a page that answers with another build, or none, is out of date at once', () => {
      expect(ipadPages(1, ['b0'], 'b1', false)).toBe('outdated');
      expect(ipadPages(2, ['b1', null], 'b1', false)).toBe('outdated');
    });

    it('a page that has not answered yet is waited for; after the wait it is out of date (a page too old to answer)', () => {
      expect(ipadPages(1, [], 'b1', false)).toBe('waiting');
      expect(ipadPages(2, ['b1'], 'b1', false)).toBe('waiting');
      expect(ipadPages(1, [], 'b1', true)).toBe('outdated');
      expect(ipadPages(2, ['b1'], 'b1', true)).toBe('outdated');
    });

    it('no iPad, nothing to say', () => {
      expect(ipadPages(0, [], 'b1', true)).toBe('waiting');
    });
  });

  describe('the iPad: reload itself to match the laptop, at most once for each laptop build', () => {
    it('a different laptop build reloads it, unless it has already reloaded for that one', () => {
      expect(shouldReloadFor('ipad-old', 'laptop-new', null)).toBe(true);
      expect(shouldReloadFor('ipad-old', 'laptop-new', 'laptop-new')).toBe(false);
      expect(shouldReloadFor('ipad-old', 'laptop-newer', 'laptop-new')).toBe(true);
    });

    it('the same build, or a laptop too old to say, never reloads it', () => {
      expect(shouldReloadFor('b1', 'b1', null)).toBe(false);
      expect(shouldReloadFor('b1', undefined, null)).toBe(false);
    });
  });
});

describe('show safety over the link (audit 2026-10-30: B2, B19, B20)', () => {
  const base = { values: { tempo: 0, dynamics: 0, fill: 0, evolve: 0 }, labels: { tempo: '', dynamics: '', fill: '', evolve: '' } };

  it('the iPad says when its End piece is waiting for the second tap, and when it no longer is; the relay passes it on', () => {
    expect(parseRemoteMessage({ type: 'armed', name: 'endPiece', on: true })).toEqual({ type: 'armed', name: 'endPiece', on: true });
    expect(parseRemoteMessage({ type: 'armed', name: 'endPiece', on: false })).toEqual({ type: 'armed', name: 'endPiece', on: false });
    expect(parseRemoteMessage({ type: 'armed', name: 'deleteEverything', on: true })).toBeNull();
    expect(parseRemoteMessage({ type: 'armed', name: 'endPiece', on: 'yes' })).toBeNull();
    expect(allowedFrom('remote', 'armed')).toBe(true);
    expect(allowedFrom('host', 'armed')).toBe(false);
  });

  it('the laptop waiting for Carry on reaches the iPad, and only when exactly true', () => {
    const m = parseRemoteMessage({ type: 'state', state: { ...base, playing: false, carryOnWaiting: true } });
    expect(m && m.type === 'state' ? m.state.carryOnWaiting : null).toBe(true);
    const no = parseRemoteMessage({ type: 'state', state: { ...base, carryOnWaiting: 1 } });
    expect(no && no.type === 'state' ? 'carryOnWaiting' in no.state : null).toBe(false);
  });

  it('the iPad heartbeat (a hello that answers no question) is a well-formed hello, so a laptop of any build ignores it', () => {
    expect(parseRemoteMessage({ type: 'hello', build: 'abc-1', ask: null })).toEqual({ type: 'hello', build: 'abc-1', ask: null });
  });
});
