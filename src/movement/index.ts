/**
 * Movement module exports
 */

export * from './SignalSmoother';
export * from './MovementDetector';
export * from './DwellDetector';
export * from './FeatureExtractor';
export * from './GestureDetector';
export * from './MultiModalProcessor';

// NEW: Hand Feature Extractor (articulation, spread, intensity)
export * from './HandFeatureExtractor';

// NEW: Movement Event Detection (onset, offset, burst, drift)
export * from './MovementEventDetector';
