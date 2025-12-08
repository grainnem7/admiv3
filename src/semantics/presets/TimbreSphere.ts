/**
 * Timbre Sphere Preset
 *
 * A 3D timbral control space where body lean in all directions
 * sculpts the harmonic content, spectral qualities, and FM synthesis
 * parameters of the sound.
 *
 * Artistic concept: The body becomes the center of a sonic sphere,
 * where leaning toward different directions explores different
 * timbral territories.
 *
 * Lean forward: brighter, more present sounds
 * Lean back: darker, more distant sounds
 * Lean left/right: morphing between harmonic and inharmonic spectra
 * Twist: adds motion and modulation
 */

import type { MappingPreset, ContinuousMappingDef, ManyToOneMappingDef } from '../types';

export const timbreSpherePreset: MappingPreset = {
  id: 'timbre-sphere',
  name: 'Timbre Sphere',
  description: 'Body lean controls timbral qualities in a 3D sonic space. Explore bright/dark, harmonic/inharmonic, and static/dynamic timbres through natural body movement.',
  author: 'ADMI Creative Team',
  version: '1.0.0',

  mappings: [
    // Forward/backward lean → spectral brightness
    {
      type: 'continuous',
      id: 'lean-to-brightness',
      name: 'Lean to Brightness',
      source: 'bodyConfig.torsoLean.pitch',
      target: 'timbre.brightness',
      inputRange: { min: -0.5, max: 0.5 },
      outputRange: { min: 0.1, max: 0.9 },
      curve: 'sigmoid',
      inverted: false,
      smoothing: 0.4,
      deadZone: 0.05,
      priority: 1,
      enabled: true,
    } as ContinuousMappingDef,

    // Side lean → harmonic ratio (harmonic vs inharmonic)
    {
      type: 'continuous',
      id: 'roll-to-harmonicity',
      name: 'Roll to Harmonicity',
      source: 'bodyConfig.torsoLean.roll',
      target: 'timbre.harmonicity',
      inputRange: { min: -0.4, max: 0.4 },
      outputRange: { min: 0.5, max: 2.0 },
      curve: 'exponential',
      inverted: false,
      smoothing: 0.5,
      deadZone: 0.05,
      priority: 1,
      enabled: true,
    } as ContinuousMappingDef,

    // Twist → FM modulation depth
    {
      type: 'continuous',
      id: 'twist-to-fm-depth',
      name: 'Twist to FM Depth',
      source: 'bodyConfig.spinalTwist',
      target: 'timbre.fmDepth',
      inputRange: { min: -0.6, max: 0.6 },
      outputRange: { min: 0, max: 100 },
      curve: 'easeInOut',
      inverted: false,
      smoothing: 0.3,
      deadZone: 0.1,
      priority: 1,
      enabled: true,
    } as ContinuousMappingDef,

    // Expansion level → reverb size
    {
      type: 'continuous',
      id: 'expansion-to-space',
      name: 'Expansion to Space',
      source: 'bodyConfig.expansionLevel',
      target: 'effects.reverbSize',
      inputRange: { min: 0.2, max: 0.8 },
      outputRange: { min: 0.1, max: 0.8 },
      curve: 'logarithmic',
      inverted: false,
      smoothing: 0.6,
      deadZone: 0.05,
      priority: 0,
      enabled: true,
    } as ContinuousMappingDef,

    // Movement energy → filter modulation rate
    {
      type: 'continuous',
      id: 'energy-to-filter-lfo',
      name: 'Energy to Filter LFO',
      source: 'qualities.energy',
      target: 'timbre.filterLfoRate',
      inputRange: { min: 0, max: 0.8 },
      outputRange: { min: 0.1, max: 8 },
      curve: 'exponential',
      inverted: false,
      smoothing: 0.4,
      deadZone: 0.05,
      priority: 0,
      enabled: true,
    } as ContinuousMappingDef,

    // Fluidity → filter resonance
    {
      type: 'continuous',
      id: 'fluidity-to-resonance',
      name: 'Fluidity to Resonance',
      source: 'qualities.fluidity',
      target: 'timbre.filterResonance',
      inputRange: { min: 0, max: 1 },
      outputRange: { min: 0.1, max: 0.7 },
      curve: 'linear',
      inverted: true,  // Jerky = more resonance
      smoothing: 0.5,
      deadZone: 0,
      priority: 0,
      enabled: true,
    } as ContinuousMappingDef,

    // Combined body position → filter cutoff (many-to-one)
    {
      type: 'manyToOne',
      id: 'body-to-filter',
      name: 'Body to Filter Cutoff',
      sources: [
        {
          path: 'bodyConfig.torsoLean.pitch',
          weight: 0.6,
          curve: 'linear',
          inputRange: { min: -0.5, max: 0.5 },
        },
        {
          path: 'bodyConfig.handElevation.right',
          weight: 0.4,
          curve: 'linear',
          inputRange: { min: 0, max: 1 },
        },
      ],
      combineMode: 'average',
      target: 'timbre.filterCutoff',
      outputRange: { min: 200, max: 8000 },
      priority: 1,
      enabled: true,
    } as ManyToOneMappingDef,

    // Head orientation → stereo panning
    {
      type: 'continuous',
      id: 'head-to-pan',
      name: 'Head Orientation to Pan',
      source: 'bodyConfig.headOrientation.yaw',
      target: 'output.pan',
      inputRange: { min: -0.5, max: 0.5 },
      outputRange: { min: -1, max: 1 },
      curve: 'linear',
      inverted: false,
      smoothing: 0.3,
      deadZone: 0.1,
      priority: 0,
      enabled: true,
    } as ContinuousMappingDef,
  ],

  musicalConfig: {
    scale: 'major',
    root: 'C',
    tempo: 90,
    key: 'C',
    mode: 'major',
  },

  defaults: {
    'timbre.brightness': 0.5,
    'timbre.harmonicity': 1.0,
    'timbre.fmDepth': 0,
    'timbre.filterCutoff': 2000,
    'timbre.filterResonance': 0.3,
    'timbre.filterLfoRate': 1,
    'effects.reverbSize': 0.3,
    'output.pan': 0,
  },

  tags: ['timbre', 'ambient', 'exploration', 'torso-focused'],
  isSystem: true,
};
