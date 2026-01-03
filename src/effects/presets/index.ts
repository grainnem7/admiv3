/**
 * Effect Chain Presets Index
 *
 * Export all available effect presets.
 */

import { CleanPreset } from './CleanPreset';
import { WarmPreset } from './WarmPreset';
import { SpacePreset } from './SpacePreset';
import { LoFiPreset } from './LoFiPreset';
import { SynthWavePreset } from './SynthWavePreset';
import { DreamPreset } from './DreamPreset';
import type { EffectChainPreset } from '../types';

/** All available presets */
export const EFFECT_PRESETS: EffectChainPreset[] = [
  CleanPreset,
  WarmPreset,
  SpacePreset,
  LoFiPreset,
  SynthWavePreset,
  DreamPreset,
];

/** Preset map for quick lookup by ID */
export const PRESET_MAP: Record<string, EffectChainPreset> = {
  clean: CleanPreset,
  warm: WarmPreset,
  space: SpacePreset,
  lofi: LoFiPreset,
  synthwave: SynthWavePreset,
  dream: DreamPreset,
};

/** Default preset ID */
export const DEFAULT_PRESET_ID = 'clean';

/** Get preset by ID */
export function getPresetById(id: string): EffectChainPreset | null {
  return PRESET_MAP[id] ?? null;
}

/** Get presets by category */
export function getPresetsByCategory(category: EffectChainPreset['category']): EffectChainPreset[] {
  return EFFECT_PRESETS.filter((p) => p.category === category);
}

// Re-export individual presets
export { CleanPreset, WarmPreset, SpacePreset, LoFiPreset, SynthWavePreset, DreamPreset };
