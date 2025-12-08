/**
 * Mapping module exports
 */

// Legacy exports (preserved for compatibility)
export * from './MusicEventEmitter';
export * from './ContinuousMapper';

// Event types (new spec-aligned types)
// @see mapping_requirements.md
export * from './events';

// New modular mapping system
export {
  MappingNode,
  applyCurve,
  normalizeValue,
} from './MappingNode';
export type { MappingNodeConfig, MappingNodeOutput } from './MappingNode';

// Mapping nodes
export {
  PitchMappingNode,
  VolumeMappingNode,
  TriggerMappingNode,
  FilterMappingNode,
  ChordMappingNode,
  SCALES,
  CHORD_VOICINGS,
} from './nodes';
export type {
  PitchMappingConfig,
  VolumeMappingConfig,
  TriggerMappingConfig,
  TriggerMode,
  FilterMappingConfig,
  FilterType,
  ChordMappingConfig,
  ChordVoicing,
  ChordOutput,
} from './nodes';

// Mapping engine
export { MappingEngine, getMappingEngine } from './MappingEngine';
export type {
  MappingEngineConfig,
  MappingEngineOutput,
  MusicalEventCallback,
} from './MappingEngine';
