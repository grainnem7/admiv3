/**
 * MIDI Types - Web MIDI API type definitions
 */

/** MIDI device information */
export interface MIDIDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: 'connected' | 'disconnected';
  type: 'input' | 'output';
}

/** MIDI channel assignment for different voices */
export interface MIDIChannelAssignment {
  /** Channel for melody/lead notes (1-16) */
  melody: number;
  /** Channel for bass notes (1-16) */
  bass: number;
  /** Channel for chord notes (1-16) */
  chord: number;
  /** Channel for drum/percussion (1-16, typically 10) */
  drums: number;
  /** Channel for expression/gesture sounds (1-16) */
  gesture: number;
}

/** Default channel assignments */
export const DEFAULT_CHANNEL_ASSIGNMENT: MIDIChannelAssignment = {
  melody: 1,
  bass: 2,
  chord: 3,
  drums: 10,
  gesture: 4,
};

/** MIDI output configuration */
export interface MIDIOutputConfig {
  /** Whether MIDI output is enabled */
  enabled: boolean;
  /** Selected output device ID */
  deviceId: string | null;
  /** Channel assignments */
  channels: MIDIChannelAssignment;
  /** Velocity scaling (0-1, multiplied by 127) */
  velocityScale: number;
  /** Send clock sync */
  sendClock: boolean;
  /** Current tempo for clock sync */
  tempo: number;
}

/** Default MIDI output configuration */
export const DEFAULT_MIDI_CONFIG: MIDIOutputConfig = {
  enabled: false,
  deviceId: null,
  channels: DEFAULT_CHANNEL_ASSIGNMENT,
  velocityScale: 1.0,
  sendClock: false,
  tempo: 120,
};

/** MIDI message types */
export type MIDIMessageType =
  | 'noteOn'
  | 'noteOff'
  | 'controlChange'
  | 'programChange'
  | 'pitchBend'
  | 'aftertouch'
  | 'clock'
  | 'start'
  | 'stop'
  | 'continue';

/** MIDI message structure */
export interface MIDIMessage {
  type: MIDIMessageType;
  channel: number;
  data1?: number;
  data2?: number;
  timestamp?: number;
}

/** Common MIDI CC numbers */
export const MIDI_CC = {
  MODULATION: 1,
  BREATH: 2,
  VOLUME: 7,
  PAN: 10,
  EXPRESSION: 11,
  SUSTAIN: 64,
  PORTAMENTO: 65,
  SOSTENUTO: 66,
  SOFT_PEDAL: 67,
  LEGATO: 68,
  FILTER_CUTOFF: 74,
  FILTER_RESONANCE: 71,
  ATTACK: 73,
  RELEASE: 72,
  ALL_NOTES_OFF: 123,
  ALL_SOUND_OFF: 120,
} as const;

/** Voice type for channel routing */
export type VoiceType = 'melody' | 'bass' | 'chord' | 'drums' | 'gesture';

/** Get channel for a voice type */
export function getChannelForVoice(
  voiceType: VoiceType,
  channels: MIDIChannelAssignment
): number {
  return channels[voiceType];
}
