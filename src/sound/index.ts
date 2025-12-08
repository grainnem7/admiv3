/**
 * Sound module exports
 */

// Legacy audio engine (preserved for compatibility)
export * from './AudioEngine';
export * from './SoundPresets';

// New polyphonic voice system
export { Voice, DEFAULT_VOICE_CONFIG } from './Voice';
export type { VoiceConfig, VoiceState } from './Voice';

export { VoiceManager } from './VoiceManager';
export type { VoiceManagerConfig } from './VoiceManager';

// Enhanced audio engine
export { AudioEngineV2, getAudioEngineV2 } from './AudioEngineV2';
export type { AudioEngineV2Config } from './AudioEngineV2';

// NEW: Tone.js-based Sound Engine (v3)
export { SoundEngine, getSoundEngine, resetSoundEngine } from './SoundEngine';
export type { SoundEngineConfig, VoiceType, PlayNoteOptions } from './SoundEngine';

// NEW: Music Theory utilities
export * from './MusicTheory';

// NEW: Chord Progressions and Melodic Patterns
export * from './ChordProgressions';
