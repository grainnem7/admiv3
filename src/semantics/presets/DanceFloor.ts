/**
 * Dance Floor Preset
 *
 * Environmental musical fields create zones around the body that
 * influence harmony, timbre, and texture. Moving through these
 * invisible fields is like dancing through a musical landscape.
 *
 * Artistic concept: The performance space becomes a musical topology.
 * Different zones around your body have different musical properties.
 * Moving your hands through these zones paints with sound.
 */

import type { MappingPreset, ContinuousMappingDef, MusicalFieldDef, ManyToOneMappingDef, StateMachineDef } from '../types';

export const danceFloorPreset: MappingPreset = {
  id: 'dance-floor',
  name: 'Dance Floor',
  description: 'Musical zones surround your body. Dance through harmonic fields, textural clouds, and rhythmic regions. Your movement paints the music.',
  author: 'ADMI Creative Team',
  version: '1.0.0',

  mappings: [
    // Upper zone - bright, high, melodic
    {
      type: 'musicalField',
      id: 'upper-melody-zone',
      name: 'Upper Melody Zone',
      geometry: {
        type: 'box',
        min: { x: 0.2, y: 0, z: -0.5 },
        max: { x: 0.8, y: 0.4, z: 0.5 },
      },
      triggerJoint: 'rightHand_wrist',
      parameters: [
        {
          target: 'melody.register',
          influence: 'height',
          range: { min: 0.7, max: 1 },
          curve: 'linear',
        },
        {
          target: 'timbre.brightness',
          influence: 'height',
          range: { min: 0.6, max: 0.9 },
          curve: 'easeOut',
        },
        {
          target: 'melody.active',
          influence: 'distance',
          range: { min: 0, max: 1 },
          curve: 'step',
        },
      ],
      blendMode: 'override',
      priority: 2,
      enabled: true,
    } as MusicalFieldDef,

    // Lower zone - dark, bass, sustained
    {
      type: 'musicalField',
      id: 'lower-bass-zone',
      name: 'Lower Bass Zone',
      geometry: {
        type: 'box',
        min: { x: 0.2, y: 0.6, z: -0.5 },
        max: { x: 0.8, y: 1, z: 0.5 },
      },
      triggerJoint: 'leftHand_wrist',
      parameters: [
        {
          target: 'bass.register',
          influence: 'height',
          range: { min: 0, max: 0.3 },
          curve: 'linear',
        },
        {
          target: 'timbre.darkness',
          influence: 'height',
          range: { min: 0.5, max: 0.9 },
          curve: 'easeIn',
        },
        {
          target: 'bass.sustain',
          influence: 'distance',
          range: { min: 0.5, max: 1 },
          curve: 'linear',
        },
      ],
      blendMode: 'add',
      priority: 2,
      enabled: true,
    } as MusicalFieldDef,

    // Right sphere - harmonic cluster zone
    {
      type: 'musicalField',
      id: 'right-harmony-sphere',
      name: 'Right Harmony Sphere',
      geometry: {
        type: 'sphere',
        center: { x: 0.15, y: 0.5, z: 0 },
        radius: 0.2,
      },
      triggerJoint: 'rightHand_wrist',
      parameters: [
        {
          target: 'harmony.density',
          influence: 'distance',
          range: { min: 0, max: 1 },
          curve: 'exponential',
        },
        {
          target: 'harmony.spread',
          influence: 'radial',
          range: { min: 0.3, max: 1 },
          curve: 'linear',
        },
        {
          target: 'harmony.brightness',
          influence: 'angle',
          range: { min: 0.3, max: 0.8 },
          curve: 'linear',
        },
      ],
      blendMode: 'multiply',
      priority: 1,
      enabled: true,
    } as MusicalFieldDef,

    // Left sphere - texture/noise zone
    {
      type: 'musicalField',
      id: 'left-texture-sphere',
      name: 'Left Texture Sphere',
      geometry: {
        type: 'sphere',
        center: { x: 0.85, y: 0.5, z: 0 },
        radius: 0.2,
      },
      triggerJoint: 'leftHand_wrist',
      parameters: [
        {
          target: 'texture.graininess',
          influence: 'distance',
          range: { min: 0, max: 0.8 },
          curve: 'logarithmic',
        },
        {
          target: 'texture.density',
          influence: 'radial',
          range: { min: 0.1, max: 1 },
          curve: 'linear',
        },
        {
          target: 'texture.color',
          influence: 'angle',
          range: { min: 0, max: 1 },
          curve: 'linear',
        },
      ],
      blendMode: 'add',
      priority: 1,
      enabled: true,
    } as MusicalFieldDef,

    // Center cylinder - drone zone
    {
      type: 'musicalField',
      id: 'center-drone-cylinder',
      name: 'Center Drone Zone',
      geometry: {
        type: 'cylinder',
        center: { x: 0.5, y: 0.5, z: 0 },
        radius: 0.15,
        height: 0.6,
      },
      triggerJoint: 'pose_nose',
      parameters: [
        {
          target: 'drone.volume',
          influence: 'distance',
          range: { min: 0, max: 0.8 },
          curve: 'easeOut',
        },
        {
          target: 'drone.harmonics',
          influence: 'height',
          range: { min: 1, max: 8 },
          curve: 'linear',
        },
      ],
      blendMode: 'override',
      priority: 0,
      enabled: true,
    } as MusicalFieldDef,

    // Movement through space → global effects
    {
      type: 'continuous',
      id: 'velocity-to-rhythm',
      name: 'Velocity to Rhythm',
      source: 'qualities.energy',
      target: 'rhythm.intensity',
      inputRange: { min: 0, max: 0.8 },
      outputRange: { min: 0.1, max: 1 },
      curve: 'exponential',
      inverted: false,
      smoothing: 0.4,
      deadZone: 0.1,
      priority: 1,
      enabled: true,
    } as ContinuousMappingDef,

    // Expansion → spatial audio width
    {
      type: 'continuous',
      id: 'expansion-to-space',
      name: 'Expansion to Space',
      source: 'bodyConfig.expansionLevel',
      target: 'spatial.width',
      inputRange: { min: 0.2, max: 0.8 },
      outputRange: { min: 0.3, max: 1 },
      curve: 'linear',
      inverted: false,
      smoothing: 0.5,
      deadZone: 0.05,
      priority: 0,
      enabled: true,
    } as ContinuousMappingDef,

    // Fluidity → reverb/delay
    {
      type: 'continuous',
      id: 'fluidity-to-delay',
      name: 'Fluidity to Delay',
      source: 'qualities.fluidity',
      target: 'effects.delayMix',
      inputRange: { min: 0, max: 1 },
      outputRange: { min: 0, max: 0.6 },
      curve: 'easeOut',
      inverted: false,
      smoothing: 0.6,
      deadZone: 0,
      priority: 0,
      enabled: true,
    } as ContinuousMappingDef,

    // Torso twist → filter sweep
    {
      type: 'continuous',
      id: 'twist-to-filter',
      name: 'Twist to Filter Sweep',
      source: 'bodyConfig.spinalTwist',
      target: 'effects.filterSweep',
      inputRange: { min: -0.5, max: 0.5 },
      outputRange: { min: 200, max: 8000 },
      curve: 'exponential',
      inverted: false,
      smoothing: 0.3,
      deadZone: 0.1,
      priority: 1,
      enabled: true,
    } as ContinuousMappingDef,

    // Angular momentum → chorus/modulation
    {
      type: 'manyToOne',
      id: 'momentum-to-modulation',
      name: 'Angular Momentum to Modulation',
      sources: [
        {
          path: 'qualities.angularMomentum.x',
          weight: 0.33,
          curve: 'linear',
          inputRange: { min: -1, max: 1 },
        },
        {
          path: 'qualities.angularMomentum.y',
          weight: 0.33,
          curve: 'linear',
          inputRange: { min: -1, max: 1 },
        },
        {
          path: 'qualities.angularMomentum.z',
          weight: 0.33,
          curve: 'linear',
          inputRange: { min: -1, max: 1 },
        },
      ],
      combineMode: 'add',
      target: 'effects.chorusDepth',
      outputRange: { min: 0, max: 0.7 },
      priority: 0,
      enabled: true,
    } as ManyToOneMappingDef,

    // State machine for intensity levels
    {
      type: 'stateMachine',
      id: 'intensity-state',
      name: 'Intensity State',
      initialState: 'calm',
      states: [
        {
          id: 'calm',
          name: 'Calm',
          onEnter: [
            { target: 'global.intensity', value: 0.3 },
            { target: 'rhythm.subdivision', value: 0.25 },
          ],
          transitions: [
            {
              toState: 'active',
              conditions: [
                { source: 'qualities.energy', operator: '>', value: 0.4, durationMs: 500 },
              ],
            },
          ],
        },
        {
          id: 'active',
          name: 'Active',
          onEnter: [
            { target: 'global.intensity', value: 0.6 },
            { target: 'rhythm.subdivision', value: 0.5 },
          ],
          transitions: [
            {
              toState: 'calm',
              conditions: [
                { source: 'qualities.energy', operator: '<', value: 0.2, durationMs: 1000 },
              ],
            },
            {
              toState: 'peak',
              conditions: [
                { source: 'qualities.energy', operator: '>', value: 0.7, durationMs: 300 },
              ],
            },
          ],
        },
        {
          id: 'peak',
          name: 'Peak',
          onEnter: [
            { target: 'global.intensity', value: 1 },
            { target: 'rhythm.subdivision', value: 1 },
          ],
          transitions: [
            {
              toState: 'active',
              conditions: [
                { source: 'qualities.energy', operator: '<', value: 0.5, durationMs: 500 },
              ],
            },
          ],
        },
      ],
    } as StateMachineDef,

    // Posture archetype → harmonic mode
    {
      type: 'stateMachine',
      id: 'posture-harmony',
      name: 'Posture to Harmony',
      initialState: 'neutral',
      states: [
        {
          id: 'neutral',
          name: 'Neutral',
          onEnter: [{ target: 'harmony.mode', value: 'major' }],
          transitions: [
            {
              toState: 'open',
              conditions: [
                { source: 'bodyConfig.expansionLevel', operator: '>', value: 0.7, durationMs: 200 },
              ],
            },
            {
              toState: 'closed',
              conditions: [
                { source: 'bodyConfig.expansionLevel', operator: '<', value: 0.3, durationMs: 200 },
              ],
            },
          ],
        },
        {
          id: 'open',
          name: 'Open Posture',
          onEnter: [{ target: 'harmony.mode', value: 'lydian' }],
          transitions: [
            {
              toState: 'neutral',
              conditions: [
                { source: 'bodyConfig.expansionLevel', operator: '<', value: 0.6, durationMs: 300 },
              ],
            },
          ],
        },
        {
          id: 'closed',
          name: 'Closed Posture',
          onEnter: [{ target: 'harmony.mode', value: 'minor' }],
          transitions: [
            {
              toState: 'neutral',
              conditions: [
                { source: 'bodyConfig.expansionLevel', operator: '>', value: 0.4, durationMs: 300 },
              ],
            },
          ],
        },
      ],
    } as StateMachineDef,
  ],

  musicalConfig: {
    scale: 'major',
    root: 'C',
    tempo: 100,
    key: 'C',
    mode: 'major',
  },

  initialStates: {
    'intensity-state': 'calm',
    'posture-harmony': 'neutral',
  },

  defaults: {
    'melody.register': 0.5,
    'melody.active': 0,
    'bass.register': 0.3,
    'bass.sustain': 0.7,
    'harmony.density': 0.5,
    'harmony.spread': 0.5,
    'harmony.brightness': 0.5,
    'harmony.mode': 'major',
    'texture.graininess': 0,
    'texture.density': 0.3,
    'texture.color': 0.5,
    'drone.volume': 0,
    'drone.harmonics': 3,
    'rhythm.intensity': 0.3,
    'rhythm.subdivision': 0.25,
    'spatial.width': 0.6,
    'effects.delayMix': 0.2,
    'effects.filterSweep': 2000,
    'effects.chorusDepth': 0.2,
    'global.intensity': 0.3,
    'timbre.brightness': 0.5,
    'timbre.darkness': 0.3,
  },

  tags: ['spatial', 'zones', 'dance', 'environmental', 'immersive'],
  isSystem: true,
};
