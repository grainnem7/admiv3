/**
 * SamplerPlayer.ts — Thin wrapper around Tone.Sampler.
 *
 * Connects a Tone.Sampler to a raw AudioNode destination so it integrates
 * with the existing filterNode → outputGain chain in ToneVoiceBase.
 *
 * Falls back silently when not yet ready (caller falls back to oscillators).
 */

import * as Tone from 'tone';
import type { Player } from './SynthPlayer';

// ============================================
// Types
// ============================================

export interface SamplerPlayerOptions {
  urls: Record<string, string>;
  baseUrl: string;
  /** Amplitude envelope attack applied on top of the sample (seconds). */
  attack?: number;
  /** Amplitude envelope release applied on top of the sample (seconds). */
  release?: number;
}

// ============================================
// SamplerPlayer
// ============================================

export class SamplerPlayer implements Player {
  private sampler: Tone.Sampler;
  private ready = false;

  constructor(opts: SamplerPlayerOptions, destination: AudioNode) {
    this.sampler = new Tone.Sampler({
      urls: opts.urls,
      baseUrl: opts.baseUrl,
      attack: opts.attack ?? 0.005,
      release: opts.release ?? 0.3,
      onload: () => { this.ready = true; },
    });
    // Connect Tone.Sampler to the raw AudioNode filter chain.
    // Tone.js v15 ToneAudioNode.connect() accepts AudioNode as InputNode.
    this.sampler.connect(destination);
  }

  isReady(): boolean { return this.ready; }

  /** Trigger a note with a scheduled release — for melody, arp, and bass. */
  triggerAttackRelease(
    midi: number,
    duration: number,
    time?: number,
    velocity = 0.8,
  ): void {
    if (!this.ready) return;
    const note = Tone.Frequency(midi, 'midi').toNote();
    this.sampler.triggerAttackRelease(note, duration, time ?? Tone.now(), velocity);
  }

  /** Sustain-mode attack — for chord pads. Call releaseAll() to stop. */
  triggerAttack(midi: number, velocity = 0.8): void {
    if (!this.ready) return;
    const note = Tone.Frequency(midi, 'midi').toNote();
    this.sampler.triggerAttack(note, Tone.now(), velocity);
  }

  /** Release all currently held notes. */
  releaseAll(): void {
    if (!this.ready) return;
    this.sampler.releaseAll();
  }

  dispose(): void {
    this.sampler.dispose();
    this.ready = false;
  }
}

// ============================================
// Local sample base + note maps
//
// Samples are bundled under public/samples/instruments/ (CC-BY 3.0; see
// ATTRIBUTION.md) so Song Present works offline with no CDN dependency.
// Previously streamed from:
//   Salamander  https://tonejs.github.io/audio/salamander/
//   nbrosowsky  https://nbrosowsky.github.io/tonejs-instruments/samples/<inst>/
// The note lists below mirror public/samples/instruments/manifest.json exactly.
// ============================================

const local = (folder: string): string => `samples/instruments/${folder}/`;

/**
 * Build a Tone.Sampler `urls` map from sample note names. Files are spelled with
 * `s` for sharps (e.g. `Fs2.mp3`), but Tone.Sampler KEYS must be valid note names
 * using `#` (e.g. `F#2`) — so the key is `#`-spelled and the value keeps the `s`
 * filename. e.g. ['C4','Fs4'] → { 'C4': 'C4.mp3', 'F#4': 'Fs4.mp3' }.
 */
const noteMap = (notes: readonly string[], ext = 'mp3'): Record<string, string> =>
  Object.fromEntries(notes.map((n) => [n.replace(/^([A-G])s/, '$1#'), `${n}.${ext}`]));

// ============================================
// Per-instrument sample configs
//
// Every entry here is used by exactly one preset in a presets/*Presets.ts file
// (plus the instrument palette). The compiler flags unreferenced keys via the
// discriminated-union catalogs.
// ============================================

export const SAMPLE_CONFIGS = {
  // Piano (Salamander — best-in-class)
  piano:       { urls: noteMap(['C2','C3','C4','C5','C6','Fs2','Fs3','Fs4','Fs5']), baseUrl: local('piano'),        attack: 0.005, release: 1.5 },

  // Strings (nbrosowsky)
  violin:      { urls: noteMap(['E4','E5','G3','G4']),                              baseUrl: local('violin'),       attack: 0.1,   release: 0.4 },
  cello:       { urls: noteMap(['A2','A3','C2','C3','C4','Ds2','Ds3','Fs3']),       baseUrl: local('cello'),        attack: 0.15,  release: 0.5 },
  contrabass:  { urls: noteMap(['A2','C2','E2','G1']),                              baseUrl: local('contrabass'),   attack: 0.05,  release: 0.4 },

  // Winds (nbrosowsky)
  clarinet:    { urls: noteMap(['As3','As4','D3','D4','D5']),                       baseUrl: local('clarinet'),     attack: 0.08,  release: 0.3 },
  frenchHorn:  { urls: noteMap(['A3','C4','D3','D5','F3','G2']),                    baseUrl: local('french-horn'),  attack: 0.1,   release: 0.4 },
  tuba:        { urls: noteMap(['As1','As2','D3','F2','F3']),                       baseUrl: local('tuba'),         attack: 0.08,  release: 0.4 },

  // Plucked (nbrosowsky)
  harp:        { urls: noteMap(['C3','C5','G3','G5']),                              baseUrl: local('harp'),         attack: 0.005, release: 0.8 },
  guitarNylon: { urls: noteMap(['A2','A4','B3','D3','E2','E4','G3']),               baseUrl: local('guitar-nylon'), attack: 0.005, release: 0.3 },

  // Keys (nbrosowsky)
  organ:       { urls: noteMap(['C2','C3','C4','C5']),                              baseUrl: local('organ'),        attack: 0.01,  release: 0.3 },

  // Bass (nbrosowsky electric — real multi-note bass; replaces 1-note contrabass bass)
  bassElectric:{ urls: noteMap(['As1','As2','Cs2','Cs3','E1','E2','E3','G1','G2']), baseUrl: local('bass-electric'),attack: 0.008, release: 0.25 },

  // Electric piano + choir pad (FreePats, CC0, FLAC — see ATTRIBUTION.md)
  electricPiano:{ urls: noteMap(['C2','Fs1','Fs2','C3','Fs3','C4','Fs4','C5','Fs5','C6','Fs6','C7'], 'flac'), baseUrl: local('electric-piano'), attack: 0.005, release: 0.6 },
  padChoir:     { urls: noteMap(['C2','Fs2','C3','Fs3','C4','Fs4','C5','Fs5','C6','Fs6','C7','Fs7'], 'flac'), baseUrl: local('pad-choir'),     attack: 0.4,   release: 1.2 },
} as const satisfies Record<string, SamplerPlayerOptions>;

// Convenience: legal sample config keys.
export type SampleConfigKey = keyof typeof SAMPLE_CONFIGS;
