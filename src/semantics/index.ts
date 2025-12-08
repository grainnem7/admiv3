/**
 * Movement Semantics Module
 *
 * A comprehensive system for extracting high-dimensional movement features
 * and mapping them to musical parameters through a stateful, expressive
 * mapping engine.
 *
 * This module provides:
 * - MovementSemanticsExtractor: Extracts velocity, acceleration, jerk, curvature,
 *   body configuration, facial expressions, gaze, and Laban effort qualities
 * - StatefulMappingEngine: Processes extracted features through continuous,
 *   many-to-one, one-to-many, conditional, and state machine mappings
 * - MappingDSL: A readable domain-specific language for defining mappings
 * - Creative Presets: Pre-configured mapping sets for different artistic visions
 */

// Types
export type {
  Vector3,
  Vector3WithMagnitude,
  JointKinematics,
  JointHistory,
  BodyConfiguration,
  PostureArchetype,
  FacialExpression,
  GazeData,
  LabanEffort,
  MovementQualities,
  MovementSemanticsFrame,
  MappingCurveType,
  QuantizationConfig,
  MappingCondition,
  ContinuousMappingDef,
  ManyToOneMappingDef,
  OneToManyMappingDef,
  StateMachineState,
  StateMachineDef,
  GazeRoutingDef,
  MusicalFieldDef,
  MappingDef,
  MappingPreset,
  DSLStatement,
  DSLParseResult,
} from './types';

// Movement Semantics Extractor
export {
  MovementSemanticsExtractor,
  getMovementSemanticsExtractor,
  resetMovementSemanticsExtractor,
} from './MovementSemanticsExtractor';

// Stateful Mapping Engine
export type { MappingOutput } from './StatefulMappingEngine';
export {
  StatefulMappingEngine,
  getStatefulMappingEngine,
  resetStatefulMappingEngine,
} from './StatefulMappingEngine';

// DSL Parser
export {
  parseMappingDSL,
  validateMappingDSL,
  formatAsDSL,
  DSL_EXAMPLES,
} from './MappingDSL';

// Presets
export {
  CREATIVE_PRESETS,
  getPresetById,
  getPresetsByTag,
  timbreSpherePreset,
  melodyRibbonPreset,
  harmonyAxisPreset,
  emotionModulatorPreset,
  gazeOrchestraPreset,
  danceFloorPreset,
} from './presets';

// Semantic Music Controller (Integration)
export type { SemanticMusicalEvent, SemanticEventCallback, SemanticMusicControllerConfig } from './SemanticMusicController';
export {
  SemanticMusicController,
  getSemanticMusicController,
  resetSemanticMusicController,
} from './SemanticMusicController';
