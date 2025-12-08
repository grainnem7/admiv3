/**
 * Gaze Orchestra Preset
 *
 * Uses eye gaze to route control to different body parts.
 * Look at your right hand to control melody, left hand for bass,
 * torso for harmony, etc.
 *
 * Artistic concept: The eyes conduct the body orchestra. Your gaze
 * determines which part of your body is currently "playing," allowing
 * you to seamlessly switch between different musical roles without
 * any mode buttons or gestures.
 */

import type { MappingPreset, ContinuousMappingDef, GazeRoutingDef, ManyToOneMappingDef } from '../types';

export const gazeOrchestraPreset: MappingPreset = {
  id: 'gaze-orchestra',
  name: 'Gaze Orchestra',
  description: 'Your eyes conduct the body orchestra. Look at your right hand to play melody, left hand for bass, torso for harmony. Seamlessly switch roles with your gaze.',
  author: 'ADMI Creative Team',
  version: '1.0.0',

  mappings: [
    // Main gaze routing configuration
    {
      type: 'gazeRouting',
      id: 'gaze-router',
      name: 'Gaze Router',
      routes: [
        {
          gazeTarget: 'pose_rightWrist',
          activateController: 'rightHand',
          minFixationMs: 300,
          enableMappings: ['right-melody-pitch', 'right-melody-velocity', 'right-melody-ornament'],
          disableMappings: ['left-bass-pitch', 'torso-harmony'],
        },
        {
          gazeTarget: 'pose_leftWrist',
          activateController: 'leftHand',
          minFixationMs: 300,
          enableMappings: ['left-bass-pitch', 'left-bass-velocity'],
          disableMappings: ['right-melody-pitch', 'torso-harmony'],
        },
        {
          gazeTarget: 'pose_nose',  // Looking at center/self
          activateController: 'torso',
          minFixationMs: 400,
          enableMappings: ['torso-harmony', 'torso-texture'],
          disableMappings: ['right-melody-pitch', 'left-bass-pitch'],
        },
      ],
      defaultController: 'ambient',
      enabled: true,
    } as GazeRoutingDef,

    // Right hand melody mappings (active when gazing at right hand)
    {
      type: 'continuous',
      id: 'right-melody-pitch',
      name: 'Right Hand Melody Pitch',
      source: 'joints.rightHand_indexTip.position.y',
      target: 'melody.pitch',
      inputRange: { min: 0.2, max: 0.8 },
      outputRange: { min: 0, max: 1 },
      curve: 'linear',
      inverted: true,
      smoothing: 0.2,
      deadZone: 0.02,
      quantization: {
        scale: 'major',
        root: 'C',
        octaveRange: { min: 4, max: 6 },
        enabled: true,
      },
      priority: 2,
      enabled: false,  // Starts disabled, enabled by gaze
    } as ContinuousMappingDef,

    {
      type: 'continuous',
      id: 'right-melody-velocity',
      name: 'Right Hand Melody Velocity',
      source: 'joints.rightHand_wrist.velocity.magnitude',
      target: 'melody.velocity',
      inputRange: { min: 0, max: 0.5 },
      outputRange: { min: 0.3, max: 1 },
      curve: 'easeIn',
      inverted: false,
      smoothing: 0.3,
      deadZone: 0.02,
      priority: 1,
      enabled: false,
    } as ContinuousMappingDef,

    {
      type: 'continuous',
      id: 'right-melody-ornament',
      name: 'Right Hand Ornaments',
      source: 'joints.rightHand_wrist.curvature',
      target: 'melody.ornament',
      inputRange: { min: 0, max: 2 },
      outputRange: { min: 0, max: 1 },
      curve: 'logarithmic',
      inverted: false,
      smoothing: 0.3,
      deadZone: 0.1,
      priority: 1,
      enabled: false,
    } as ContinuousMappingDef,

    // Left hand bass mappings (active when gazing at left hand)
    {
      type: 'continuous',
      id: 'left-bass-pitch',
      name: 'Left Hand Bass Pitch',
      source: 'joints.leftHand_wrist.position.y',
      target: 'bass.pitch',
      inputRange: { min: 0.3, max: 0.7 },
      outputRange: { min: 0, max: 1 },
      curve: 'linear',
      inverted: true,
      smoothing: 0.5,
      deadZone: 0.03,
      quantization: {
        scale: 'major',
        root: 'C',
        octaveRange: { min: 1, max: 3 },
        enabled: true,
      },
      priority: 2,
      enabled: false,
    } as ContinuousMappingDef,

    {
      type: 'continuous',
      id: 'left-bass-velocity',
      name: 'Left Hand Bass Velocity',
      source: 'joints.leftHand_wrist.velocity.magnitude',
      target: 'bass.velocity',
      inputRange: { min: 0, max: 0.3 },
      outputRange: { min: 0.4, max: 1 },
      curve: 'linear',
      inverted: false,
      smoothing: 0.4,
      deadZone: 0.02,
      priority: 1,
      enabled: false,
    } as ContinuousMappingDef,

    // Torso harmony mappings (active when gazing at center)
    {
      type: 'continuous',
      id: 'torso-harmony',
      name: 'Torso Harmony',
      source: 'bodyConfig.spinalTwist',
      target: 'harmony.chordProgression',
      inputRange: { min: -0.5, max: 0.5 },
      outputRange: { min: 0, max: 1 },
      curve: 'linear',
      inverted: false,
      smoothing: 0.6,
      deadZone: 0.1,
      priority: 2,
      enabled: false,
    } as ContinuousMappingDef,

    {
      type: 'continuous',
      id: 'torso-texture',
      name: 'Torso Texture',
      source: 'bodyConfig.torsoLean.pitch',
      target: 'harmony.voiceDensity',
      inputRange: { min: -0.3, max: 0.3 },
      outputRange: { min: 0.2, max: 1 },
      curve: 'easeInOut',
      inverted: false,
      smoothing: 0.5,
      deadZone: 0.05,
      priority: 1,
      enabled: false,
    } as ContinuousMappingDef,

    // Always-on ambient mappings (active regardless of gaze)
    {
      type: 'continuous',
      id: 'ambient-texture',
      name: 'Ambient Texture',
      source: 'bodyConfig.expansionLevel',
      target: 'ambient.brightness',
      inputRange: { min: 0.2, max: 0.8 },
      outputRange: { min: 0.2, max: 0.8 },
      curve: 'linear',
      inverted: false,
      smoothing: 0.7,
      deadZone: 0.05,
      priority: 0,
      enabled: true,
    } as ContinuousMappingDef,

    {
      type: 'manyToOne',
      id: 'ambient-space',
      name: 'Ambient Space',
      sources: [
        {
          path: 'qualities.fluidity',
          weight: 0.6,
          curve: 'linear',
          inputRange: { min: 0, max: 1 },
        },
        {
          path: 'bodyConfig.bilateralSymmetry',
          weight: 0.4,
          curve: 'linear',
          inputRange: { min: 0.5, max: 1 },
        },
      ],
      combineMode: 'average',
      target: 'ambient.reverb',
      outputRange: { min: 0.2, max: 0.8 },
      priority: 0,
      enabled: true,
    } as ManyToOneMappingDef,

    // Gaze fixation → note trigger
    {
      type: 'continuous',
      id: 'fixation-to-trigger',
      name: 'Gaze Fixation Triggers Notes',
      source: 'gaze.fixationDuration',
      target: 'trigger.noteOnThreshold',
      inputRange: { min: 0, max: 500 },
      outputRange: { min: 0, max: 1 },
      curve: 'step',  // Threshold trigger
      inverted: false,
      smoothing: 0,
      deadZone: 0,
      priority: 2,
      enabled: true,
    } as ContinuousMappingDef,

    // Eye blink → staccato/accent
    {
      type: 'manyToOne',
      id: 'blink-to-accent',
      name: 'Blink to Accent',
      sources: [
        {
          path: 'face.leftEyeOpen',
          weight: -0.5,  // Lower value = closed eye
          curve: 'linear',
          inputRange: { min: 0, max: 1 },
        },
        {
          path: 'face.rightEyeOpen',
          weight: -0.5,
          curve: 'linear',
          inputRange: { min: 0, max: 1 },
        },
      ],
      combineMode: 'add',
      target: 'expression.accent',
      outputRange: { min: 0, max: 1 },
      conditions: [
        {
          source: 'face.leftEyeOpen',
          operator: '<',
          value: 0.3,
          durationMs: 50,
        },
      ],
      priority: 2,
      enabled: true,
    } as ManyToOneMappingDef,
  ],

  musicalConfig: {
    scale: 'major',
    root: 'C',
    tempo: 75,
    key: 'C',
    mode: 'major',
  },

  defaults: {
    'melody.pitch': 0.5,
    'melody.velocity': 0.7,
    'melody.ornament': 0,
    'bass.pitch': 0.3,
    'bass.velocity': 0.6,
    'harmony.chordProgression': 0.5,
    'harmony.voiceDensity': 0.5,
    'ambient.brightness': 0.5,
    'ambient.reverb': 0.4,
    'trigger.noteOnThreshold': 0,
    'expression.accent': 0,
  },

  tags: ['gaze', 'eye-control', 'multipart', 'orchestral', 'accessibility'],
  isSystem: true,
};
