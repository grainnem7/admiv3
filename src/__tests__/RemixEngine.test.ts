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
    Player: vi.fn().mockImplementation((opts: AudioBuffer | { onload?: () => void }) => {
      // Support both `new Tone.Player(buffer)` and `new Tone.Player({ url, onload })`
      if (opts && typeof opts === 'object' && 'onload' in opts) {
        (opts as { onload?: () => void }).onload?.();
      }
      return {
        buffer: opts,
        loop: false,
        sync: vi.fn().mockReturnThis(),
        start: vi.fn().mockReturnThis(),
        stop: vi.fn().mockReturnThis(),
        unsync: vi.fn().mockReturnThis(),
        connect: vi.fn(),
        dispose: vi.fn(),
        volume: { value: 0 },
      };
    }),
    GrainPlayer: vi.fn().mockImplementation((opts: { onload?: () => void }) => {
      opts?.onload?.();
      return {
        playbackRate: 1,
        loop: false,
        sync: vi.fn().mockReturnThis(),
        start: vi.fn().mockReturnThis(),
        stop: vi.fn().mockReturnThis(),
        unsync: vi.fn().mockReturnThis(),
        connect: vi.fn(),
        dispose: vi.fn(),
      };
    }),
  };
});

vi.mock('../remix/layers/loadLoopManifest', () => ({
  loadLoopManifest: vi.fn().mockResolvedValue([
    { file: 'a_120bpm.wav', name: 'A', bpm: 120 },
    { file: 'b_140bpm.wav', name: 'B', bpm: 140 },
  ]),
}));

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
import type { PercussionLayer } from '../remix/layers/PercussionLayer';
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

    e.applyBaton({ stem: 'vocals', filterNorm: 1, cycled: false, shake: false, dwellProgress: 0 });
    e.renderFrame(0);
    expect(e.getStemStates().vocals.filterNorm).toBeGreaterThan(0);

    const before = e.getStemStates().vocals.filterNorm;
    e.applyBaton({ stem: 'vocals', filterNorm: null, cycled: false, shake: false, dwellProgress: 0 });
    e.renderFrame(16);
    expect(e.getStemStates().vocals.filterNorm).toBeCloseTo(before, 2);
    e.dispose();
  });

  it('glide-takeover ramps a re-focused stem rather than snapping', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());
    e.applyBaton({ stem: 'drums', filterNorm: 0.2, cycled: false, shake: false, dwellProgress: 0 });
    e.renderFrame(0);
    e.applyBaton({ stem: 'drums', filterNorm: 1, cycled: true, shake: false, dwellProgress: 0 });
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


  it('creates a synced Tone.Player per stem on load', async () => {
    const Tone = await import('tone');
    const PlayerMock = Tone.Player as unknown as { mock: { calls: unknown[] } };
    const callsBefore = PlayerMock.mock.calls.length;
    const e = new RemixEngine();
    await e.loadSong(song());
    // 4 stem players + 1 loop player: the round-robin drum kit loads async from
    // a fetched manifest this mock's fetch doesn't supply (→ 0 drum players), and
    // the loop manifest's 120bpm loop at song 120bpm needs no stretch, so the loop
    // layer builds it as a plain Tone.Player (the 140bpm loop builds a GrainPlayer).
    expect(PlayerMock.mock.calls.length - callsBefore).toBe(5);
    e.dispose();
  });

  it('sets loop=true on every stem player', async () => {
    const Tone = await import('tone');
    const PlayerMock = Tone.Player as unknown as { mock: { results: { value: { loop: boolean } }[] } };
    const before = PlayerMock.mock.results.length;
    const e = new RemixEngine();
    await e.loadSong(song());
    const created = PlayerMock.mock.results.slice(before);
    // 4 stem players (loop=true); the round-robin kit adds none under this mock.
    const stemPlayers = created.filter((r) => r.value.loop === true);
    expect(stemPlayers.length).toBe(4);
    e.dispose();
  });

  function songWithBars(): SongConfig {
    const s = song();
    s.beats = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8];
    s.downbeats = [0, 1, 2, 3, 4, 5, 6, 7, 8]; // 8 bars, 1s each
    return s;
  }

  /** Build a minimal FaceLandmarks with landmark[1].y = y (nose tip). */
  function makeFace(y: number) {
    const lm = (yy: number) => ({ x: 0.5, y: yy, z: 0, visibility: 1 });
    return {
      landmarks: [lm(0.5), lm(y)],
      blendshapes: [],
    };
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

  it('adds a disabled percussion layer on load and exposes layer controls', async () => {
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    // @ts-expect-error private — inspect the layers map
    const layer = e.layers.get('percussion') as PercussionLayer;
    expect(layer).toBeTruthy();
    expect(layer.kind).toBe('percussion');
    expect(() => e.setLayerEnabled('percussion', true)).not.toThrow();
    expect(() => e.setLayerVolume('percussion', 0.5)).not.toThrow();
    e.dispose();
  });

  it('triggerPercussion fires the layer only when enabled', async () => {
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    // @ts-expect-error private
    const layer = e.layers.get('percussion') as PercussionLayer;
    const hitSpy = vi.spyOn(layer, 'hit');
    e.triggerPercussion(0, 0.8);
    expect(hitSpy).not.toHaveBeenCalled();      // disabled
    e.setLayerEnabled('percussion', true);
    e.triggerPercussion(0, 0.8);
    expect(hitSpy).toHaveBeenCalledWith(0, 0.8); // enabled
    e.dispose();
  });

  it('a head nod calls triggerPercussion when percussion is enabled', async () => {
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    e.setLayerEnabled('percussion', true);
    e.setHeadNodEnabled(true);
    e.setHeadNodSensitivity(0.02, 100);
    // @ts-expect-error private
    const layer = e.layers.get('percussion') as PercussionLayer;
    const hitSpy = vi.spyOn(layer, 'hit');
    let t = 0;
    e.processFaceLandmarks(makeFace(0.40), (t += 16));
    e.processFaceLandmarks(makeFace(0.45), (t += 16));
    e.processFaceLandmarks(makeFace(0.50), (t += 16));
    e.processFaceLandmarks(makeFace(0.45), (t += 16)); // bop
    expect(hitSpy).toHaveBeenCalled();
    e.dispose();
  });

});

describe('RemixEngine loop layer', () => {
  it('builds a loop layer from the manifest after loadSong', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());
    const info = e.getLoopInfo();
    expect(info.count).toBe(2);
    expect(info.names).toEqual(['A', 'B']);
    expect(info.activeIndex).toBe(0);
    e.dispose();
  });

  it('applyLoopBaton enables + selects + sets volume when present', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());
    e.applyLoopBaton({ present: true, loopIndex: 1, volume: 0.5 });
    expect(e.getLoopInfo().activeIndex).toBe(1);
    expect(e.getLayer('loop')?.isEnabled()).toBe(true);
    e.dispose();
  });

  it('applyLoopBaton disables the layer when absent', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());
    e.applyLoopBaton({ present: true, loopIndex: 1, volume: 0.5 });
    e.applyLoopBaton({ present: false, loopIndex: 1, volume: 0.5 });
    expect(e.getLayer('loop')?.isEnabled()).toBe(false);
    e.dispose();
  });
});

describe('RemixEngine recording', () => {
  it('captures stem filter + percussion into a take on section advance', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());
    e.armRecording();
    expect(e.isRecording()).toBe(true);
    e.setStemFilterNorm('vocals', 0.7);
    e.triggerPercussion(0.5, 0.9);
    e.advanceSection();
    const arr = e.getArrangement();
    const allEvents = arr.sections.flatMap((s) => s.layers.flatMap((l) => l.events));
    expect(allEvents.some((ev) => ev.kind === 'stemFilter')).toBe(true);
    expect(allEvents.some((ev) => ev.kind === 'percussion')).toBe(true);
    e.dispose();
  });

  it('does not capture when not recording', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());
    e.setStemFilterNorm('vocals', 0.7);
    e.armRecording();
    e.advanceSection();
    const arr = e.getArrangement();
    const allEvents = arr.sections.flatMap((s) => s.layers.flatMap((l) => l.events));
    expect(allEvents).toHaveLength(0);
    e.dispose();
  });

  it('disarmRecording stops capture', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());
    e.armRecording();
    e.disarmRecording();
    expect(e.isRecording()).toBe(false);
    e.dispose();
  });
});

describe('RemixEngine arrangement playback', () => {
  it('playArrangement applies composited stem filter for the section under the playhead', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());
    e.loadArrangement({
      songId: 't',
      sections: [{ originBar: 0, lengthBars: 8, layers: [
        { id: 'k1', muted: false, events: [{ t: 0, kind: 'stemFilter', stem: 'vocals', value: 0.9 }] },
      ] }],
    });
    e.playArrangement();
    expect(e.isPlayingArrangement()).toBe(true);
    e.renderFrame(0.0);
    e.renderFrame(0.1);
    expect(e.getStemFilterNorm('vocals')).toBeCloseTo(0.9, 5);
    e.stopArrangement();
    expect(e.isPlayingArrangement()).toBe(false);
    e.dispose();
  });

  it('muteTake and deleteTake delegate to the arranger', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());
    e.loadArrangement({
      songId: 't',
      sections: [{ originBar: 0, lengthBars: 8, layers: [
        { id: 'k1', muted: false, events: [] },
        { id: 'k2', muted: false, events: [] },
      ] }],
    });
    e.muteTake(0, 'k1', true);
    expect(e.getArrangement().sections[0].layers[0].muted).toBe(true);
    e.deleteTake(0, 'k2');
    expect(e.getArrangement().sections[0].layers.map((l) => l.id)).toEqual(['k1']);
    e.dispose();
  });

  it('loadSong cancels in-progress remix playback', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());
    e.playArrangement();
    expect(e.isPlayingArrangement()).toBe(true);
    await e.loadSong(song());
    expect(e.isPlayingArrangement()).toBe(false);
    e.dispose();
  });

  it('recording and remix playback are mutually exclusive', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());
    e.armRecording();
    e.playArrangement();
    expect(e.isRecording()).toBe(false); // playback disarmed recording
    e.armRecording();
    expect(e.isPlayingArrangement()).toBe(false); // arming stopped playback
    e.dispose();
  });
});
