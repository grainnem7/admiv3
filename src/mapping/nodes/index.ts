/**
 * Mapping Nodes Index
 *
 * Re-exports all mapping node types for convenient importing.
 */

export { PitchMappingNode, SCALES } from './PitchMappingNode';
export type { PitchMappingConfig } from './PitchMappingNode';

export { VolumeMappingNode } from './VolumeMappingNode';
export type { VolumeMappingConfig } from './VolumeMappingNode';

export { TriggerMappingNode } from './TriggerMappingNode';
export type {
  TriggerMappingConfig,
  TriggerMode,
  TriggerAction,
  TriggerStructuralAction,
} from './TriggerMappingNode';

export { FilterMappingNode } from './FilterMappingNode';
export type { FilterMappingConfig, FilterType } from './FilterMappingNode';

export { ChordMappingNode, CHORD_VOICINGS } from './ChordMappingNode';
export type { ChordMappingConfig, ChordVoicing, ChordOutput } from './ChordMappingNode';

export { ZoneMappingNode, DEFAULT_QUAD_ZONES, DEFAULT_QUAD_CHORDS } from './ZoneMappingNode';
export type {
  ZoneMappingConfig,
  ZoneChordMapping,
  ZoneEnterAction,
  ZoneExitAction,
} from './ZoneMappingNode';

export { FaceExpressionNode, DEFAULT_FACE_MAPPINGS } from './FaceExpressionNode';
export type { FaceExpressionConfig, FaceExpressionMapping } from './FaceExpressionNode';

export { HandExpressionNode, DEFAULT_HAND_MAPPINGS } from './HandExpressionNode';
export type {
  HandExpressionConfig,
  HandExpressionMapping,
  HandExpressionSource,
  ExternalHandFeatures,
} from './HandExpressionNode';

export { QuantizerNode } from './QuantizerNode';
export type { QuantizerConfig, QuantizeMode } from './QuantizerNode';
