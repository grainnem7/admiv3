/**
 * SynthPlayer.ts — Tone.js synthesis wrapper that implements the shared Player
 * interface alongside SamplerPlayer.
 *
 * Voices treat SamplerPlayer and SynthPlayer interchangeably — they both
 * expose the same trigger/release/dispose methods. Synth presets have no
 * loading phase (isReady() === true immediately), so the oscillator fallback
 * code previously needed per-voice is no longer required.
 */

import * as Tone from 'tone';

// ============================================
// Shared Player interface
// ============================================

export interface Player {
  /** True when the player can receive trigger calls without being ignored. */
  isReady(): boolean;
  /** Sustain-mode attack — used by chord pads. Call releaseAll() to stop. */
  triggerAttack(midi: number, velocity?: number): void;
  /** Trigger a note with a scheduled release — used by melody, arp, bass. */
  triggerAttackRelease(midi: number, duration: number, time?: number, velocity?: number): void;
  /** Release all currently held notes. */
  releaseAll(): void;
  /** Dispose of all audio nodes. */
  dispose(): void;
}

// ============================================
// SynthPlayer types
// ============================================

export type SynthKind = 'poly' | 'fm' | 'am' | 'mono' | 'duo';

export interface SynthConfig {
  kind: SynthKind;
  /** Polyphony for 'poly' kind (default 8). Ignored for monophonic kinds. */
  polyphony?: number;
  /** Inner voice type for 'poly' kind (default Tone.Synth). */
  polyVoice?: 'synth' | 'fm' | 'am';
  /** Options forwarded to the underlying Tone constructor. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options?: any;
  /** If > 0, inserts a Tone.Chorus between synth and destination (0..1). */
  chorusDepth?: number;
}

// Internal — union of the Tone synth types SynthPlayer can wrap.
type AnyToneSynth =
  | Tone.PolySynth
  | Tone.FMSynth
  | Tone.AMSynth
  | Tone.MonoSynth
  | Tone.DuoSynth;

// ============================================
// SynthPlayer
// ============================================

export class SynthPlayer implements Player {
  private synth: AnyToneSynth;
  private chorus: Tone.Chorus | null = null;
  private disposed = false;
  private isPoly = false;

  constructor(config: SynthConfig, destination: AudioNode) {
    this.synth = this.createSynth(config);
    this.isPoly = config.kind === 'poly';

    let terminal: Tone.ToneAudioNode = this.synth;
    if (config.chorusDepth && config.chorusDepth > 0) {
      this.chorus = new Tone.Chorus({
        frequency: 1.5,
        delayTime: 3.5,
        depth: config.chorusDepth,
        feedback: 0.1,
        spread: 180,
      }).start();
      this.synth.connect(this.chorus);
      terminal = this.chorus;
    }
    // Tone.js accepts AudioNode as connect target in v15.
    terminal.connect(destination);
  }

  private createSynth(config: SynthConfig): AnyToneSynth {
    switch (config.kind) {
      case 'poly': {
        // Use .set() — PolySynth constructor's second-arg options differs
        // between Tone.js versions; .set() is stable across v14/v15.
        // Construct each variant explicitly to satisfy strict PolySynth
        // VoiceConstructor<Synth<SynthOptions>> typing.
        const poly =
          config.polyVoice === 'fm' ? new Tone.PolySynth(Tone.FMSynth) :
          config.polyVoice === 'am' ? new Tone.PolySynth(Tone.AMSynth) :
          new Tone.PolySynth(Tone.Synth);
        if (config.options) poly.set(config.options);
        if (config.polyphony) poly.maxPolyphony = config.polyphony;
        return poly;
      }
      case 'fm':   return new Tone.FMSynth(config.options);
      case 'am':   return new Tone.AMSynth(config.options);
      case 'mono': return new Tone.MonoSynth(config.options);
      case 'duo':  return new Tone.DuoSynth(config.options);
    }
  }

  isReady(): boolean { return !this.disposed; }

  triggerAttack(midi: number, velocity = 0.8): void {
    if (this.disposed) return;
    const freq = Tone.Frequency(midi, 'midi').toFrequency();
    this.synth.triggerAttack(freq, Tone.now(), velocity);
  }

  triggerAttackRelease(midi: number, duration: number, time?: number, velocity = 0.8): void {
    if (this.disposed) return;
    const freq = Tone.Frequency(midi, 'midi').toFrequency();
    this.synth.triggerAttackRelease(freq, duration, time ?? Tone.now(), velocity);
  }

  releaseAll(): void {
    if (this.disposed) return;
    // PolySynth has releaseAll(); monophonic synths use triggerRelease().
    if (this.isPoly) {
      (this.synth as Tone.PolySynth).releaseAll();
    } else {
      (this.synth as Tone.MonoSynth).triggerRelease(Tone.now());
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.synth.dispose();
    this.chorus?.dispose();
  }
}
