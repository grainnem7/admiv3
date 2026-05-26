import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('tone', () => {
  const Transport = {
    bpm: { value: 120 },
    seconds: 0,
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    cancel: vi.fn(),
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    scheduleOnce: vi.fn(),
    state: 'stopped',
  };
  return {
    start: vi.fn().mockResolvedValue(undefined),
    getContext: vi.fn(() => ({ rawContext: makeRawCtx() })),
    getTransport: vi.fn(() => Transport),
    now: vi.fn(() => 0),
    Player: vi.fn().mockImplementation((buffer: AudioBuffer) => ({
      buffer,
      loop: false,
      sync: vi.fn().mockReturnThis(),
      start: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      unsync: vi.fn().mockReturnThis(),
      connect: vi.fn(),
      dispose: vi.fn(),
    })),
  };
});

function makeParam() {
  return {
    value: 0,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
}
function makeNode() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: makeParam(),
    frequency: makeParam(),
    Q: makeParam(),
    type: 'lowpass',
  };
}
function makeRawCtx() {
  return {
    currentTime: 0,
    state: 'running',
    createGain: vi.fn(() => makeNode()),
    createBiquadFilter: vi.fn(() => makeNode()),
    createBufferSource: vi.fn(() => ({
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
      buffer: null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      onended: null,
    })),
    decodeAudioData: vi.fn().mockResolvedValue({ duration: 8 }),
    destination: {},
  };
}

import { RemixEngine } from '../remix/RemixEngine';
import type { SongConfig } from '../songs/songLibrary';

function song(): SongConfig {
  return {
    id: 't', title: 'T', artist: 'A', key: 'C', bpm: 120,
    timeSignature: '4/4',
    stems: { vocals: 'v.wav', drums: 'd.wav', bass: 'b.wav', other: 'o.wav' },
    stemMixer: {
      label: 'm',
      leftZone: { vocals: 1, drums: 0, bass: 0, other: 0 },
      centerZone: { vocals: 1, drums: 0.5, bass: 0.5, other: 0.5 },
      rightZone: { vocals: 1, drums: 1, bass: 1, other: 1 },
    },
    beats: [0, 0.5, 1.0, 1.5, 2.0],
    downbeats: [0, 2.0],
  };
}

beforeEach(() => {
  (globalThis as { fetch: typeof fetch }).fetch = vi.fn().mockResolvedValue({
    ok: true, status: 200,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  }) as unknown as typeof fetch;
});

describe('RemixEngine', () => {
  it('loads all four stems silent (build-from-silence)', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());
    const st = e.getStemStates();
    for (const id of ['vocals', 'drums', 'bass', 'other'] as const) {
      expect(st[id].gain).toBe(0);
      expect(st[id].filterNorm).toBe(0);
    }
    e.dispose();
  });

  it('raising a baton Y brings its stem in; absence latches it', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());

    e.applyBaton({ stem: 'vocals', filterNorm: 1, cycled: false, stutter: false, dwellProgress: 0 });
    e.renderFrame(0);
    expect(e.getStemStates().vocals.filterNorm).toBeGreaterThan(0);

    const before = e.getStemStates().vocals.filterNorm;
    e.applyBaton({ stem: 'vocals', filterNorm: null, cycled: false, stutter: false, dwellProgress: 0 });
    e.renderFrame(16);
    expect(e.getStemStates().vocals.filterNorm).toBeCloseTo(before, 2);
    e.dispose();
  });

  it('glide-takeover ramps a re-focused stem rather than snapping', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());
    e.applyBaton({ stem: 'drums', filterNorm: 0.2, cycled: false, stutter: false, dwellProgress: 0 });
    e.renderFrame(0);
    e.applyBaton({ stem: 'drums', filterNorm: 1, cycled: true, stutter: false, dwellProgress: 0 });
    e.renderFrame(16);
    const v = e.getStemStates().drums.filterNorm;
    expect(v).toBeGreaterThan(0.2);
    expect(v).toBeLessThan(1); // still gliding, not snapped
    e.dispose();
  });

  it('dispose tears down without throwing', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());
    expect(() => e.dispose()).not.toThrow();
  });

  it('ducks the main stem gain to 0 while a stutter burst owns the sound', async () => {
    const Tone = await import('tone');

    // Record how many getContext calls have happened before this test
    const getContextMock = Tone.getContext as ReturnType<typeof vi.fn>;
    const callsBefore = getContextMock.mock.results.length;

    const e = new RemixEngine();
    await e.loadSong(song());
    e.play();

    // Grab the raw context used by this engine instance (the call made during loadSong)
    const rawCtx = getContextMock.mock.results[callsBefore].value.rawContext;

    // Render with drums audible (non-stutter frame)
    e.applyBaton({ stem: 'drums', filterNorm: 1, cycled: false, stutter: false, dwellProgress: 0 });
    e.renderFrame(0);

    // Collect all GainNodes created for this engine and clear prior calls
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gainMock = rawCtx.createGain as ReturnType<typeof vi.fn>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allGainNodes = gainMock.mock.results.map((r: any) => r.value as ReturnType<typeof makeNode>);
    allGainNodes.forEach(n => (n.gain.setTargetAtTime as ReturnType<typeof vi.fn>).mockClear());

    // Trigger stutter — startOverlay must duck n.gain to 0 immediately
    e.applyBaton({ stem: 'drums', filterNorm: 1, cycled: false, stutter: true, dwellProgress: 0 });
    e.renderFrame(0);

    // At least one GainNode must have received setTargetAtTime(0, ...) — the duck
    const ducked = allGainNodes.some((n: ReturnType<typeof makeNode>) =>
      (n.gain.setTargetAtTime as ReturnType<typeof vi.fn>).mock.calls.some(
        (call: unknown[]) => call[0] === 0,
      ),
    );
    expect(ducked).toBe(true);

    e.dispose();
  });

  it('creates a synced Tone.Player per stem on load', async () => {
    const Tone = await import('tone');
    const PlayerMock = Tone.Player as unknown as { mock: { calls: unknown[] } };
    const callsBefore = PlayerMock.mock.calls.length;
    const e = new RemixEngine();
    await e.loadSong(song());
    // 4 stems → 4 Player constructions.
    expect(PlayerMock.mock.calls.length - callsBefore).toBe(4);
    e.dispose();
  });

  it('sets loop=true on every stem player', async () => {
    const Tone = await import('tone');
    const PlayerMock = Tone.Player as unknown as { mock: { results: { value: { loop: boolean } }[] } };
    const before = PlayerMock.mock.results.length;
    const e = new RemixEngine();
    await e.loadSong(song());
    const created = PlayerMock.mock.results.slice(before);
    expect(created.length).toBe(4);
    expect(created.every((r) => r.value.loop === true)).toBe(true);
    e.dispose();
  });

  function songWithBars(): SongConfig {
    const s = song();
    s.beats = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8];
    s.downbeats = [0, 1, 2, 3, 4, 5, 6, 7, 8]; // 8 bars, 1s each
    return s;
  }

  it('applies a default 8-bar loop on load and sets Transport loop points', async () => {
    const Tone = await import('tone');
    const t = Tone.getTransport();
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    expect(t.loop).toBe(true);
    expect(t.loopStart).toBe(0);
    expect(t.loopEnd).toBe(8); // 8 bars from origin 0
    expect(e.getLoopRegion()).toEqual({ startSec: 0, endSec: 8, lengthBars: 8, originBar: 0 });
    e.dispose();
  });

  it('setLoopLengthBars(4) tightens the window to 4 bars', async () => {
    const Tone = await import('tone');
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    e.setLoopLengthBars(4);
    expect(Tone.getTransport().loopEnd).toBe(4);
    expect(e.getLoopRegion()).toEqual({ startSec: 0, endSec: 4, lengthBars: 4, originBar: 0 });
    e.dispose();
  });

  it('nudgeLoop steps the window forward and clamps at the end', async () => {
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    e.setLoopLengthBars(4);
    e.nudgeLoop(1);
    expect(e.getLoopRegion()).toEqual({ startSec: 4, endSec: 8, lengthBars: 4, originBar: 4 });
    e.nudgeLoop(1); // clamps (lastValidOrigin = 8-4 = 4)
    expect(e.getLoopRegion()?.originBar).toBe(4);
    e.dispose();
  });

  it('setLoopLengthBars(0) turns looping off (whole song)', async () => {
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    e.setLoopLengthBars(0);
    const r = e.getLoopRegion();
    expect(r).not.toBeNull();
    expect(r!.lengthBars).toBe(0);
    expect(r!.startSec).toBe(0);
    e.dispose();
  });

  it('setStemFilterNorm writes the target for the named stem (clamped)', async () => {
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    e.setStemFilterNorm('drums', 1.5); // clamps to 1
    e.renderFrame(0);
    expect(e.getStemStates().drums.filterNorm).toBeGreaterThan(0.9);
    e.dispose();
  });

  it('setFocusedStem + triggerStutterFor(focused) starts a burst', async () => {
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    e.play();
    e.setFocusedStem('bass');
    expect(e.getFocusedStem()).toBe('bass');
    e.triggerStutterFor(e.getFocusedStem());
    e.renderFrame(0);
    expect(e.getStemStates().bass.stuttering).toBe(true);
    e.dispose();
  });

  it('restores the stem gain after a stutter burst ends', async () => {
    const Tone = await import('tone');

    // Record context call count before this test (same isolation pattern as the duck test)
    const getContextMock = Tone.getContext as ReturnType<typeof vi.fn>;
    const callsBefore = getContextMock.mock.results.length;

    const e = new RemixEngine();
    await e.loadSong(song());
    e.play();

    // Grab the raw context used by this engine instance
    const rawCtx = getContextMock.mock.results[callsBefore].value.rawContext;
    const gainMock = rawCtx.createGain as ReturnType<typeof vi.fn>;

    // Step 1: bring drums audible, render a non-stutter frame
    e.applyBaton({ stem: 'drums', filterNorm: 1, cycled: false, stutter: false, dwellProgress: 0 });
    e.renderFrame(0);

    // Step 2: trigger a stutter burst, verify stuttering is true
    e.applyBaton({ stem: 'drums', filterNorm: 1, cycled: false, stutter: true, dwellProgress: 0 });
    e.renderFrame(0);
    expect(e.getStemStates().drums.stuttering).toBe(true);

    // Step 3: advance well past the burst window (startSec=0, burstDurSec=2.0) and render
    // This makes StutterScheduler.tick end the burst (1000 >= 0 + 2.0).
    e.renderFrame(1000);
    expect(e.getStemStates().drums.stuttering).toBe(false);

    // Step 4: clear all gain mock histories so we only observe post-burst writes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allGainNodes = gainMock.mock.results.map((r: any) => r.value as ReturnType<typeof makeNode>);
    allGainNodes.forEach(n => (n.gain.setTargetAtTime as ReturnType<typeof vi.fn>).mockClear());

    // Step 5: render one more frame — the !stuttering guard is now lifted, so the
    // normal taper gain (remixTaper(1).gain === 1) must be written to the drums GainNode.
    e.renderFrame(1016);

    // At least one GainNode must have received setTargetAtTime with a value > 0
    const restored = allGainNodes.some((n: ReturnType<typeof makeNode>) =>
      (n.gain.setTargetAtTime as ReturnType<typeof vi.fn>).mock.calls.some(
        (call: unknown[]) => (call[0] as number) > 0,
      ),
    );
    expect(restored).toBe(true);

    e.dispose();
  });
});
