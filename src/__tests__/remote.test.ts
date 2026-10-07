import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import {
  dynamicsFromValue, isRemoteCode, makeRemoteCode, parseRemoteMessage, REMOTE_PATH, stripValue,
  STRIP_STEP, tempoFromValue, TEMPO_MAX, TEMPO_MIN, valueFromTempo, valueFromVelocity,
} from '../remote/protocol';
import { allowedFrom, attachRemoteRelay } from '../remote/relay';

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
const settle = () => new Promise((r) => setTimeout(r, 60));

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
