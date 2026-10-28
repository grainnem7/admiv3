import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { CONFIRM_SECONDS, DEFAULT_REMOTE_TOUCH, sanitizeRemoteTouch, SECOND_TAP_MIN_MS, secondTap } from '../remote/protocol';
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
});

describe('two taps, safe from a bounce (End piece, Stop all, Mute)', () => {
  const rule = { minMs: 500, windowMs: 6000 };

  it('the first tap arms', () => {
    expect(secondTap(null, 1000, rule)).toBe('arm');
  });

  it('a bounce 60, 120 or 250 ms after the arming tap never confirms, and does not re-arm', () => {
    for (const gap of [60, 120, 250]) expect(secondTap(1000, 1000 + gap, rule)).toBe('ignore');
    expect(secondTap(1000, 1000 + 499, rule)).toBe('ignore');
  });

  it('a second tap 600 ms after the first, inside the window, confirms', () => {
    expect(secondTap(1000, 1600, rule)).toBe('confirm');
    expect(secondTap(1000, 1500, rule)).toBe('confirm');
    expect(secondTap(1000, 1000 + 5999, rule)).toBe('confirm');
  });

  it('is timed from the arming tap, not from the bounces after it', () => {
    // Touches at 0, 60, 250 (one shaky press), then a deliberate tap at 600.
    const armedAt = 1000;
    expect(secondTap(armedAt, 1060, rule)).toBe('ignore');
    expect(secondTap(armedAt, 1250, rule)).toBe('ignore');
    expect(secondTap(armedAt, 1600, rule)).toBe('confirm');
  });

  it('after the window lapses, a tap arms again rather than confirming', () => {
    expect(secondTap(1000, 1000 + 6000, rule)).toBe('arm');
    expect(secondTap(1000, 1000 + 60_000, rule)).toBe('arm');
  });

  it('follows the player setting', () => {
    expect(secondTap(1000, 1600, { minMs: 800, windowMs: 3000 })).toBe('ignore');
    expect(secondTap(1000, 1900, { minMs: 800, windowMs: 3000 })).toBe('confirm');
    expect(secondTap(1000, 4100, { minMs: 800, windowMs: 3000 })).toBe('arm');
  });
});
