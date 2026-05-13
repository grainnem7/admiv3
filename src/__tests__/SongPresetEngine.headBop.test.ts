import { describe, it, expect, beforeEach, vi } from 'vitest';

// Track each MembraneSynth instance + its triggerAttackRelease.
const membraneTriggerAttackRelease = vi.fn();
const membraneToDestination = vi.fn();

vi.mock('tone', () => {
  // Provide just enough of the Tone surface that SongPresetEngine's
  // constructor + setHeadBopEnabled paths work.  Anything we don't use
  // here is a no-op spy so unrelated engine init paths don't crash.
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

  const MembraneSynth = vi.fn().mockImplementation(() => {
    const node = fakeNode();
    node.toDestination = vi.fn(() => {
      membraneToDestination();
      // Return a synth that has the spied triggerAttackRelease.
      const after = fakeNode();
      after.triggerAttackRelease = membraneTriggerAttackRelease;
      return after;
    });
    return node;
  });

  return {
    Sampler,
    MembraneSynth,
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

import { SongPresetEngine } from '../songs/SongPresetEngine';
import type { FaceLandmarks } from '../state/types';

/**
 * Build a FaceLandmarks payload with all 478 entries at the given Y
 * (only the nose-tip slot — index 1 — actually matters for the bop
 * detector; the others just need to exist so [1] doesn't read undefined).
 */
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

describe('SongPresetEngine head bopping', () => {
  it('does nothing while head bop is disabled', () => {
    const engine = new SongPresetEngine();
    engine.processFaceLandmarks(faceAtY(0.5), 0);
    engine.processFaceLandmarks(faceAtY(0.55), 30);
    engine.processFaceLandmarks(faceAtY(0.5), 60);

    expect(membraneTriggerAttackRelease).not.toHaveBeenCalled();
  });

  it('fires a kick once head bop is enabled and a bop occurs', () => {
    const engine = new SongPresetEngine();
    engine.setHeadBopEnabled(true);

    // Simulate a clean bop: rest → descend → rise.  Need to exceed the
    // default minDownExcursion = 0.025.
    engine.processFaceLandmarks(faceAtY(0.50), 0);
    engine.processFaceLandmarks(faceAtY(0.52), 30);
    engine.processFaceLandmarks(faceAtY(0.56), 60);
    engine.processFaceLandmarks(faceAtY(0.52), 90);  // direction reverses here

    expect(membraneTriggerAttackRelease).toHaveBeenCalledOnce();
    expect(membraneTriggerAttackRelease).toHaveBeenCalledWith('C2', '8n');
  });

  it('toggling head bop off mid-session stops further kicks', () => {
    const engine = new SongPresetEngine();
    engine.setHeadBopEnabled(true);

    // One bop fires.
    engine.processFaceLandmarks(faceAtY(0.50), 0);
    engine.processFaceLandmarks(faceAtY(0.52), 30);
    engine.processFaceLandmarks(faceAtY(0.56), 60);
    engine.processFaceLandmarks(faceAtY(0.52), 90);
    expect(membraneTriggerAttackRelease).toHaveBeenCalledOnce();

    // Disable — subsequent bops should produce no further kicks.
    engine.setHeadBopEnabled(false);
    engine.processFaceLandmarks(faceAtY(0.55), 300);
    engine.processFaceLandmarks(faceAtY(0.60), 330);
    engine.processFaceLandmarks(faceAtY(0.55), 360);

    expect(membraneTriggerAttackRelease).toHaveBeenCalledOnce(); // still 1
  });

  it('null face landmarks are ignored gracefully', () => {
    const engine = new SongPresetEngine();
    engine.setHeadBopEnabled(true);
    engine.processFaceLandmarks(null, 0);
    expect(membraneTriggerAttackRelease).not.toHaveBeenCalled();
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
    // Raise the threshold to 10% — the 0.06-excursion bop below is
    // still above 10%? 0.56-0.50=0.06=6% so should NOT fire.
    engine.setHeadBopSensitivity(0.1, 200);

    engine.processFaceLandmarks(faceAtY(0.50), 0);
    engine.processFaceLandmarks(faceAtY(0.52), 30);
    engine.processFaceLandmarks(faceAtY(0.56), 60);
    engine.processFaceLandmarks(faceAtY(0.52), 90);

    expect(membraneTriggerAttackRelease).not.toHaveBeenCalled();
  });
});
