import { describe, it, expect, vi, beforeEach } from 'vitest';

const deferred: Array<{ resolve: (v: Map<string, AudioBuffer>) => void }> = [];
vi.mock('../remix/loadStemBuffers', () => ({
  loadStemBuffers: vi.fn(() => new Promise<Map<string, AudioBuffer>>((r) => { deferred.push({ resolve: r }); })),
}));
vi.mock('../remix/layers/loadLoopManifest', () => ({ loadLoopManifest: vi.fn().mockResolvedValue([]) }));
vi.mock('../songs/analysisLoader', () => ({ loadSongAnalysis: vi.fn().mockResolvedValue({ downbeats: [], beats: [] }) }));
vi.mock('tone', () => {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), dispose: vi.fn(), sync: vi.fn().mockReturnThis(),
    start: vi.fn().mockReturnThis(), stop: vi.fn().mockReturnThis(), unsync: vi.fn().mockReturnThis(),
    loop: false, playbackRate: 1, volume: { value: 0 } });
  const Transport = { bpm: { value: 120 }, seconds: 0, start: vi.fn(), stop: vi.fn(), pause: vi.fn(), cancel: vi.fn(), loop: false, loopStart: 0, loopEnd: 0, scheduleOnce: vi.fn(), state: 'stopped' };
  const raw = { currentTime: 0, state: 'running', destination: {},
    createGain: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1, setTargetAtTime: vi.fn() } })),
    createBiquadFilter: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), type: 'lowpass', frequency: { value: 0, setTargetAtTime: vi.fn() }, Q: { value: 0 } })) };
  return { start: vi.fn().mockResolvedValue(undefined), getContext: vi.fn(() => ({ rawContext: raw })),
    getTransport: vi.fn(() => Transport), now: vi.fn(() => 0), connect: vi.fn(),
    Player: vi.fn(() => node()), GrainPlayer: vi.fn(() => node()) };
});

import { RemixEngine } from '../remix/RemixEngine';
import type { SongConfig } from '../songs/songLibrary';

function song(id: string): SongConfig {
  return { id, title: id, artist: 'A', key: 'C', bpm: 120, timeSignature: '4/4',
    stems: { vocals: 'v', drums: 'd', bass: 'b', other: 'o' },
    stemMixer: { label: 'm', leftZone: {}, centerZone: {}, rightZone: {} } } as unknown as SongConfig;
}

beforeEach(() => { deferred.length = 0; vi.clearAllMocks();
  (globalThis as { fetch: typeof fetch }).fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch; });

describe('RemixEngine loadSong race', () => {
  it('a superseded load bails at the first await and never builds stems', async () => {
    // A starts, then B supersedes it before either finishes Tone.start().
    // With the cancellation token, A bails at the Tone.start() guard and
    // never reaches loadStemBuffers — so only B creates a stem-load deferred.
    // Without the guard, BOTH loads reach loadStemBuffers (deferred.length === 2)
    // and A's late continuation overwrites songId back to 'A'.
    const e = new RemixEngine();
    const pA = e.loadSong(song('A'));
    const pB = e.loadSong(song('B'));

    // Let the Tone.start() microtasks settle. The superseded A must NOT
    // reach loadStemBuffers, so exactly one deferred (B's) should exist.
    await vi.waitFor(() => expect(deferred.length).toBeGreaterThanOrEqual(1));
    expect(deferred.length).toBe(1);

    const buf = new Map([['vocals', { duration: 4 } as AudioBuffer]]);
    deferred[0].resolve(buf);
    await pB;
    await pA;

    expect((e as unknown as { songId: string }).songId).toBe('B');
  });
});
