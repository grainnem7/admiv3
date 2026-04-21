/**
 * SamplerPlayer.ts — Thin wrapper around Tone.Sampler.
 *
 * Connects a Tone.Sampler to a raw AudioNode destination so it integrates
 * with the existing filterNode → outputGain chain in ToneVoiceBase.
 *
 * Falls back silently when not yet ready (caller falls back to oscillators).
 */

import * as Tone from 'tone';

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

export class SamplerPlayer {
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
// CDN base URLs
// ============================================

export const SALAMANDER_BASE = 'https://tonejs.github.io/audio/salamander/';
export const fluidR3Base = (instrument: string): string =>
  `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/${instrument}-mp3/`;

// ============================================
// Shared note URL maps (relative to base URL)
// ============================================

const A_NOTES_3_4_5: Record<string, string> = { A3: 'A3.mp3', A4: 'A4.mp3', A5: 'A5.mp3' };
const A_NOTES_4_5:   Record<string, string> = { A4: 'A4.mp3', A5: 'A5.mp3' };
const A_NOTES_2_3_4: Record<string, string> = { A2: 'A2.mp3', A3: 'A3.mp3', A4: 'A4.mp3' };
const A_NOTES_1_2:   Record<string, string> = { A1: 'A1.mp3', A2: 'A2.mp3' };

// ============================================
// Per-instrument sample configs
// ============================================

export const SAMPLE_CONFIGS = {
  // Melody presets
  bell:    { urls: A_NOTES_3_4_5, baseUrl: SALAMANDER_BASE,                       attack: 0.005, release: 2.0 },
  violin:  { urls: A_NOTES_3_4_5, baseUrl: fluidR3Base('violin'),                 attack: 0.1,   release: 0.4 },
  pizz:    { urls: A_NOTES_3_4_5, baseUrl: fluidR3Base('pizzicato-strings'),       attack: 0.005, release: 0.3 },
  flute:   { urls: A_NOTES_4_5,   baseUrl: fluidR3Base('flute'),                  attack: 0.08,  release: 0.4 },

  // Chord pad presets
  warmPad: { urls: A_NOTES_2_3_4, baseUrl: SALAMANDER_BASE,                       attack: 0.5,   release: 1.0 },
  ePiano:  { urls: A_NOTES_2_3_4, baseUrl: fluidR3Base('electric-piano-1'),       attack: 0.01,  release: 0.5 },
  stabPad: { urls: A_NOTES_2_3_4, baseUrl: SALAMANDER_BASE,                       attack: 0.01,  release: 0.15 },
  strings: { urls: A_NOTES_2_3_4, baseUrl: fluidR3Base('string-ensemble-1'),      attack: 0.8,   release: 1.2 },

  // Arpeggio presets
  piano:   { urls: A_NOTES_3_4_5, baseUrl: SALAMANDER_BASE,                       attack: 0.005, release: 1.5 },
  harp:    { urls: A_NOTES_3_4_5, baseUrl: fluidR3Base('orchestral-harp'),        attack: 0.005, release: 0.8 },
  guitar:  { urls: A_NOTES_3_4_5, baseUrl: fluidR3Base('acoustic-guitar-nylon'),  attack: 0.005, release: 0.3 },
  vibes:   { urls: A_NOTES_3_4_5, baseUrl: fluidR3Base('vibraphone'),             attack: 0.005, release: 1.2 },

  // Bass presets
  aBass:   { urls: A_NOTES_1_2,   baseUrl: fluidR3Base('acoustic-bass'),          attack: 0.02,  release: 0.4 },
  eBass:   { urls: A_NOTES_1_2,   baseUrl: fluidR3Base('electric-bass-finger'),   attack: 0.01,  release: 0.3 },
  slapBass:{ urls: A_NOTES_1_2,   baseUrl: fluidR3Base('slap-bass-1'),            attack: 0.005, release: 0.2 },
  pickBass:{ urls: A_NOTES_1_2,   baseUrl: fluidR3Base('electric-bass-pick'),     attack: 0.005, release: 0.2 },
} as const satisfies Record<string, SamplerPlayerOptions>;
