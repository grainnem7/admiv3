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

import { previewRoute } from '../audio/soundPreview';
import { soundFromToConfig } from '../midi/boardMidi';

describe('where Hear plays: ADMI, unless Ableton is the only sound and its port is there', () => {
  const cfg = (s: 'admi' | 'ableton' | 'both') => ({ ...soundFromToConfig(s), midiDeviceId: 'p1' });
  it('ADMI and Both: ADMI’s own sound', () => {
    expect(previewRoute(cfg('admi'), { portConnected: true, holdOnAdmi: false })).toBe('admi');
    expect(previewRoute(cfg('both'), { portConnected: true, holdOnAdmi: false })).toBe('admi');
  });
  it('Ableton with its port: Ableton; with the port gone or held on ADMI: ADMI, as Play does', () => {
    expect(previewRoute(cfg('ableton'), { portConnected: true, holdOnAdmi: false })).toBe('ableton');
    expect(previewRoute(cfg('ableton'), { portConnected: false, holdOnAdmi: false })).toBe('admi');
    expect(previewRoute(cfg('ableton'), { portConnected: true, holdOnAdmi: true })).toBe('admi');
  });
});

import { previewNotesFor } from '../audio/soundPreview';
import { KIT_GM_NOTE } from '../midi/gmDrums';

describe('the preview as MIDI notes, for Ableton', () => {
  it('a melody: its four notes a quarter second apart', () => {
    const n = previewNotesFor(red, KEY);
    expect(n.map((x) => x.midi)).toEqual([60, 62, 64, 67]);
    expect(n.map((x) => x.atMs)).toEqual([0, 250, 500, 750]);
  });
  it('drums: a bar of the kit, as General MIDI drum notes; one piece when the colour has one', () => {
    const kit = previewNotesFor({ ...red, role: 'drums', instrument: undefined }, KEY);
    expect(kit.map((x) => x.midi)).toEqual([KIT_GM_NOTE.kick, KIT_GM_NOTE.hat, KIT_GM_NOTE.snare, KIT_GM_NOTE.hat]);
    const snare = previewNotesFor({ ...red, role: 'drums', drum: 'snare' }, KEY);
    expect(new Set(snare.map((x) => x.midi))).toEqual(new Set([KIT_GM_NOTE.snare]));
  });
});

import { previewChainCc } from '../audio/soundPreview';

describe('the Ableton sound Hear chooses', () => {
  const plan = { chains: new Map([[1, 6], [2, 12]]) };
  it('stopped: the chain Play would send for that channel (a shared channel keeps its first colour’s)', () => {
    expect(previewChainCc(plan, 1, false)).toBe(48);
    expect(previewChainCc(plan, 3, false)).toBeNull();
  });
  it('playing: none, so the engine’s choice (Sounds change included) is never undone', () => {
    expect(previewChainCc(plan, 1, true)).toBeNull();
  });
});
