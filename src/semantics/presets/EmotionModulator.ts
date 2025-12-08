/**
 * Emotion Modulator Preset
 *
 * Facial expressions directly modulate musical expression parameters.
 * Smile adds warmth, frown adds dissonance, eyebrow movements control
 * vibrato, mouth opening affects amplitude and formants.
 *
 * Artistic concept: Your face becomes the expressive surface of the
 * music. Every micro-expression translates to micro-modulations of
 * the sound, creating deeply personal and emotionally resonant music.
 */

import type { MappingPreset, ContinuousMappingDef, ManyToOneMappingDef, OneToManyMappingDef } from '../types';

export const emotionModulatorPreset: MappingPreset = {
  id: 'emotion-modulator',
  name: 'Emotion Modulator',
  description: 'Your face shapes the music. Smile for warmth, frown for tension, eyebrows for expression. Let your emotions sing through the sound.',
  author: 'ADMI Creative Team',
  version: '1.0.0',

  mappings: [
    // Smile → warmth/brightness
    {
      type: 'oneToMany',
      id: 'smile-to-warmth',
      name: 'Smile to Warmth',
      source: 'face.smileIntensity',
      inputRange: { min: 0, max: 0.8 },
      targets: [
        {
          path: 'timbre.warmth',
          outputRange: { min: 0.3, max: 1 },
          curve: 'easeOut',
          offset: 0,
          scale: 1,
        },
        {
          path: 'timbre.filterCutoff',
          outputRange: { min: 2000, max: 6000 },
          curve: 'linear',
          offset: 0,
          scale: 1,
        },
        {
          path: 'harmony.majorMinorBlend',
          outputRange: { min: 0.5, max: 1 },  // More major when smiling
          curve: 'linear',
          offset: 0,
          scale: 1,
        },
      ],
      priority: 2,
      enabled: true,
    } as OneToManyMappingDef,

    // Brow furrow → dissonance/tension
    {
      type: 'oneToMany',
      id: 'furrow-to-tension',
      name: 'Furrow to Tension',
      source: 'face.browFurrow',
      inputRange: { min: 0, max: 0.6 },
      targets: [
        {
          path: 'timbre.dissonance',
          outputRange: { min: 0, max: 0.8 },
          curve: 'exponential',
          offset: 0,
          scale: 1,
        },
        {
          path: 'harmony.tension',
          outputRange: { min: 0, max: 0.7 },
          curve: 'linear',
          offset: 0,
          scale: 1,
        },
        {
          path: 'timbre.distortion',
          outputRange: { min: 0, max: 0.4 },
          curve: 'easeIn',
          offset: 0,
          scale: 1,
        },
      ],
      priority: 2,
      enabled: true,
    } as OneToManyMappingDef,

    // Mouth openness → amplitude and formant
    {
      type: 'continuous',
      id: 'mouth-to-amplitude',
      name: 'Mouth to Amplitude',
      source: 'face.mouthOpenness',
      target: 'output.amplitude',
      inputRange: { min: 0, max: 0.7 },
      outputRange: { min: 0.2, max: 1 },
      curve: 'easeOut',
      inverted: false,
      smoothing: 0.2,
      deadZone: 0.05,
      priority: 2,
      enabled: true,
    } as ContinuousMappingDef,

    // Mouth width → vowel formant (ah ↔ ee)
    {
      type: 'continuous',
      id: 'mouth-to-formant',
      name: 'Mouth Width to Formant',
      source: 'face.mouthWidth',
      target: 'timbre.vowelFormant',
      inputRange: { min: 0.2, max: 0.8 },
      outputRange: { min: 0, max: 1 },  // 0="ah", 1="ee"
      curve: 'linear',
      inverted: false,
      smoothing: 0.3,
      deadZone: 0.05,
      priority: 1,
      enabled: true,
    } as ContinuousMappingDef,

    // Eyebrow raise → vibrato depth
    {
      type: 'continuous',
      id: 'brow-to-vibrato',
      name: 'Eyebrow to Vibrato',
      source: 'face.browRaise',
      target: 'expression.vibratoDepth',
      inputRange: { min: 0, max: 0.5 },
      outputRange: { min: 0, max: 40 },  // Cents
      curve: 'easeIn',
      inverted: false,
      smoothing: 0.4,
      deadZone: 0.1,
      priority: 1,
      enabled: true,
    } as ContinuousMappingDef,

    // Eyebrow asymmetry → pitch bend
    {
      type: 'continuous',
      id: 'brow-asymmetry-to-bend',
      name: 'Brow Asymmetry to Pitch Bend',
      source: 'face.rightBrowHeight',
      target: 'expression.pitchBend',
      inputRange: { min: 0.3, max: 0.7 },
      outputRange: { min: -100, max: 100 },  // Cents
      curve: 'linear',
      inverted: false,
      smoothing: 0.3,
      deadZone: 0.1,
      conditions: [
        {
          source: 'face.browRaise',
          operator: '>',
          value: 0.2,
        },
      ],
      priority: 1,
      enabled: true,
    } as ContinuousMappingDef,

    // Eye squint → filter resonance
    {
      type: 'continuous',
      id: 'squint-to-resonance',
      name: 'Squint to Resonance',
      source: 'face.eyeSquint',
      target: 'timbre.filterResonance',
      inputRange: { min: 0, max: 0.5 },
      outputRange: { min: 0.1, max: 0.8 },
      curve: 'exponential',
      inverted: false,
      smoothing: 0.4,
      deadZone: 0.1,
      priority: 0,
      enabled: true,
    } as ContinuousMappingDef,

    // Eye openness → attack time
    {
      type: 'manyToOne',
      id: 'eyes-to-attack',
      name: 'Eye Openness to Attack',
      sources: [
        {
          path: 'face.leftEyeOpen',
          weight: 0.5,
          curve: 'linear',
          inputRange: { min: 0.3, max: 1 },
        },
        {
          path: 'face.rightEyeOpen',
          weight: 0.5,
          curve: 'linear',
          inputRange: { min: 0.3, max: 1 },
        },
      ],
      combineMode: 'average',
      target: 'timbre.attack',
      outputRange: { min: 0.3, max: 0.01 },  // Slower when eyes closed
      priority: 0,
      enabled: true,
    } as ManyToOneMappingDef,

    // Smile curvature (asymmetry) → stereo spread
    {
      type: 'continuous',
      id: 'smile-curve-to-stereo',
      name: 'Smile Curve to Stereo',
      source: 'face.smileCurvature',
      target: 'output.stereoWidth',
      inputRange: { min: -0.3, max: 0.3 },
      outputRange: { min: 0.3, max: 1 },
      curve: 'linear',
      inverted: false,
      smoothing: 0.5,
      deadZone: 0.05,
      priority: 0,
      enabled: true,
    } as ContinuousMappingDef,

    // Cheek puff → tremolo depth
    {
      type: 'continuous',
      id: 'cheek-to-tremolo',
      name: 'Cheek Puff to Tremolo',
      source: 'face.cheekPuff',
      target: 'expression.tremoloDepth',
      inputRange: { min: 0, max: 0.5 },
      outputRange: { min: 0, max: 0.5 },
      curve: 'linear',
      inverted: false,
      smoothing: 0.3,
      deadZone: 0.1,
      priority: 0,
      enabled: true,
    } as ContinuousMappingDef,

    // Nose wrinkle → noise amount
    {
      type: 'continuous',
      id: 'nose-to-noise',
      name: 'Nose Wrinkle to Noise',
      source: 'face.noseWrinkle',
      target: 'timbre.noiseAmount',
      inputRange: { min: 0, max: 0.4 },
      outputRange: { min: 0, max: 0.3 },
      curve: 'exponential',
      inverted: false,
      smoothing: 0.3,
      deadZone: 0.1,
      priority: 0,
      enabled: true,
    } as ContinuousMappingDef,

    // Combined emotional valence → overall brightness/darkness
    {
      type: 'manyToOne',
      id: 'valence-to-color',
      name: 'Emotional Valence to Color',
      sources: [
        {
          path: 'face.smileIntensity',
          weight: 1.0,
          curve: 'linear',
          inputRange: { min: 0, max: 1 },
        },
        {
          path: 'face.browFurrow',
          weight: -0.8,  // Negative weight subtracts
          curve: 'linear',
          inputRange: { min: 0, max: 1 },
        },
        {
          path: 'face.browRaise',
          weight: 0.3,
          curve: 'linear',
          inputRange: { min: 0, max: 1 },
        },
      ],
      combineMode: 'add',
      target: 'timbre.emotionalColor',
      outputRange: { min: 0, max: 1 },  // 0=dark/sad, 1=bright/happy
      priority: 1,
      enabled: true,
    } as ManyToOneMappingDef,
  ],

  musicalConfig: {
    scale: 'major',
    root: 'C',
    tempo: 80,
    key: 'C',
    mode: 'major',
  },

  defaults: {
    'timbre.warmth': 0.5,
    'timbre.filterCutoff': 3000,
    'timbre.dissonance': 0,
    'timbre.distortion': 0,
    'timbre.vowelFormant': 0.5,
    'timbre.filterResonance': 0.3,
    'timbre.attack': 0.05,
    'timbre.noiseAmount': 0,
    'timbre.emotionalColor': 0.5,
    'output.amplitude': 0.7,
    'output.stereoWidth': 0.7,
    'expression.vibratoDepth': 10,
    'expression.pitchBend': 0,
    'expression.tremoloDepth': 0,
    'harmony.majorMinorBlend': 0.5,
    'harmony.tension': 0,
  },

  tags: ['face', 'expression', 'emotional', 'intimate', 'accessibility'],
  isSystem: true,
};
