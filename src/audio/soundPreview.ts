/**
 * ▶ Hear: a colour's sound played on its own, at once, whether or not the board is
 * playing, so a facilitator and a player can try sounds and compare them. A short phrase
 * in the colour's own register; drums play a bar of the kit (or the colour's one piece).
 */
import * as Tone from 'tone';
import { getEffectChainManager } from '../effects';
import { BoardSequencerVoice } from '../songs/voices/BoardSequencerVoice';
import { RoundRobinDrumKit, type KitDrum } from './instruments/RoundRobinDrumKit';
import { voiceSpecFor, type SoundWorldChoice } from './worlds/soundWorlds';
import type { ColourChannel } from '../tracking/boardColours';

/** How long Hear waits for a sound's samples before saying it couldn't. */
const READY_MAX_MS = 4000;
const READY_POLL_MS = 50;
const NOTE_SEC = 0.35;
const VELOCITY = 0.75;

export interface PreviewPhrase {
  /** The notes sounding at each moment. */
  midis: number[][];
  /** When each moment starts, seconds after the press. */
  atSec: number[];
}

/** The phrase a colour plays for Hear: in the key, in that job's register. */
export function previewPhrase(role: 'melody' | 'bass' | 'chord', rootMidi: number, semitones: readonly number[]): PreviewPhrase {
  const at = (i: number): number => rootMidi + (semitones[i % semitones.length] ?? 0) + 12 * Math.floor(i / Math.max(1, semitones.length));
  if (role === 'bass') return { midis: [[rootMidi - 24], [rootMidi - 24 + 7]], atSec: [0, 0.5] };
  if (role === 'chord') return { midis: [[at(0), at(2), at(4)]], atSec: [0] };
  return { midis: [0, 1, 2, 3].map((i) => [at(i)]), atSec: [0, 0.25, 0.5, 0.75] };
}

const BAR: KitDrum[] = ['kick', 'hat', 'snare', 'hat'];

/** Plays a colour's sound on demand. One per screen; voices are kept per sound. */
export class SoundAuditioner {
  private readonly voices = new Map<string, BoardSequencerVoice>();
  private kit: RoundRobinDrumKit | null = null;
  private readonly waiting = new Map<string, Promise<'played' | 'timeout'>>();

  hear(ch: ColourChannel, world: SoundWorldChoice, key: { rootMidi: number; semitones: readonly number[] }): Promise<'played' | 'timeout'> {
    const already = this.waiting.get(ch.id);
    if (already) return already;
    const done = this.play(ch, world, key).finally(() => this.waiting.delete(ch.id));
    this.waiting.set(ch.id, done);
    return done;
  }

  dispose(): void {
    for (const v of this.voices.values()) v.dispose();
    this.voices.clear();
    this.kit = null;
  }

  private async play(ch: ColourChannel, world: SoundWorldChoice, key: { rootMidi: number; semitones: readonly number[] }): Promise<'played' | 'timeout'> {
    const fx = getEffectChainManager();
    await fx.initialize();
    const dest = fx.getInput()?.input as unknown as AudioNode | undefined;
    if (ch.role === 'drums') {
      const kit = this.kit ?? new RoundRobinDrumKit(Tone.getContext().rawContext as AudioContext, 'studio-kit');
      if (!this.kit && dest) kit.connect(dest);
      this.kit = kit;
      if (!(await readyWithin(() => kit.isReady()))) return 'timeout';
      const t = Tone.now() + 0.05;
      const piece = ch.drum as KitDrum | undefined;
      BAR.forEach((d, i) => kit.play(piece ?? d, VELOCITY, t + i * 0.25));
      return 'played';
    }
    if (ch.role !== 'melody' && ch.role !== 'bass' && ch.role !== 'chord') return 'played';
    const spec = voiceSpecFor(ch, world);
    const id = typeof spec === 'string' ? spec : JSON.stringify(spec);
    let voice = this.voices.get(id);
    if (!voice) {
      voice = new BoardSequencerVoice(Tone.getContext().rawContext as AudioContext, spec);
      if (dest) voice.connect(dest);
      this.voices.set(id, voice);
    }
    const v = voice;
    if (!(await readyWithin(() => v.isReady()))) return 'timeout';
    const phrase = previewPhrase(ch.role, key.rootMidi, key.semitones);
    const t = Tone.now() + 0.05;
    phrase.midis.forEach((notes, i) => {
      const dur = ch.role === 'chord' ? 1.2 : NOTE_SEC;
      for (const m of notes) v.play(m, VELOCITY, dur, t + phrase.atSec[i]);
    });
    return 'played';
  }
}

/** Resolves true once `ready()` holds, or false after READY_MAX_MS. */
function readyWithin(ready: () => boolean): Promise<boolean> {
  return new Promise((resolve) => {
    if (ready()) { resolve(true); return; }
    const started = Date.now();
    const id = setInterval(() => {
      if (ready()) { clearInterval(id); resolve(true); }
      else if (Date.now() - started >= READY_MAX_MS) { clearInterval(id); resolve(false); }
    }, READY_POLL_MS);
  });
}
