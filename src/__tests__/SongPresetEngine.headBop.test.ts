import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------
// Tone mock — exposes per-instrument triggerAttackRelease spies so
// tests can distinguish kick / snare / crash calls.  Use vi.hoisted
// because vi.mock factories run before any top-level code; plain
// module-level vi.fn() refs aren't visible inside the factory.
// ---------------------------------------------------------------

const { kickTrigger, snareTrigger, hatTrigger, crashTrigger } = vi.hoisted(() => ({
  kickTrigger: vi.fn(),
  snareTrigger: vi.fn(),
  hatTrigger: vi.fn(),
  crashTrigger: vi.fn(),
}));

vi.mock('tone', () => {
  const fakeGain = () => ({
    value: 1,
    setTargetAtTime: vi.fn(),
    rampTo: vi.fn(),
  });
  const fakeNode = () => ({
    connect: vi.fn(() => fakeNode()),
    disconnect: vi.fn(),
    chain: vi.fn(),
    toDestination: vi.fn(() => fakeNode()),
    dispose: vi.fn(),
    gain: fakeGain(),
    wet: fakeGain(),
    set: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    triggerAttack: vi.fn(),
    triggerRelease: vi.fn(),
    triggerAttackRelease: vi.fn(),
    releaseAll: vi.fn(),
    bpm: { value: 100 },
    seconds: 0,
  });

  const Sampler = vi.fn().mockImplementation((opts: { onload?: () => void }) => {
    opts.onload?.();
    return fakeNode();
  });

  // Build a synth factory that returns a node carrying the given
  // `triggerSpy` as its triggerAttackRelease — letting tests assert
  // which drum was hit.  The kit now calls .connect(...) (which returns
  // the node, Tone-style) and triggers on the node itself.
  const synthWith = (triggerSpy: ReturnType<typeof vi.fn>) =>
    vi.fn().mockImplementation(() => {
      const node = fakeNode();
      node.connect = vi.fn(() => node); // .connect() returns the node (Tone-style)
      node.triggerAttackRelease = triggerSpy;
      return node;
    });

  return {
    Sampler,
    // MembraneSynth → kick.  NoiseSynth → both snare and hat (the kit
    // builds two NoiseSynth instances).  MetalSynth → crash.
    // For the NoiseSynth case, we track every instance and route
    // their toDestination() through a shared spy each, but the kit
    // builds them in order: snare first if a snare beat hits, hat
    // first if a hat beat hits.  In the tests we either avoid that
    // ambiguity or assert on call counts across both spies.
    MembraneSynth: synthWith(kickTrigger),
    NoiseSynth: vi.fn().mockImplementation(() => {
      const node = fakeNode();
      node.connect = vi.fn(() => node); // .connect() returns the node (Tone-style)
      // Use the snare spy for both NoiseSynth instances (snare + hat).
      // The kit builds two NoiseSynth instances — first
      // triggerAttackRelease call on each goes to distinct spies.  For
      // simplicity, we lump both into snareTrigger since none of the
      // current tests need to distinguish them.
      node.triggerAttackRelease = snareTrigger;
      return node;
    }),
    MetalSynth: synthWith(crashTrigger),
    Reverb: vi.fn().mockImplementation(() => fakeNode()),
    Filter: vi.fn().mockImplementation(() => fakeNode()),
    Gain: vi.fn().mockImplementation(() => fakeNode()),
    PolySynth: vi.fn().mockImplementation(() => fakeNode()),
    MonoSynth: vi.fn().mockImplementation(() => fakeNode()),
    FMSynth: vi.fn().mockImplementation(() => fakeNode()),
    Synth: vi.fn().mockImplementation(() => fakeNode()),
    Frequency: vi.fn(() => ({ toNote: () => 'C4', toFrequency: () => 261.63 })),
    getDestination: vi.fn(() => fakeNode()),
    getTransport: vi.fn(() => fakeNode()),
    getContext: vi.fn(() => ({ rawContext: {} })),
    now: vi.fn(() => 0),
    start: vi.fn(),
    setContext: vi.fn(),
  };
});

// silence the unused warning while still leaving the spy available
// to future tests that distinguish hat from snare.
void hatTrigger;

import { SongPresetEngine } from '../songs/SongPresetEngine';
import type { FaceLandmarks } from '../state/types';

function faceAtY(y: number): FaceLandmarks {
  const landmarks = Array.from({ length: 478 }, () => ({
    x: 0.5, y: 0.5, z: 0, visibility: 1,
  }));
  landmarks[1] = { x: 0.5, y, z: 0, visibility: 1 };
  return { landmarks, blendshapes: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/** Feed a clean down-up bop ramp.  Default amplitude crosses the threshold. */
function feedOneBop(
  engine: SongPresetEngine,
  startTimeMs: number,
  baseY = 0.50,
  bottomY = 0.56,
): void {
  engine.processFaceLandmarks(faceAtY(baseY), startTimeMs);
  engine.processFaceLandmarks(faceAtY(baseY + 0.02), startTimeMs + 30);
  engine.processFaceLandmarks(faceAtY(bottomY), startTimeMs + 60);
  engine.processFaceLandmarks(faceAtY(baseY + 0.02), startTimeMs + 90);
}

describe('SongPresetEngine head bopping', () => {
  it('does nothing while head bop is disabled', () => {
    const engine = new SongPresetEngine();
    feedOneBop(engine, 0);
    expect(kickTrigger).not.toHaveBeenCalled();
    expect(snareTrigger).not.toHaveBeenCalled();
    expect(crashTrigger).not.toHaveBeenCalled();
  });

  it('fires a kick on a bop with no song loaded (no beat data → default kick)', () => {
    const engine = new SongPresetEngine();
    engine.setHeadBopEnabled(true);
    feedOneBop(engine, 0);

    expect(kickTrigger).toHaveBeenCalledOnce();
    // 4-arg shape: note, duration, time, velocity.
    expect(kickTrigger.mock.calls[0][0]).toBe('C2');
    expect(kickTrigger.mock.calls[0][1]).toBe('8n');
    expect(snareTrigger).not.toHaveBeenCalled();
    expect(crashTrigger).not.toHaveBeenCalled();
  });

  it('plays immediately (no queued burst) when beat-snap is on but transport is stopped', () => {
    const engine = new SongPresetEngine();
    engine.setHeadBopEnabled(true);
    // Beat-snap on + a beat grid, but never played (transport stopped). Without
    // the fix this would queue a pending bop that only the play-loop flushes,
    // so the drum would pile up and burst on Play; with the fix it fires now.
    const priv = engine as unknown as {
      beatSnap: boolean;
      song: { beats: number[]; downbeats: number[] };
    };
    priv.beatSnap = true;
    priv.song = { beats: [0, 0.5, 1.0, 1.5], downbeats: [0] };
    feedOneBop(engine, 0);
    expect(kickTrigger).toHaveBeenCalled(); // fired immediately, not deferred
  });

  it('amplitude scales the kick velocity (small nod → low, big nod → high)', () => {
    const engine = new SongPresetEngine();
    engine.setHeadBopEnabled(true);

    // Small bop: ~3% excursion.
    feedOneBop(engine, 0, 0.5, 0.53);
    const smallCalls = kickTrigger.mock.calls;
    const smallCallVelocity = smallCalls[smallCalls.length - 1]?.[3] as number;

    // Reset detector via toggle (drops state) before next bop.
    engine.setHeadBopEnabled(false);
    engine.setHeadBopEnabled(true);
    kickTrigger.mockClear();

    // Big bop: ~9% excursion (saturates the velocity ramp).
    feedOneBop(engine, 1000, 0.5, 0.59);
    const bigCalls = kickTrigger.mock.calls;
    const bigCallVelocity = bigCalls[bigCalls.length - 1]?.[3] as number;

    expect(smallCallVelocity).toBeGreaterThan(0);
    expect(bigCallVelocity).toBeGreaterThan(smallCallVelocity);
    expect(bigCallVelocity).toBeLessThanOrEqual(1.0);
  });

  it('toggling head bop off mid-session stops further hits', () => {
    const engine = new SongPresetEngine();
    engine.setHeadBopEnabled(true);

    feedOneBop(engine, 0);
    expect(kickTrigger).toHaveBeenCalledOnce();

    engine.setHeadBopEnabled(false);
    feedOneBop(engine, 1000);
    expect(kickTrigger).toHaveBeenCalledOnce(); // still 1
  });

  it('null face landmarks are ignored gracefully', () => {
    const engine = new SongPresetEngine();
    engine.setHeadBopEnabled(true);
    engine.processFaceLandmarks(null, 0);
    expect(kickTrigger).not.toHaveBeenCalled();
  });

  it('isHeadBopEnabled reflects the toggle state', () => {
    const engine = new SongPresetEngine();
    expect(engine.isHeadBopEnabled()).toBe(false);
    engine.setHeadBopEnabled(true);
    expect(engine.isHeadBopEnabled()).toBe(true);
    engine.setHeadBopEnabled(false);
    expect(engine.isHeadBopEnabled()).toBe(false);
  });

  it('setHeadBopSensitivity changes the detector threshold live', () => {
    const engine = new SongPresetEngine();
    engine.setHeadBopEnabled(true);
    engine.setHeadBopSensitivity(0.1, 200); // 10% threshold

    // 6% excursion below new threshold → no bop.
    feedOneBop(engine, 0, 0.5, 0.56);
    expect(kickTrigger).not.toHaveBeenCalled();
  });
});
