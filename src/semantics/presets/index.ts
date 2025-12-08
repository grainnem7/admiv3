/**
 * Creative Mapping Presets
 *
 * Pre-configured mapping presets for expressive ADMI performance.
 * Each preset represents a coherent artistic vision for how body
 * movement translates to musical expression.
 */

import type { MappingPreset } from '../types';
import { timbreSpherePreset } from './TimbreSphere';
import { melodyRibbonPreset } from './MelodyRibbon';
import { harmonyAxisPreset } from './HarmonyAxis';
import { emotionModulatorPreset } from './EmotionModulator';
import { gazeOrchestraPreset } from './GazeOrchestra';
import { danceFloorPreset } from './DanceFloor';

/**
 * All available creative presets
 */
export const CREATIVE_PRESETS: MappingPreset[] = [
  timbreSpherePreset,
  melodyRibbonPreset,
  harmonyAxisPreset,
  emotionModulatorPreset,
  gazeOrchestraPreset,
  danceFloorPreset,
];

/**
 * Get a preset by ID
 */
export function getPresetById(id: string): MappingPreset | undefined {
  return CREATIVE_PRESETS.find(p => p.id === id);
}

/**
 * Get presets by tag
 */
export function getPresetsByTag(tag: string): MappingPreset[] {
  return CREATIVE_PRESETS.filter(p => p.tags.includes(tag));
}

// Re-export individual presets
export {
  timbreSpherePreset,
  melodyRibbonPreset,
  harmonyAxisPreset,
  emotionModulatorPreset,
  gazeOrchestraPreset,
  danceFloorPreset,
};
