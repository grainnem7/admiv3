import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const voices = vi.hoisted(() => ({
  made: [] as { sound: unknown; play: ReturnType<typeof vi.fn>; ready: boolean }[],
  readyAfterMs: 100 as number | null,
}));
vi.mock('tone', () => ({ now: vi.fn(() => 10), getContext: vi.fn(() => ({ rawContext: {} })) }));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(async () => {}), getInput: () => ({ input: {} }) }) }));
vi.mock('../songs/voices/BoardSequencerVoice', () => ({
  BoardSequencerVoice: class {
    play = vi.fn();
    connect = vi.fn();
    dispose = vi.fn();
    entry: { sound: unknown; play: ReturnType<typeof vi.fn>; ready: boolean };
    constructor(_ctx: unknown, sound: unknown) {
      this.entry = { sound, play: this.play, ready: false };
      voices.made.push(this.entry);
      const after = voices.readyAfterMs;
      if (after !== null) setTimeout(() => { this.entry.ready = true; }, after);
    }
    isReady(): boolean { return this.entry.ready; }
  },
}));
vi.mock('../audio/instruments/RoundRobinDrumKit', () => ({
  RoundRobinDrumKit: class { play = vi.fn(); connect = vi.fn(); isReady = () => true; dispose = vi.fn(); },
}));

import { previewPhrase, SoundAuditioner } from '../audio/soundPreview';
import { previewEvents } from '../midi/abletonSounds';
import type { ColourChannel } from '../tracking/boardColours';

const red: ColourChannel = { id: 'r', kind: 'hue', role: 'melody', swatch: '#f00', instrument: 'harp' };
const KEY = { rootMidi: 60, semitones: [0, 2, 4, 7, 9] };

describe('the short phrase a colour plays when you press Hear', () => {
  it('melody: four rising notes of the scale, a quarter second apart', () => {
    expect(previewPhrase('melody', 60, [0, 2, 4, 7, 9])).toEqual({ midis: [[60], [62], [64], [67]], atSec: [0, 0.25, 0.5, 0.75] });
  });

  it('bass: the root two octaves down, then its fifth', () => {
    expect(previewPhrase('bass', 60, [0, 2, 4, 7, 9]).midis).toEqual([[36], [43]]);
  });

  it('chords: one triad on the key note', () => {
    expect(previewPhrase('chord', 60, [0, 2, 4, 5, 7, 9, 11]).midis).toEqual([[60, 64, 67]]);
  });
});

describe('the preview sent to Ableton', () => {
  it('chooses the chain on the colour’s channel, then plays its notes there', () => {
    const ev = previewEvents(3, 7, [{ midi: 60, atMs: 0, durMs: 200 }]);
    expect(ev[0].data).toEqual([0xb2, 30, 7]);
    expect(ev.some((e) => e.data[0] === 0x92 && e.data[1] === 60)).toBe(true);
    expect(ev.some((e) => e.data[0] === 0x82 && e.data[1] === 60 && e.atMs === 200)).toBe(true);
  });

  it('without a chain, only the notes', () => {
    expect(previewEvents(3, null, [{ midi: 60, atMs: 0, durMs: 200 }]).some((e) => (e.data[0] & 0xf0) === 0xb0)).toBe(false);
  });
});

describe('hearing a colour while the board is stopped', () => {
  beforeEach(() => { vi.useFakeTimers(); voices.made = []; voices.readyAfterMs = 100; });
  afterEach(() => { vi.useRealTimers(); });

  it('waits for the samples, then plays the phrase in the colour’s own sound', async () => {
    const a = new SoundAuditioner();
    const heard = a.hear(red, 'warm', KEY);
    await vi.advanceTimersByTimeAsync(500);
    await expect(heard).resolves.toBe('played');
    expect(voices.made[0].sound).toBe('harp');
    expect(voices.made[0].play).toHaveBeenCalledTimes(4);
  });

  it('gives up after 4 seconds if the sound never loads', async () => {
    voices.readyAfterMs = null;
    const a = new SoundAuditioner();
    const heard = a.hear(red, 'warm', KEY);
    await vi.advanceTimersByTimeAsync(4100);
    await expect(heard).resolves.toBe('timeout');
    expect(voices.made[0].play).not.toHaveBeenCalled();
  });

  it('a second press while it loads does not play it twice', async () => {
    const a = new SoundAuditioner();
    const first = a.hear(red, 'warm', KEY);
    const second = a.hear(red, 'warm', KEY);
    await vi.advanceTimersByTimeAsync(500);
    await Promise.all([first, second]);
    expect(voices.made).toHaveLength(1);
    expect(voices.made[0].play).toHaveBeenCalledTimes(4);
  });
});
