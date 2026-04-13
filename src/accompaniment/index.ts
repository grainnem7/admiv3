/**
 * Accompaniment System - Barrel exports
 */

export type {
  PerformanceMode,
  AccompanimentPattern,
  AccompanimentSettings,
  HarmonyContext,
  HarmonyContextChangeCallback,
  ScheduledNote,
} from './types';

export { DEFAULT_ACCOMPANIMENT_SETTINGS } from './types';

export { HarmonyManager, getHarmonyManager } from './HarmonyManager';
export { AccompanimentEngine, getAccompanimentEngine } from './AccompanimentEngine';
export { ACCOMPANIMENT_PATTERNS, getStepsForDensity } from './AccompanimentPatterns';
export type { PatternStep, PatternDefinition } from './AccompanimentPatterns';
