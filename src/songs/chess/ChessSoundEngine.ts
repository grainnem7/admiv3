/**
 * Plays chess sounds through ADMI's own voices, into the EffectChainManager. The screen
 * never touches Tone: it sends sounds here, they go out on the chess event bus (a
 * MusicEventEmitter), and this engine plays what the bus carries.
 */
import * as Tone from 'tone';
import { getEffectChainManager } from '../../effects';
import { MusicEventEmitter, type MusicEvent } from '../../mapping/MusicEventEmitter';
import { BoardSequencerVoice } from '../voices/BoardSequencerVoice';
import { RoundRobinDrumKit } from '../../audio/instruments/RoundRobinDrumKit';
import type { LayeredVoiceSpec } from '../../audio/worlds/soundWorlds';
import type { ChessSound } from './chessNotes';

/** The chess bus: every chess sound is an event here first. */
export const chessEvents = new MusicEventEmitter();

type Drum = NonNullable<ChessSound['drum']>;

/** A note's id on the bus: voice and square, so a listener can draw it. */
export function chessNoteId(voice: string, square: string): string {
  return `chess|${voice}|${square}|${Math.random().toString(36).slice(2, 7)}`;
}

/** The voice and square a chess note id carries, or null for another id. */
export function parseChessNoteId(id: string): { voice: string; square: string } | null {
  const [tag, voice, square] = id.split('|');
  return tag === 'chess' && voice && square ? { voice, square } : null;
}

const midiToHz = (m: number): number => 440 * 2 ** ((m - 69) / 12);
const hzToMidi = (f: number): number => Math.round(69 + 12 * Math.log2(f / 440));

/** Sends sounds on the bus, each at its own delay. */
export function sendChessSounds(sounds: readonly ChessSound[], bus: MusicEventEmitter = chessEvents): void {
  for (const s of sounds) {
    const fire = (): void => {
      if (s.drum) bus.emit({ type: 'trigger', triggerId: `chess|drum:${s.drum}|${s.square}|${s.velocity}`, timestamp: Date.now() });
      else bus.emit({ type: 'noteOn', noteId: chessNoteId(s.voice, s.square), frequency: midiToHz(s.midi), velocity: s.velocity, timestamp: Date.now() });
    };
    if (s.delaySec > 0) setTimeout(fire, s.delaySec * 1000);
    else fire();
  }
}

const NOTE_SEC = 0.6;

export class ChessSoundEngine {
  private readonly voices = new Map<string, BoardSequencerVoice>();
  private kit: RoundRobinDrumKit | null = null;
  private dest: AudioNode | null = null;
  private unsubscribe: (() => void) | null = null;
  /** What each voice name plays; a voice not listed plays a soft pluck. */
  private specs: Record<string, string | LayeredVoiceSpec>;

  constructor(specs: Record<string, string | LayeredVoiceSpec> = {}, private readonly bus: MusicEventEmitter = chessEvents) {
    this.specs = specs;
  }

  /** Start the sound (needs a press first, as browsers ask) and listen to the bus. */
  async start(): Promise<void> {
    await Tone.start();
    const fx = getEffectChainManager();
    await fx.initialize();
    this.dest = (fx.getInput()?.input as unknown as AudioNode | undefined) ?? null;
    if (!this.kit) {
      this.kit = new RoundRobinDrumKit(Tone.getContext().rawContext as AudioContext, 'studio-kit');
      if (this.dest) this.kit.connect(this.dest);
    }
    // Every voice starts loading its samples now, so the first moves are heard.
    for (const name of Object.keys(this.specs)) this.voiceFor(name);
    if (!this.unsubscribe) this.unsubscribe = this.bus.onAny((e) => this.onEvent(e));
  }

  /** Change what a voice plays; the old voice is let go. */
  setSpec(voice: string, spec: string | LayeredVoiceSpec): void {
    this.specs = { ...this.specs, [voice]: spec };
    this.voices.get(voice)?.dispose();
    this.voices.delete(voice);
  }

  private voiceFor(name: string): BoardSequencerVoice {
    let v = this.voices.get(name);
    if (!v) {
      v = new BoardSequencerVoice(Tone.getContext().rawContext as AudioContext, this.specs[name] ?? { synth: 'pluck' });
      if (this.dest) v.connect(this.dest);
      this.voices.set(name, v);
    }
    return v;
  }

  private onEvent(e: MusicEvent): void {
    const t = Tone.now() + 0.01;
    if (e.type === 'noteOn') {
      const id = parseChessNoteId(e.noteId);
      if (!id) return;
      this.voiceFor(id.voice).play(hzToMidi(e.frequency), e.velocity, NOTE_SEC, t);
    } else if (e.type === 'trigger' && e.triggerId.startsWith('chess|drum:')) {
      const [, kind, , vel] = e.triggerId.split('|');
      this.kit?.play(kind.slice('drum:'.length) as Drum, Number(vel) || 0.85, t);
    }
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const v of this.voices.values()) v.dispose();
    this.voices.clear();
    this.kit?.dispose();
    this.kit = null;
  }
}
