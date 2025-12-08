/**
 * Melody Ribbon Preset
 *
 * The hand traces a "ribbon" through musical space, with height
 * controlling pitch, curvature adding ornaments, and velocity
 * affecting articulation.
 *
 * Artistic concept: Drawing melodies in the air like calligraphy,
 * where the quality of the gesture affects the quality of the sound.
 * Smooth, flowing movements create legato phrases; sharp movements
 * create staccato articulations.
 */

import type { MappingPreset, ContinuousMappingDef, OneToManyMappingDef, StateMachineDef } from '../types';

export const melodyRibbonPreset: MappingPreset = {
  id: 'melody-ribbon',
  name: 'Melody Ribbon',
  description: 'Draw melodies in the air. Hand height controls pitch, curvature adds ornaments, velocity shapes articulation. Create flowing legato or sharp staccato through the quality of your gesture.',
  author: 'ADMI Creative Team',
  version: '1.0.0',

  mappings: [
    // Right hand height → melody pitch (quantized to scale)
    {
      type: 'continuous',
      id: 'hand-to-pitch',
      name: 'Hand Height to Pitch',
      source: 'joints.rightHand_indexTip.position.y',
      target: 'melody.pitch',
      inputRange: { min: 0.2, max: 0.8 },
      outputRange: { min: 0, max: 1 },
      curve: 'linear',
      inverted: true, // Higher hand = higher pitch (screen coords are inverted)
      smoothing: 0.2,
      deadZone: 0.02,
      quantization: {
        scale: 'pentatonic',
        root: 'C',
        octaveRange: { min: 4, max: 6 },
        enabled: true,
      },
      priority: 2,
      enabled: true,
    } as ContinuousMappingDef,

    // Hand curvature → ornament intensity (trills, grace notes)
    {
      type: 'continuous',
      id: 'curvature-to-ornament',
      name: 'Curvature to Ornaments',
      source: 'joints.rightHand_wrist.curvature',
      target: 'melody.ornamentIntensity',
      inputRange: { min: 0, max: 2 },
      outputRange: { min: 0, max: 1 },
      curve: 'logarithmic',
      inverted: false,
      smoothing: 0.3,
      deadZone: 0.1,
      priority: 1,
      enabled: true,
    } as ContinuousMappingDef,

    // Hand velocity → articulation (legato vs staccato)
    {
      type: 'continuous',
      id: 'velocity-to-articulation',
      name: 'Velocity to Articulation',
      source: 'joints.rightHand_wrist.velocity.magnitude',
      target: 'melody.articulation',
      inputRange: { min: 0, max: 1 },
      outputRange: { min: 0, max: 1 },  // 0 = sustained legato, 1 = sharp staccato
      curve: 'easeIn',
      inverted: false,
      smoothing: 0.4,
      deadZone: 0.05,
      priority: 1,
      enabled: true,
    } as ContinuousMappingDef,

    // Jerk → accent strength
    {
      type: 'continuous',
      id: 'jerk-to-accent',
      name: 'Jerk to Accent',
      source: 'joints.rightHand_wrist.jerk.magnitude',
      target: 'melody.accent',
      inputRange: { min: 0, max: 5 },
      outputRange: { min: 0, max: 1 },
      curve: 'exponential',
      inverted: false,
      smoothing: 0.1,
      deadZone: 0.5,
      priority: 1,
      enabled: true,
    } as ContinuousMappingDef,

    // Hand horizontal position → interval size (for ornaments)
    {
      type: 'continuous',
      id: 'horizontal-to-interval',
      name: 'Horizontal to Interval',
      source: 'joints.rightHand_indexTip.position.x',
      target: 'melody.ornamentInterval',
      inputRange: { min: 0.2, max: 0.8 },
      outputRange: { min: 1, max: 5 },  // Semitones for ornaments
      curve: 'step',
      inverted: false,
      smoothing: 0.5,
      deadZone: 0.05,
      priority: 0,
      enabled: true,
    } as ContinuousMappingDef,

    // Fluidity → vibrato depth
    {
      type: 'continuous',
      id: 'fluidity-to-vibrato',
      name: 'Fluidity to Vibrato',
      source: 'qualities.fluidity',
      target: 'melody.vibratoDepth',
      inputRange: { min: 0, max: 1 },
      outputRange: { min: 0, max: 30 },  // Cents
      curve: 'linear',
      inverted: false,
      smoothing: 0.6,
      deadZone: 0,
      priority: 0,
      enabled: true,
    } as ContinuousMappingDef,

    // Left hand height → bass drone pitch
    {
      type: 'continuous',
      id: 'left-to-bass',
      name: 'Left Hand to Bass',
      source: 'joints.leftHand_wrist.position.y',
      target: 'bass.pitch',
      inputRange: { min: 0.3, max: 0.7 },
      outputRange: { min: 0, max: 1 },
      curve: 'linear',
      inverted: true,
      smoothing: 0.7,
      deadZone: 0.05,
      quantization: {
        scale: 'pentatonic',
        root: 'C',
        octaveRange: { min: 2, max: 3 },
        enabled: true,
      },
      priority: 1,
      enabled: true,
    } as ContinuousMappingDef,

    // Hand spread → harmonic richness (one-to-many)
    {
      type: 'oneToMany',
      id: 'spread-to-harmonics',
      name: 'Spread to Harmonics',
      source: 'bodyConfig.handSpread',
      inputRange: { min: 0.2, max: 0.8 },
      targets: [
        {
          path: 'melody.harmonics',
          outputRange: { min: 1, max: 5 },
          curve: 'linear',
          offset: 0,
          scale: 1,
        },
        {
          path: 'melody.brightness',
          outputRange: { min: 0.3, max: 0.8 },
          curve: 'easeOut',
          offset: 0,
          scale: 1,
        },
        {
          path: 'effects.chorus',
          outputRange: { min: 0, max: 0.5 },
          curve: 'linear',
          offset: 0,
          scale: 1,
        },
      ],
      priority: 0,
      enabled: true,
    } as OneToManyMappingDef,

    // Effort weight → dynamics (volume)
    {
      type: 'continuous',
      id: 'weight-to-dynamics',
      name: 'Effort Weight to Dynamics',
      source: 'qualities.effort.weight',
      target: 'melody.velocity',
      inputRange: { min: 0, max: 1 },
      outputRange: { min: 0.3, max: 1 },
      curve: 'easeIn',
      inverted: false,
      smoothing: 0.3,
      deadZone: 0,
      priority: 1,
      enabled: true,
    } as ContinuousMappingDef,

    // State machine for phrase structure
    {
      type: 'stateMachine',
      id: 'phrase-state',
      name: 'Phrase Structure',
      initialState: 'rest',
      states: [
        {
          id: 'rest',
          name: 'Rest',
          onEnter: [{ target: 'melody.active', value: 0 }],
          transitions: [
            {
              toState: 'phrase',
              conditions: [
                {
                  source: 'joints.rightHand_wrist.velocity.magnitude',
                  operator: '>',
                  value: 0.1,
                  durationMs: 100,
                },
              ],
            },
          ],
        },
        {
          id: 'phrase',
          name: 'Playing Phrase',
          onEnter: [{ target: 'melody.active', value: 1 }],
          activeMappings: ['hand-to-pitch', 'curvature-to-ornament'],
          transitions: [
            {
              toState: 'rest',
              conditions: [
                {
                  source: 'joints.rightHand_wrist.velocity.magnitude',
                  operator: '<',
                  value: 0.02,
                  durationMs: 500,
                },
              ],
            },
          ],
        },
      ],
    } as StateMachineDef,
  ],

  musicalConfig: {
    scale: 'pentatonic',
    root: 'C',
    tempo: 72,
    key: 'C',
    mode: 'major',
  },

  initialStates: {
    'phrase-state': 'rest',
  },

  defaults: {
    'melody.pitch': 0.5,
    'melody.velocity': 0.7,
    'melody.ornamentIntensity': 0,
    'melody.ornamentInterval': 2,
    'melody.articulation': 0.5,
    'melody.accent': 0,
    'melody.vibratoDepth': 10,
    'melody.harmonics': 2,
    'melody.brightness': 0.5,
    'melody.active': 0,
    'bass.pitch': 0.5,
    'effects.chorus': 0.2,
  },

  tags: ['melody', 'expressive', 'hand-focused', 'scalar', 'ornamental'],
  isSystem: true,
};
