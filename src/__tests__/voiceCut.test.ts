import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Players that record what they were asked to play, so a test can see which one sounds.
const { samplers, synths } = vi.hoisted(() => ({
  samplers: [] as { triggerAttackRelease: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; dest: unknown }[],
  synths: [] as { play: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[],
}));
vi.mock('../songs/voices/SamplerPlayer', () => ({
  SAMPLE_CONFIGS: { piano: { urls: {}, baseUrl: '' }, padChoir: { urls: {}, baseUrl: '' }, electricPiano: { urls: {}, baseUrl: '' } },
  SamplerPlayer: class {
    triggerAttackRelease = vi.fn(); dispose = vi.fn(); dest: unknown;
    constructor(_cfg: unknown, dest: unknown) { this.dest = dest; samplers.push(this); }
    isReady(): boolean { return true; }
  },
}));
vi.mock('../audio/worlds/synthLayers', () => ({
  createSynthLayer: vi.fn(() => {
    const s = { play: vi.fn(), connect: vi.fn(), dispose: vi.fn() };
    synths.push(s);
    return s;
  }),
}));

import { BoardSequencerVoice } from '../songs/voices/BoardSequencerVoice';

interface FakeGain { gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn>; cancelScheduledValues: ReturnType<typeof vi.fn>; setValueAtTime: ReturnType<typeof vi.fn> }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }
function fakeCtx(): { ctx: AudioContext; gains: FakeGain[] } {
  const gains: FakeGain[] = [];
  const ctx = {
    currentTime: 3,
    createGain: () => {
      const g: FakeGain = { gain: { value: 1, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
      gains.push(g);
      return g;
    },
    createBiquadFilter: () => ({ type: '', frequency: { value: 0 }, Q: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }),
  } as unknown as AudioContext;
  return { ctx, gains };
}

/**
 * New loop has to be silent at once, as Stop is: a note already ringing (a bass note
 * held for a whole bar) or already queued must not carry on under "silent". A voice can
 * be cut: its notes fade in a few milliseconds and it plays on with fresh players.
 */
describe('a voice cut short (T1-02)', () => {
  beforeEach(() => { vi.useFakeTimers(); samplers.length = 0; synths.length = 0; });
  afterEach(() => { vi.useRealTimers(); });

  it('a sampled voice: its notes fade out at once, the next note comes from a fresh player, the old one is freed', () => {
    const { ctx, gains } = fakeCtx();
    const v = new BoardSequencerVoice(ctx, 'piano');
    v.play(60, 0.8, 2.8, 3);
    expect(samplers).toHaveLength(1);
    expect(samplers[0].triggerAttackRelease).toHaveBeenCalledTimes(1);
    const lane = gains.find((g) => g === samplers[0].dest);
    expect(lane).toBeDefined();

    v.cut();
    // The old notes go: their lane falls to silence from now.
    expect(lane?.gain.setTargetAtTime).toHaveBeenCalledWith(0, 3, expect.any(Number));
    expect(lane?.gain.setTargetAtTime.mock.calls[0][2]).toBeLessThanOrEqual(0.01);
    // The next note is played by a new player, into a lane of its own.
    expect(samplers).toHaveLength(2);
    expect(samplers[1].dest).not.toBe(lane);
    v.play(62, 0.8, 0.5, 3.2);
    expect(samplers[1].triggerAttackRelease).toHaveBeenCalledTimes(1);
    expect(samplers[0].triggerAttackRelease).toHaveBeenCalledTimes(1);
    // The old player is freed once its fade is over, not before.
    expect(samplers[0].dispose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(samplers[0].dispose).toHaveBeenCalled();
    expect(lane?.disconnect).toHaveBeenCalled();
  });

  it('a world voice (sample and synth layer): both are cut and both start afresh', () => {
    const { ctx } = fakeCtx();
    const v = new BoardSequencerVoice(ctx, { sample: 'piano', sampleLevel: 0.7, synth: 'pad', synthLevel: 0.8 });
    expect(samplers).toHaveLength(1);
    expect(synths).toHaveLength(1);
    v.cut();
    expect(samplers).toHaveLength(2);
    expect(synths).toHaveLength(2);
    v.play(60, 0.8, 1, 4);
    expect(synths[1].play).toHaveBeenCalledTimes(1);
    expect(synths[0].play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(synths[0].dispose).toHaveBeenCalled();
    expect(samplers[0].dispose).toHaveBeenCalled();
  });

  it('disposed after a cut: the fresh players go too, and the old ones are not freed twice', () => {
    const { ctx } = fakeCtx();
    const v = new BoardSequencerVoice(ctx, 'piano');
    v.cut();
    v.dispose();
    expect(samplers[1].dispose).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    expect(samplers[0].dispose).toHaveBeenCalledTimes(1);
  });
});
