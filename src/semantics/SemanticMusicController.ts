/**
 * Semantic Music Controller
 *
 * Integration layer that connects the Movement Semantics system
 * with the existing MappingEngine and SoundEngine.
 *
 * This controller:
 * 1. Receives TrackingFrame from the tracking layer
 * 2. Extracts semantic features using MovementSemanticsExtractor
 * 3. Processes features through StatefulMappingEngine
 * 4. Converts mapping output to musical events for SoundEngine
 */

import type { TrackingFrame } from '../state/types';
import type { MovementSemanticsFrame, MappingPreset } from './types';
import type { MappingOutput } from './StatefulMappingEngine';
import {
  MovementSemanticsExtractor,
  getMovementSemanticsExtractor,
} from './MovementSemanticsExtractor';
import {
  StatefulMappingEngine,
  getStatefulMappingEngine,
} from './StatefulMappingEngine';
import { getSoundEngine, type SoundEngine, type VoiceType } from '../sound/SoundEngine';

// ============================================
// Types
// ============================================

/**
 * Musical event emitted by the controller
 */
export interface SemanticMusicalEvent {
  type: 'noteOn' | 'noteOff' | 'controlChange' | 'modeChange' | 'stateChange';
  timestamp: number;
  voice?: VoiceType;
  note?: string | number;
  velocity?: number;
  control?: string;
  value?: number | string;
  oldState?: string;
  newState?: string;
}

/**
 * Callback for musical events
 */
export type SemanticEventCallback = (event: SemanticMusicalEvent) => void;

/**
 * Controller configuration
 */
export interface SemanticMusicControllerConfig {
  /** Enable debug logging */
  debug?: boolean;
  /** Minimum interval between note triggers (ms) */
  noteDebounceMs?: number;
  /** Enable automatic sound engine updates */
  autoUpdateSound?: boolean;
  /** Smoothing factor for control changes */
  controlSmoothing?: number;
}

const DEFAULT_CONFIG: Required<SemanticMusicControllerConfig> = {
  debug: false,
  noteDebounceMs: 50,
  autoUpdateSound: true,
  controlSmoothing: 0.3,
};

// ============================================
// Musical Constants
// ============================================

const MIDI_TO_NOTE: Record<number, string> = {};
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
for (let midi = 0; midi <= 127; midi++) {
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  MIDI_TO_NOTE[midi] = `${NOTE_NAMES[noteIndex]}${octave}`;
}

function midiToNote(midi: number): string {
  return MIDI_TO_NOTE[Math.round(midi)] ?? 'C4';
}

function normalizedToMidi(value: number, minMidi: number, maxMidi: number): number {
  return Math.round(minMidi + value * (maxMidi - minMidi));
}

// ============================================
// SemanticMusicController Class
// ============================================

export class SemanticMusicController {
  private config: Required<SemanticMusicControllerConfig>;
  private extractor: MovementSemanticsExtractor;
  private mappingEngine: StatefulMappingEngine;
  private soundEngine: SoundEngine | null = null;

  private eventCallbacks: Set<SemanticEventCallback> = new Set();

  private lastMappingOutput: MappingOutput | null = null;
  private lastSemanticFrame: MovementSemanticsFrame | null = null;

  private activeNotes: Map<string, { note: string; voice: VoiceType; timestamp: number }> = new Map();
  private lastNoteTime: number = 0;

  private smoothedControls: Map<string, number> = new Map();

  private isActive: boolean = false;

  constructor(config: SemanticMusicControllerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.extractor = getMovementSemanticsExtractor();
    this.mappingEngine = getStatefulMappingEngine();
  }

  /**
   * Initialize the controller
   */
  async initialize(): Promise<void> {
    this.soundEngine = getSoundEngine();
    if (!this.soundEngine.isReady()) {
      await this.soundEngine.initialize();
    }
    this.isActive = true;

    if (this.config.debug) {
      console.log('[SemanticMusicController] Initialized');
    }
  }

  /**
   * Load a mapping preset
   */
  loadPreset(preset: MappingPreset): void {
    this.mappingEngine.loadPreset(preset);
    this.smoothedControls.clear();

    // Apply defaults
    if (preset.defaults) {
      for (const [key, value] of Object.entries(preset.defaults)) {
        if (typeof value === 'number') {
          this.smoothedControls.set(key, value);
        }
      }
    }

    if (this.config.debug) {
      console.log(`[SemanticMusicController] Loaded preset: ${preset.name}`);
    }
  }

  /**
   * Process a tracking frame through the full pipeline
   */
  process(frame: TrackingFrame): void {
    if (!this.isActive) return;

    // 1. Extract semantic features
    const semanticFrame = this.extractor.extract(frame);
    this.lastSemanticFrame = semanticFrame;

    // 2. Process through mapping engine
    const mappingOutput = this.mappingEngine.process(semanticFrame);

    // 3. Detect changes and emit events
    this.processChanges(mappingOutput);

    // 4. Update sound engine if enabled
    if (this.config.autoUpdateSound && this.soundEngine) {
      this.updateSoundEngine(mappingOutput);
    }

    this.lastMappingOutput = mappingOutput;
  }

  /**
   * Process changes between frames and emit events
   */
  private processChanges(output: MappingOutput): void {
    const now = output.timestamp;

    // Check for state changes
    if (this.lastMappingOutput) {
      for (const [machineId, newState] of output.states) {
        const oldState = this.lastMappingOutput.states.get(machineId);
        if (oldState !== newState) {
          this.emitEvent({
            type: 'stateChange',
            timestamp: now,
            control: machineId,
            oldState,
            newState,
          });
        }
      }
    }

    // Process control changes
    for (const [controlId, value] of output.controls) {
      const smoothedValue = this.smoothControl(controlId, value);
      const oldValue = this.lastMappingOutput?.controls.get(controlId);

      // Only emit if value changed significantly
      if (oldValue === undefined || Math.abs(smoothedValue - oldValue) > 0.01) {
        this.emitEvent({
          type: 'controlChange',
          timestamp: now,
          control: controlId,
          value: smoothedValue,
        });
      }
    }

    // Check for note triggers based on control values
    this.processNoteTriggers(output, now);
  }

  /**
   * Process note triggers from mapping output
   */
  private processNoteTriggers(output: MappingOutput, now: number): void {
    // Check if enough time has passed since last note
    if (now - this.lastNoteTime < this.config.noteDebounceMs) {
      return;
    }

    // Check melody.active and melody.pitch for triggering
    const melodyActive = output.controls.get('melody.active') ?? 0;
    const melodyPitch = output.controls.get('melody.pitch') ?? 0.5;
    const melodyVelocity = output.controls.get('melody.velocity') ?? 0.7;

    if (melodyActive > 0.5) {
      const midiNote = normalizedToMidi(melodyPitch, 48, 84);
      const noteName = midiToNote(midiNote);
      const noteKey = `melody_${noteName}`;

      if (!this.activeNotes.has(noteKey)) {
        // Trigger note on
        this.activeNotes.set(noteKey, { note: noteName, voice: 'melody', timestamp: now });
        this.emitEvent({
          type: 'noteOn',
          timestamp: now,
          voice: 'melody',
          note: noteName,
          velocity: melodyVelocity,
        });
        this.lastNoteTime = now;
      }
    } else {
      // Release any active melody notes
      for (const [key, noteInfo] of this.activeNotes) {
        if (key.startsWith('melody_')) {
          this.emitEvent({
            type: 'noteOff',
            timestamp: now,
            voice: noteInfo.voice,
            note: noteInfo.note,
          });
          this.activeNotes.delete(key);
        }
      }
    }

    // Similar logic for bass
    const bassActive = output.controls.get('bass.active') ??
                       (output.controls.get('bass.pitch') !== undefined ? 1 : 0);
    const bassPitch = output.controls.get('bass.pitch') ?? 0.5;
    const bassVelocity = output.controls.get('bass.velocity') ?? 0.6;

    if (bassActive > 0.5 && output.controls.has('bass.pitch')) {
      const midiNote = normalizedToMidi(bassPitch, 24, 48);
      const noteName = midiToNote(midiNote);
      const noteKey = `bass_${noteName}`;

      if (!this.activeNotes.has(noteKey)) {
        this.activeNotes.set(noteKey, { note: noteName, voice: 'bass', timestamp: now });
        this.emitEvent({
          type: 'noteOn',
          timestamp: now,
          voice: 'bass',
          note: noteName,
          velocity: bassVelocity,
        });
      }
    }
  }

  /**
   * Apply smoothing to control value
   */
  private smoothControl(controlId: string, value: number): number {
    const current = this.smoothedControls.get(controlId);
    if (current === undefined) {
      this.smoothedControls.set(controlId, value);
      return value;
    }

    const smoothed = current + (value - current) * this.config.controlSmoothing;
    this.smoothedControls.set(controlId, smoothed);
    return smoothed;
  }

  /**
   * Update sound engine based on mapping output
   */
  private updateSoundEngine(output: MappingOutput): void {
    if (!this.soundEngine) return;

    // Map semantic controls to sound engine parameters
    const filterCutoff = output.controls.get('timbre.filterCutoff') ??
                         output.controls.get('timbre.brightness');
    if (filterCutoff !== undefined) {
      // Convert to 0-1 range if it's a frequency value
      const normalized = filterCutoff > 1 ? (filterCutoff - 200) / 7800 : filterCutoff;
      this.soundEngine.setFilterFrequency(normalized);
    }

    const reverbWet = output.controls.get('effects.reverbSize') ??
                      output.controls.get('effects.reverb') ??
                      output.controls.get('ambient.reverb');
    if (reverbWet !== undefined) {
      this.soundEngine.setReverbWet(reverbWet);
    }

    const delayWet = output.controls.get('effects.delayMix');
    if (delayWet !== undefined) {
      this.soundEngine.setDelayWet(delayWet);
    }

    // Note: Individual note events are handled through emitEvent -> subscriber handles sound
    // The activeNotes map is used for tracking active notes and releasing them appropriately
  }

  /**
   * Subscribe to musical events
   */
  onEvent(callback: SemanticEventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  /**
   * Emit an event to all subscribers
   */
  private emitEvent(event: SemanticMusicalEvent): void {
    if (this.config.debug) {
      console.log(`[SemanticMusicController] Event: ${event.type}`, event);
    }

    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error('[SemanticMusicController] Event callback error:', error);
      }
    }

    // Auto-handle note events if sound engine is available
    if (this.config.autoUpdateSound && this.soundEngine) {
      if (event.type === 'noteOn' && event.voice && event.note) {
        this.soundEngine.noteOn(event.voice, event.note, event.velocity ?? 0.7);
      } else if (event.type === 'noteOff' && event.voice && event.note) {
        this.soundEngine.noteOff(event.voice, event.note);
      }
    }
  }

  /**
   * Get current semantic frame
   */
  getSemanticFrame(): MovementSemanticsFrame | null {
    return this.lastSemanticFrame;
  }

  /**
   * Get current mapping output
   */
  getMappingOutput(): MappingOutput | null {
    return this.lastMappingOutput;
  }

  /**
   * Get current state of a state machine
   */
  getState(machineId: string): string | undefined {
    return this.mappingEngine.getState(machineId);
  }

  /**
   * Get all active notes
   */
  getActiveNotes(): Map<string, { note: string; voice: VoiceType; timestamp: number }> {
    return new Map(this.activeNotes);
  }

  /**
   * Calibrate rest pose from current frame
   */
  calibrateRestPose(frame: TrackingFrame): void {
    this.extractor.calibrateRestPose(frame);
    if (this.config.debug) {
      console.log('[SemanticMusicController] Rest pose calibrated');
    }
  }

  /**
   * Set active state
   */
  setActive(active: boolean): void {
    this.isActive = active;
    if (!active) {
      // Release all notes
      for (const noteInfo of this.activeNotes.values()) {
        if (this.soundEngine) {
          this.soundEngine.noteOff(noteInfo.voice, noteInfo.note);
        }
        this.emitEvent({
          type: 'noteOff',
          timestamp: Date.now(),
          voice: noteInfo.voice,
          note: noteInfo.note,
        });
      }
      this.activeNotes.clear();
    }
  }

  /**
   * Check if controller is active
   */
  isControllerActive(): boolean {
    return this.isActive;
  }

  /**
   * Reset controller state
   */
  reset(): void {
    this.extractor.reset();
    this.mappingEngine.reset();
    this.activeNotes.clear();
    this.smoothedControls.clear();
    this.lastMappingOutput = null;
    this.lastSemanticFrame = null;
    this.lastNoteTime = 0;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.setActive(false);
    this.reset();
    this.eventCallbacks.clear();
  }
}

// ============================================
// Singleton Instance
// ============================================

let controllerInstance: SemanticMusicController | null = null;

export function getSemanticMusicController(): SemanticMusicController {
  if (!controllerInstance) {
    controllerInstance = new SemanticMusicController();
  }
  return controllerInstance;
}

export function resetSemanticMusicController(): void {
  controllerInstance?.dispose();
  controllerInstance = null;
}
