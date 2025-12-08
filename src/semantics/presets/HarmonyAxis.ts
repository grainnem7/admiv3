/**
 * Harmony Axis Preset
 *
 * Torso movement controls harmonic content - twist changes the
 * harmonic mode, tilt adjusts chord quality, and lean affects
 * chord voicing and tension.
 *
 * Artistic concept: The spine becomes the axis of harmonic exploration.
 * Rotating and tilting the torso navigates through harmonic space,
 * from consonant to dissonant, from major to minor, from simple
 * to complex.
 */

import type { MappingPreset, ContinuousMappingDef, StateMachineDef, ManyToOneMappingDef } from '../types';

export const harmonyAxisPreset: MappingPreset = {
  id: 'harmony-axis',
  name: 'Harmony Axis',
  description: 'Your torso controls harmonic content. Twist to change modes, tilt to shift chord quality, lean to add tension and color. Feel the harmonic changes through your body.',
  author: 'ADMI Creative Team',
  version: '1.0.0',

  mappings: [
    // Torso twist → mode selection (via state machine)
    {
      type: 'stateMachine',
      id: 'mode-selector',
      name: 'Mode Selector',
      initialState: 'ionian',
      states: [
        {
          id: 'ionian',
          name: 'Ionian (Major)',
          onEnter: [
            { target: 'harmony.mode', value: 'major' },
            { target: 'harmony.modeIndex', value: 0 },
          ],
          transitions: [
            {
              toState: 'lydian',
              conditions: [
                { source: 'bodyConfig.spinalTwist', operator: '>', value: 0.25, durationMs: 200 },
              ],
            },
            {
              toState: 'mixolydian',
              conditions: [
                { source: 'bodyConfig.spinalTwist', operator: '<', value: -0.25, durationMs: 200 },
              ],
            },
          ],
        },
        {
          id: 'lydian',
          name: 'Lydian',
          onEnter: [
            { target: 'harmony.mode', value: 'lydian' },
            { target: 'harmony.modeIndex', value: 1 },
          ],
          transitions: [
            {
              toState: 'ionian',
              conditions: [
                { source: 'bodyConfig.spinalTwist', operator: 'between', value: [-0.15, 0.15], durationMs: 150 },
              ],
            },
            {
              toState: 'phrygian',
              conditions: [
                { source: 'bodyConfig.spinalTwist', operator: '>', value: 0.5, durationMs: 200 },
              ],
            },
          ],
        },
        {
          id: 'mixolydian',
          name: 'Mixolydian',
          onEnter: [
            { target: 'harmony.mode', value: 'mixolydian' },
            { target: 'harmony.modeIndex', value: -1 },
          ],
          transitions: [
            {
              toState: 'ionian',
              conditions: [
                { source: 'bodyConfig.spinalTwist', operator: 'between', value: [-0.15, 0.15], durationMs: 150 },
              ],
            },
            {
              toState: 'dorian',
              conditions: [
                { source: 'bodyConfig.spinalTwist', operator: '<', value: -0.5, durationMs: 200 },
              ],
            },
          ],
        },
        {
          id: 'dorian',
          name: 'Dorian',
          onEnter: [
            { target: 'harmony.mode', value: 'dorian' },
            { target: 'harmony.modeIndex', value: -2 },
          ],
          transitions: [
            {
              toState: 'mixolydian',
              conditions: [
                { source: 'bodyConfig.spinalTwist', operator: '>', value: -0.4, durationMs: 150 },
              ],
            },
            {
              toState: 'aeolian',
              conditions: [
                { source: 'bodyConfig.spinalTwist', operator: '<', value: -0.7, durationMs: 200 },
              ],
            },
          ],
        },
        {
          id: 'phrygian',
          name: 'Phrygian',
          onEnter: [
            { target: 'harmony.mode', value: 'phrygian' },
            { target: 'harmony.modeIndex', value: 2 },
          ],
          transitions: [
            {
              toState: 'lydian',
              conditions: [
                { source: 'bodyConfig.spinalTwist', operator: '<', value: 0.4, durationMs: 150 },
              ],
            },
            {
              toState: 'locrian',
              conditions: [
                { source: 'bodyConfig.spinalTwist', operator: '>', value: 0.7, durationMs: 200 },
              ],
            },
          ],
        },
        {
          id: 'aeolian',
          name: 'Aeolian (Minor)',
          onEnter: [
            { target: 'harmony.mode', value: 'minor' },
            { target: 'harmony.modeIndex', value: -3 },
          ],
          transitions: [
            {
              toState: 'dorian',
              conditions: [
                { source: 'bodyConfig.spinalTwist', operator: '>', value: -0.6, durationMs: 150 },
              ],
            },
          ],
        },
        {
          id: 'locrian',
          name: 'Locrian',
          onEnter: [
            { target: 'harmony.mode', value: 'locrian' },
            { target: 'harmony.modeIndex', value: 3 },
          ],
          transitions: [
            {
              toState: 'phrygian',
              conditions: [
                { source: 'bodyConfig.spinalTwist', operator: '<', value: 0.6, durationMs: 150 },
              ],
            },
          ],
        },
      ],
    } as StateMachineDef,

    // Torso roll (side tilt) → chord quality (major ↔ minor ↔ sus)
    {
      type: 'continuous',
      id: 'roll-to-quality',
      name: 'Roll to Chord Quality',
      source: 'bodyConfig.torsoLean.roll',
      target: 'harmony.chordQuality',
      inputRange: { min: -0.4, max: 0.4 },
      outputRange: { min: 0, max: 1 },  // 0=minor, 0.5=major, 1=sus
      curve: 'linear',
      inverted: false,
      smoothing: 0.4,
      deadZone: 0.05,
      priority: 1,
      enabled: true,
    } as ContinuousMappingDef,

    // Forward lean → chord tension (add9, add11, etc.)
    {
      type: 'continuous',
      id: 'pitch-to-tension',
      name: 'Lean to Chord Tension',
      source: 'bodyConfig.torsoLean.pitch',
      target: 'harmony.chordTension',
      inputRange: { min: -0.3, max: 0.3 },
      outputRange: { min: 0, max: 1 },
      curve: 'easeInOut',
      inverted: false,
      smoothing: 0.5,
      deadZone: 0.05,
      priority: 1,
      enabled: true,
    } as ContinuousMappingDef,

    // Hand elevation → voicing (close vs open voicing)
    {
      type: 'manyToOne',
      id: 'hands-to-voicing',
      name: 'Hand Elevation to Voicing',
      sources: [
        {
          path: 'bodyConfig.handElevation.left',
          weight: 0.5,
          curve: 'linear',
          inputRange: { min: 0.2, max: 0.8 },
        },
        {
          path: 'bodyConfig.handElevation.right',
          weight: 0.5,
          curve: 'linear',
          inputRange: { min: 0.2, max: 0.8 },
        },
      ],
      combineMode: 'average',
      target: 'harmony.voicingSpread',
      outputRange: { min: 0, max: 1 },  // 0=close, 1=open
      priority: 1,
      enabled: true,
    } as ManyToOneMappingDef,

    // Hand spread → chord density (triads to 7ths to 9ths)
    {
      type: 'continuous',
      id: 'spread-to-density',
      name: 'Spread to Chord Density',
      source: 'bodyConfig.handSpread',
      target: 'harmony.chordDensity',
      inputRange: { min: 0.1, max: 0.7 },
      outputRange: { min: 0, max: 1 },
      curve: 'easeIn',
      inverted: false,
      smoothing: 0.5,
      deadZone: 0.05,
      priority: 1,
      enabled: true,
    } as ContinuousMappingDef,

    // Symmetry → chord stability
    {
      type: 'continuous',
      id: 'symmetry-to-stability',
      name: 'Symmetry to Stability',
      source: 'bodyConfig.bilateralSymmetry',
      target: 'harmony.stability',
      inputRange: { min: 0.5, max: 1 },
      outputRange: { min: 0, max: 1 },
      curve: 'linear',
      inverted: false,
      smoothing: 0.6,
      deadZone: 0,
      priority: 0,
      enabled: true,
    } as ContinuousMappingDef,

    // Head orientation → bass note (relative to chord root)
    {
      type: 'continuous',
      id: 'head-to-bass',
      name: 'Head to Bass Inversion',
      source: 'bodyConfig.headOrientation.pitch',
      target: 'harmony.bassInversion',
      inputRange: { min: -0.3, max: 0.3 },
      outputRange: { min: 0, max: 3 },  // Root, 1st, 2nd, 3rd inversion
      curve: 'step',
      inverted: false,
      smoothing: 0.4,
      deadZone: 0.1,
      priority: 0,
      enabled: true,
    } as ContinuousMappingDef,

    // Movement energy → chord rhythm
    {
      type: 'continuous',
      id: 'energy-to-rhythm',
      name: 'Energy to Rhythm',
      source: 'qualities.energy',
      target: 'harmony.rhythmDensity',
      inputRange: { min: 0, max: 0.8 },
      outputRange: { min: 0.1, max: 1 },
      curve: 'exponential',
      inverted: false,
      smoothing: 0.5,
      deadZone: 0.1,
      priority: 0,
      enabled: true,
    } as ContinuousMappingDef,

    // Expansion → harmonic motion
    {
      type: 'continuous',
      id: 'expansion-to-motion',
      name: 'Expansion to Harmonic Motion',
      source: 'bodyConfig.expansionLevel',
      target: 'harmony.harmonicMotion',
      inputRange: { min: 0.2, max: 0.8 },
      outputRange: { min: 0, max: 1 },  // 0=static, 1=active progression
      curve: 'linear',
      inverted: false,
      smoothing: 0.6,
      deadZone: 0.05,
      priority: 0,
      enabled: true,
    } as ContinuousMappingDef,
  ],

  musicalConfig: {
    scale: 'major',
    root: 'C',
    tempo: 60,
    key: 'C',
    mode: 'ionian',
  },

  initialStates: {
    'mode-selector': 'ionian',
  },

  defaults: {
    'harmony.mode': 'major',
    'harmony.modeIndex': 0,
    'harmony.chordQuality': 0.5,
    'harmony.chordTension': 0,
    'harmony.voicingSpread': 0.5,
    'harmony.chordDensity': 0.3,
    'harmony.stability': 0.8,
    'harmony.bassInversion': 0,
    'harmony.rhythmDensity': 0.3,
    'harmony.harmonicMotion': 0.3,
  },

  tags: ['harmony', 'chords', 'torso-focused', 'modal', 'expressive'],
  isSystem: true,
};
