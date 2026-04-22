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
// CDN base URLs
// ============================================

export const SALAMANDER_BASE = 'https://tonejs.github.io/audio/salamander/';

const nbrosowskyBase = (instrument: string): string =>
  `https://nbrosowsky.github.io/tonejs-instruments/samples/${instrument}/`;

// ============================================
// Shared note URL maps (relative to base URL)
// ============================================

const A_NOTES_3_4_5: Record<string, string> = { A3: 'A3.mp3', A4: 'A4.mp3', A5: 'A5.mp3' };
const A_NOTES_2_3_4: Record<string, string> = { A2: 'A2.mp3', A3: 'A3.mp3', A4: 'A4.mp3' };
const A_NOTES_3_4:   Record<string, string> = { A3: 'A3.mp3', A4: 'A4.mp3' };
const A_NOTES_1_2:   Record<string, string> = { A1: 'A1.mp3', A2: 'A2.mp3' };

// Clarinet: no A-notes on CDN; use D-notes (D3, D4, D5 available)
const CLARINET_NOTES: Record<string, string> = { D3: 'D3.mp3', D4: 'D4.mp3', D5: 'D5.mp3' };
// Tuba: no A-notes on CDN; use As1, As2, D3 (lowest available spread)
const TUBA_NOTES: Record<string, string> = { 'Bb1': 'As1.mp3', 'Bb2': 'As2.mp3', D3: 'D3.mp3' };

// ============================================
// Per-instrument sample configs
//
// Every entry here is used by exactly one preset in a presets/*Presets.ts file.
// Adding a new entry: just append below.  Removing: delete here AND from any
// catalog that references it (the catalog is discriminated-union typed so the
// compiler will flag unreferenced keys).
// ============================================

export const SAMPLE_CONFIGS = {
  // Piano (Salamander — kept, best-in-class)
  piano:       { urls: A_NOTES_3_4_5, baseUrl: SALAMANDER_BASE,               attack: 0.005, release: 1.5 },

  // Strings section (nbrosowsky)
  violin:      { urls: A_NOTES_3_4_5, baseUrl: nbrosowskyBase('violin'),      attack: 0.1,   release: 0.4 },
  cello:       { urls: A_NOTES_2_3_4, baseUrl: nbrosowskyBase('cello'),       attack: 0.15,  release: 0.5 },
  contrabass:  { urls: A_NOTES_1_2,   baseUrl: nbrosowskyBase('contrabass'),  attack: 0.05,  release: 0.4 },

  // Winds (nbrosowsky)
  clarinet:    { urls: CLARINET_NOTES, baseUrl: nbrosowskyBase('clarinet'),    attack: 0.08,  release: 0.3 },
  frenchHorn:  { urls: A_NOTES_3_4,   baseUrl: nbrosowskyBase('french-horn'), attack: 0.1,   release: 0.4 },
  tuba:        { urls: TUBA_NOTES,    baseUrl: nbrosowskyBase('tuba'),        attack: 0.08,  release: 0.4 },

  // Plucked (nbrosowsky)
  harp:        { urls: A_NOTES_3_4_5, baseUrl: nbrosowskyBase('harp'),        attack: 0.005, release: 0.8 },
  guitarNylon: { urls: A_NOTES_3_4_5, baseUrl: nbrosowskyBase('guitar-nylon'),attack: 0.005, release: 0.3 },

  // Keys (nbrosowsky)
  organ:       { urls: A_NOTES_2_3_4, baseUrl: nbrosowskyBase('organ'),       attack: 0.01,  release: 0.3 },
} as const satisfies Record<string, SamplerPlayerOptions>;

// Convenience: legal sample config keys.
export type SampleConfigKey = keyof typeof SAMPLE_CONFIGS;
