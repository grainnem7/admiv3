/**
 * Effect Chain Types
 *
 * Defines the structure for effect presets and configurations.
 */

import type * as Tone from 'tone';

/** Effect types available in the chain */
export type EffectType =
  | 'filter'
  | 'delay'
  | 'reverb'
  | 'chorus'
  | 'distortion'
  | 'bitcrusher'
  | 'phaser'
  | 'tremolo'
  | 'compressor'
  | 'eq';

/** Filter configuration */
export interface FilterConfig {
  type: 'lowpass' | 'highpass' | 'bandpass';
  frequency: number;
  Q: number;
  rolloff: -12 | -24 | -48 | -96;
}

/** Delay configuration */
export interface DelayConfig {
  delayTime: Tone.Unit.Time;
  feedback: number;
  wet: number;
}

/** Reverb configuration */
export interface ReverbConfig {
  decay: number;
  wet: number;
  preDelay: number;
}

/** Chorus configuration */
export interface ChorusConfig {
  frequency: number;
  delayTime: number;
  depth: number;
  wet: number;
}

/** Distortion configuration */
export interface DistortionConfig {
  distortion: number;
  wet: number;
}

/** Bitcrusher configuration */
export interface BitcrusherConfig {
  bits: number;
  wet: number;
}

/** Phaser configuration */
export interface PhaserConfig {
  frequency: number;
  octaves: number;
  baseFrequency: number;
  wet: number;
}

/** Tremolo configuration */
export interface TremoloConfig {
  frequency: number;
  depth: number;
  wet: number;
}

/** Compressor configuration */
export interface CompressorConfig {
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
}

/** EQ configuration (3-band) */
export interface EQConfig {
  low: number;
  mid: number;
  high: number;
}

/** Union type for all effect configs */
export type EffectConfig =
  | { type: 'filter'; config: FilterConfig }
  | { type: 'delay'; config: DelayConfig }
  | { type: 'reverb'; config: ReverbConfig }
  | { type: 'chorus'; config: ChorusConfig }
  | { type: 'distortion'; config: DistortionConfig }
  | { type: 'bitcrusher'; config: BitcrusherConfig }
  | { type: 'phaser'; config: PhaserConfig }
  | { type: 'tremolo'; config: TremoloConfig }
  | { type: 'compressor'; config: CompressorConfig }
  | { type: 'eq'; config: EQConfig };

/** Complete effect chain preset */
export interface EffectChainPreset {
  /** Unique preset ID */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Category for organization */
  category: 'clean' | 'warm' | 'space' | 'lofi' | 'electronic' | 'experimental';
  /** Effects in order (signal flows through in array order) */
  effects: EffectConfig[];
  /** Master volume adjustment (dB) */
  masterGain: number;
  /** Voice-specific adjustments */
  voiceSettings?: {
    melody?: { volume: number; attack?: number; release?: number };
    bass?: { volume: number; attack?: number; release?: number };
    chord?: { volume: number; attack?: number; release?: number };
  };
}

/** Preset change callback */
export type PresetChangeCallback = (preset: EffectChainPreset) => void;
