/**
 * Instrument Zones - Draggable instruments that can be placed in the webcam view
 *
 * Users can drag instruments into the camera view and assign body parts to trigger them.
 */

export type InstrumentType =
  | 'kick'
  | 'snare'
  | 'hihat'
  | 'cymbal'
  | 'tom'
  | 'clap'
  | 'piano-low'
  | 'piano-mid'
  | 'piano-high'
  | 'synth-pad'
  | 'bell'
  | 'woodblock';

export type TriggerBodyPart =
  | 'any'
  | 'rightHand'
  | 'leftHand'
  | 'eitherHand'
  | 'head'
  | 'rightFoot'
  | 'leftFoot';

/** Finger configuration for hand triggers */
export interface FingerConfig {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
}

/** Zone trigger configuration */
export interface ZoneTriggerConfig {
  bodyPart: TriggerBodyPart;
  fingers: FingerConfig;
}

/** Default finger config (all enabled) */
export const DEFAULT_FINGER_CONFIG: FingerConfig = {
  thumb: true,
  index: true,
  middle: true,
  ring: true,
  pinky: true,
};

/** Default trigger config */
export const DEFAULT_TRIGGER_CONFIG: ZoneTriggerConfig = {
  bodyPart: 'any',
  fingers: { ...DEFAULT_FINGER_CONFIG },
};

/** Sound customization settings per zone */
export interface ZoneSoundSettings {
  /** Pitch offset in semitones (-12 to +12) */
  pitchOffset: number;
  /** Volume level (0 to 1) */
  volume: number;
  /** Attack time multiplier (0.1 to 3) */
  attack: number;
  /** Decay/release time multiplier (0.1 to 3) */
  decay: number;
}

/** Default sound settings */
export const DEFAULT_SOUND_SETTINGS: ZoneSoundSettings = {
  pitchOffset: 0,
  volume: 0.8,
  attack: 1,
  decay: 1,
};

export interface InstrumentZone {
  id: string;
  type: InstrumentType;
  /** Position in normalized coordinates (0-1) relative to video */
  x: number;
  y: number;
  /** Size as fraction of video width */
  size: number;
  /** Which body part triggers this zone (deprecated - use triggerConfig) */
  trigger: TriggerBodyPart;
  /** Detailed trigger configuration */
  triggerConfig: ZoneTriggerConfig;
  /** Color for visual display */
  color: string;
  /** Is currently being triggered */
  isActive?: boolean;
  /** Cooldown to prevent rapid re-triggering (ms) */
  cooldownMs: number;
  /** Last trigger timestamp */
  lastTriggered?: number;
  /** Custom sound settings for this zone */
  soundSettings: ZoneSoundSettings;
}

export interface InstrumentDefinition {
  type: InstrumentType;
  name: string;
  icon: string;
  color: string;
  /** Default sound parameters */
  sound: {
    frequency?: number;
    type: 'drum' | 'tonal' | 'percussion';
    sample?: string;
  };
}

export const INSTRUMENTS: InstrumentDefinition[] = [
  // Drums
  { type: 'kick', name: 'Kick', icon: '🦶', color: '#ef4444', sound: { type: 'drum', frequency: 60 } },
  { type: 'snare', name: 'Snare', icon: '🥁', color: '#f97316', sound: { type: 'drum', frequency: 200 } },
  { type: 'hihat', name: 'Hi-Hat', icon: '🔶', color: '#eab308', sound: { type: 'percussion', frequency: 800 } },
  { type: 'cymbal', name: 'Cymbal', icon: '💿', color: '#84cc16', sound: { type: 'percussion', frequency: 1200 } },
  { type: 'tom', name: 'Tom', icon: '🪘', color: '#22c55e', sound: { type: 'drum', frequency: 120 } },
  { type: 'clap', name: 'Clap', icon: '👏', color: '#14b8a6', sound: { type: 'percussion', frequency: 1500 } },

  // Tonal
  { type: 'piano-low', name: 'Bass', icon: '🎸', color: '#06b6d4', sound: { type: 'tonal', frequency: 130 } },
  { type: 'piano-mid', name: 'Piano', icon: '🎹', color: '#3b82f6', sound: { type: 'tonal', frequency: 262 } },
  { type: 'piano-high', name: 'High', icon: '🎶', color: '#8b5cf6', sound: { type: 'tonal', frequency: 523 } },
  { type: 'synth-pad', name: 'Pad', icon: '🎛️', color: '#a855f7', sound: { type: 'tonal', frequency: 330 } },
  { type: 'bell', name: 'Bell', icon: '🔔', color: '#ec4899', sound: { type: 'tonal', frequency: 880 } },
  { type: 'woodblock', name: 'Wood', icon: '🪵', color: '#f43f5e', sound: { type: 'percussion', frequency: 600 } },
];

// Internal IDs now match user's perspective (detection code handles the mirroring)
export const TRIGGER_BODY_PARTS: { id: TriggerBodyPart; name: string; badge: string }[] = [
  { id: 'any', name: 'Any', badge: '' },
  { id: 'rightHand', name: 'Right Hand', badge: 'R' },
  { id: 'leftHand', name: 'Left Hand', badge: 'L' },
  { id: 'eitherHand', name: 'Either Hand', badge: 'RL' },
  { id: 'head', name: 'Head', badge: 'H' },
  { id: 'rightFoot', name: 'Right Foot', badge: 'RF' },
  { id: 'leftFoot', name: 'Left Foot', badge: 'LF' },
];

/** Finger names for display */
export const FINGER_NAMES: { id: keyof FingerConfig; name: string }[] = [
  { id: 'thumb', name: 'Thumb' },
  { id: 'index', name: 'Index' },
  { id: 'middle', name: 'Middle' },
  { id: 'ring', name: 'Ring' },
  { id: 'pinky', name: 'Pinky' },
];

export function getInstrumentDefinition(type: InstrumentType): InstrumentDefinition {
  return INSTRUMENTS.find(i => i.type === type) || INSTRUMENTS[0];
}

/**
 * Calculate sound settings based on zone position
 * X position (0-1) maps to pitch (-12 to +12 semitones)
 * Y position (0-1) maps to volume (1.0 at top to 0.3 at bottom)
 */
export function getSoundSettingsFromPosition(x: number, y: number): ZoneSoundSettings {
  // X: left = low pitch (-12), right = high pitch (+12)
  const pitchOffset = Math.round((x - 0.5) * 24);

  // Y: top = loud (1.0), bottom = quiet (0.3)
  const volume = 1.0 - (y * 0.7);

  return {
    pitchOffset: Math.max(-12, Math.min(12, pitchOffset)),
    volume: Math.max(0.3, Math.min(1.0, volume)),
    attack: 1,
    decay: 1,
  };
}

/**
 * Get a color based on pitch (position)
 * Left (low) = warm colors, Right (high) = cool colors
 */
export function getColorFromPosition(x: number): string {
  // Hue: 0 (red) at left, through yellow/green, to 270 (purple) at right
  const hue = Math.round(x * 270);
  return `hsl(${hue}, 70%, 50%)`;
}

export function createZone(
  type: InstrumentType,
  x: number,
  y: number,
  trigger: TriggerBodyPart = 'any'
): InstrumentZone {
  return {
    id: `zone-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    x,
    y,
    size: 0.15,  // 15% of video width
    trigger,
    triggerConfig: { ...DEFAULT_TRIGGER_CONFIG },
    color: getColorFromPosition(x),
    cooldownMs: 250,  // Prevent rapid re-triggering
    soundSettings: getSoundSettingsFromPosition(x, y),
  };
}

/** Get badge text for a trigger config */
export function getTriggerBadge(config: ZoneTriggerConfig): string {
  const part = TRIGGER_BODY_PARTS.find(p => p.id === config.bodyPart);
  return part?.badge || '';
}

/** Check if a body part is a hand type */
export function isHandTrigger(bodyPart: TriggerBodyPart): boolean {
  return bodyPart === 'rightHand' || bodyPart === 'leftHand' || bodyPart === 'eitherHand';
}

/** Check if at least one finger is enabled */
export function hasEnabledFinger(fingers: FingerConfig): boolean {
  return fingers.thumb || fingers.index || fingers.middle || fingers.ring || fingers.pinky;
}

/** Count enabled fingers */
export function countEnabledFingers(fingers: FingerConfig): number {
  return [fingers.thumb, fingers.index, fingers.middle, fingers.ring, fingers.pinky]
    .filter(Boolean).length;
}

/** Check if all fingers are enabled */
export function allFingersEnabled(fingers: FingerConfig): boolean {
  return fingers.thumb && fingers.index && fingers.middle && fingers.ring && fingers.pinky;
}
