import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Tone.js — we don't need a real audio context, just assertions about calls.
vi.mock('tone', () => {
  const disposeFn = vi.fn();
  const connectFn = vi.fn();
  const startFn = vi.fn();
  const triggerAttackFn = vi.fn();
  const triggerAttackReleaseFn = vi.fn();
  const releaseAllFn = vi.fn();
  const triggerReleaseFn = vi.fn();

  const mkSynth = () => ({
    connect: connectFn,
    dispose: disposeFn,
    triggerAttack: triggerAttackFn,
    triggerAttackRelease: triggerAttackReleaseFn,
    releaseAll: releaseAllFn,
    triggerRelease: triggerReleaseFn,
    set: vi.fn(),
    maxPolyphony: 8,
  });

  const PolySynth = vi.fn().mockImplementation(mkSynth);
  const FMSynth = vi.fn().mockImplementation(mkSynth);
  const AMSynth = vi.fn().mockImplementation(mkSynth);
  const MonoSynth = vi.fn().mockImplementation(mkSynth);
  const DuoSynth = vi.fn().mockImplementation(mkSynth);
  const Synth = vi.fn().mockImplementation(mkSynth);

  const Chorus = vi.fn().mockImplementation(() => ({
    start: startFn.mockReturnThis(),
    connect: connectFn,
    dispose: disposeFn,
  }));

  return {
    PolySynth, FMSynth, AMSynth, MonoSynth, DuoSynth, Synth, Chorus,
    Frequency: vi.fn(() => ({ toFrequency: () => 440, toNote: () => 'A4' })),
    now: vi.fn(() => 0),
    __mocks: { disposeFn, connectFn, triggerAttackFn, triggerAttackReleaseFn, releaseAllFn, triggerReleaseFn },
  };
});

import * as Tone from 'tone';
import { SynthPlayer, type Player } from '../songs/voices/SynthPlayer';

const fakeDestination = {} as AudioNode;

describe('SynthPlayer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is always ready immediately after construction', () => {
    const p = new SynthPlayer({ kind: 'fm' }, fakeDestination);
    expect(p.isReady()).toBe(true);
  });

  it('constructs a PolySynth for kind="poly"', () => {
    new SynthPlayer({ kind: 'poly' }, fakeDestination);
    expect(Tone.PolySynth).toHaveBeenCalledOnce();
  });

  it('constructs an FMSynth for kind="fm"', () => {
    new SynthPlayer({ kind: 'fm' }, fakeDestination);
    expect(Tone.FMSynth).toHaveBeenCalledOnce();
  });

  it('constructs an AMSynth for kind="am"', () => {
    new SynthPlayer({ kind: 'am' }, fakeDestination);
    expect(Tone.AMSynth).toHaveBeenCalledOnce();
  });

  it('constructs a MonoSynth for kind="mono"', () => {
    new SynthPlayer({ kind: 'mono' }, fakeDestination);
    expect(Tone.MonoSynth).toHaveBeenCalledOnce();
  });

  it('constructs a DuoSynth for kind="duo"', () => {
    new SynthPlayer({ kind: 'duo' }, fakeDestination);
    expect(Tone.DuoSynth).toHaveBeenCalledOnce();
  });

  it('inserts a Chorus when chorusDepth > 0', () => {
    new SynthPlayer({ kind: 'fm', chorusDepth: 0.5 }, fakeDestination);
    expect(Tone.Chorus).toHaveBeenCalledOnce();
  });

  it('skips Chorus when chorusDepth is absent or 0', () => {
    new SynthPlayer({ kind: 'fm' }, fakeDestination);
    expect(Tone.Chorus).not.toHaveBeenCalled();
  });

  it('triggerAttack forwards to the underlying synth', () => {
    const p = new SynthPlayer({ kind: 'fm' }, fakeDestination);
    p.triggerAttack(60, 0.7);
    const { triggerAttackFn } = (Tone as unknown as { __mocks: Record<string, ReturnType<typeof vi.fn>> }).__mocks;
    expect(triggerAttackFn).toHaveBeenCalledOnce();
  });

  it('triggerAttackRelease forwards to the underlying synth', () => {
    const p = new SynthPlayer({ kind: 'fm' }, fakeDestination);
    p.triggerAttackRelease(60, 0.5, 0, 0.8);
    const { triggerAttackReleaseFn } = (Tone as unknown as { __mocks: Record<string, ReturnType<typeof vi.fn>> }).__mocks;
    expect(triggerAttackReleaseFn).toHaveBeenCalledOnce();
  });

  it('releaseAll calls releaseAll on PolySynth', () => {
    const p = new SynthPlayer({ kind: 'poly' }, fakeDestination);
    p.releaseAll();
    const { releaseAllFn } = (Tone as unknown as { __mocks: Record<string, ReturnType<typeof vi.fn>> }).__mocks;
    expect(releaseAllFn).toHaveBeenCalledOnce();
  });

  it('releaseAll calls triggerRelease on monophonic synths', () => {
    const p = new SynthPlayer({ kind: 'mono' }, fakeDestination);
    p.releaseAll();
    const { triggerReleaseFn } = (Tone as unknown as { __mocks: Record<string, ReturnType<typeof vi.fn>> }).__mocks;
    expect(triggerReleaseFn).toHaveBeenCalledOnce();
  });

  it('dispose marks player as not ready and disposes the synth', () => {
    const p = new SynthPlayer({ kind: 'fm', chorusDepth: 0.5 }, fakeDestination);
    p.dispose();
    expect(p.isReady()).toBe(false);
    const { disposeFn } = (Tone as unknown as { __mocks: Record<string, ReturnType<typeof vi.fn>> }).__mocks;
    // Synth + Chorus both disposed
    expect(disposeFn).toHaveBeenCalledTimes(2);
  });

  it('dispose is idempotent', () => {
    const p = new SynthPlayer({ kind: 'fm' }, fakeDestination);
    p.dispose();
    expect(() => p.dispose()).not.toThrow();
  });

  it('Player interface is satisfied by SynthPlayer', () => {
    const p: Player = new SynthPlayer({ kind: 'fm' }, fakeDestination);
    expect(typeof p.isReady).toBe('function');
    expect(typeof p.triggerAttack).toBe('function');
    expect(typeof p.triggerAttackRelease).toBe('function');
    expect(typeof p.releaseAll).toBe('function');
    expect(typeof p.dispose).toBe('function');
  });
});
