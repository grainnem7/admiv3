/**
 * MusicController - Orchestrates the movement → mapping → sound pipeline
 *
 * This is the central controller that:
 * 1. Takes processed movement data (from tracking + feature extraction)
 * 2. Routes it through the MappingEngine
 * 3. Converts mapping results to SoundEngine actions
 * 4. Handles position-based note triggering (v1 style)
 * 5. Manages chord progressions and melodic patterns
 */

import { SoundEngine, getSoundEngine } from '../sound/SoundEngine';
import { InstrumentSampler, getInstrumentSampler } from '../sound/InstrumentSampler';
import type { InstrumentType } from '../state/instrumentZones';
import {
  generateScale,
  positionToNote,
  type ScaleType,
  type NoteName,
} from '../sound/MusicTheory';
import {
  PROGRESSIONS,
  getCurrentChord,
  nextChord,
  createProgressionState,
  type ProgressionState,
  type ChordInfo,
} from '../sound/ChordProgressions';
import { MappingEngine, getMappingEngine } from '../mapping/MappingEngine';
import type { ProcessedFrame, MappingResult, TrackingFrame } from '../state/types';
// FeatureExtractor used internally by MappingEngine
import { HandFeatureExtractor, type HandFeatures } from '../movement/HandFeatureExtractor';
import {
  MovementEventDetector,
  type MovementEvent,
} from '../movement/MovementEventDetector';
// New event types from mapping spec
import type { MusicalEvent } from '../mapping/events';
import {
  isNoteEvent,
  isChordEvent,
  isControlChangeEvent,
  isStructuralEvent,
  isSafetyEvent,
  midiToNoteName,
} from '../mapping/events';

// ============================================
// Types
// ============================================

export interface MusicControllerConfig {
  /** Root note for scales (default: 'C') */
  rootNote?: NoteName;
  /** Scale type (default: 'pentatonic') */
  scaleType?: ScaleType;
  /** Chord progression ID (default: 'contemplative') */
  progressionId?: string;
  /** Minimum time between melody notes (ms, default: 150) */
  melodyCooldownMs?: number;
  /** Minimum time between chord changes (ms, default: 2000) */
  chordCooldownMs?: number;
  /** Enable position-based note triggering (default: true) */
  positionNotesEnabled?: boolean;
  /** Position change threshold to trigger note (0-1, default: 0.05) */
  positionThreshold?: number;
  /** Use movement events for triggering (default: true) */
  useMovementEvents?: boolean;
  /** Enable hand articulation control (default: true) */
  useHandArticulation?: boolean;
  /**
   * Use new MusicalEvent system from mapping engine.
   * When enabled, subscribes to MappingEngine.onMusicalEvent() and routes
   * events to SoundEngine. This is the new spec-aligned approach.
   * @see mapping_requirements.md
   * @default true
   */
  useMusicalEvents?: boolean;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

interface NoteState {
  lastNoteTime: number;
  lastNote: string;
  lastPosition: { x: number; y: number };
  activeNoteId: string | null;
}

const DEFAULT_CONFIG: Required<MusicControllerConfig> = {
  rootNote: 'C',
  scaleType: 'pentatonic',
  progressionId: 'contemplative',
  melodyCooldownMs: 300,      // Increased to reduce note spam
  chordCooldownMs: 4000,      // Increased for smoother progressions
  positionNotesEnabled: false, // DISABLED - let zones handle sounds instead
  positionThreshold: 0.05,    // Higher threshold
  useMovementEvents: false,   // DISABLED - causing too many notes
  useHandArticulation: true,
  useMusicalEvents: false,    // DISABLED - let zones handle sounds instead
  debug: false,
};

// ============================================
// MusicController Class
// ============================================

export class MusicController {
  private config: Required<MusicControllerConfig>;
  private soundEngine: SoundEngine;
  private instrumentSampler: InstrumentSampler;
  private mappingEngine: MappingEngine;
  private handFeatureExtractor: HandFeatureExtractor;
  private movementEventDetector: MovementEventDetector;

  // Musical state
  private scale: string[] = [];
  private progressionState: ProgressionState;
  private noteState: NoteState;
  private lastChordChangeTime: number = 0;
  private movementAccumulator: number = 0;

  // Hand feature state
  private lastHandFeatures: { left: HandFeatures; right: HandFeatures } | null = null;

  // Running state
  private isRunning: boolean = false;
  private eventUnsubscribe: (() => void) | null = null;
  /** Unsubscribe function for MusicalEvent subscription */
  private musicalEventUnsubscribe: (() => void) | null = null;

  constructor(config: MusicControllerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Get singleton instances
    this.soundEngine = getSoundEngine();
    this.instrumentSampler = getInstrumentSampler();
    this.mappingEngine = getMappingEngine();

    // Create extractors
    this.handFeatureExtractor = new HandFeatureExtractor();
    this.movementEventDetector = new MovementEventDetector();

    // Initialize musical state
    this.scale = generateScale(this.config.rootNote, this.config.scaleType, 3, 6);
    this.progressionState = createProgressionState(this.config.progressionId);
    this.noteState = {
      lastNoteTime: 0,
      lastNote: '',
      lastPosition: { x: 0.5, y: 0.5 },
      activeNoteId: null,
    };
  }

  /**
   * Initialize the controller and sound engine.
   */
  async initialize(): Promise<void> {
    await this.soundEngine.initialize();
    await this.instrumentSampler.initialize();

    // Release any stuck notes from previous session
    this.soundEngine.releaseAll();

    // Subscribe to movement events (legacy system)
    if (this.config.useMovementEvents) {
      this.eventUnsubscribe = this.movementEventDetector.onEvent(
        this.handleMovementEvent.bind(this)
      );
    }

    // Subscribe to MusicalEvents from MappingEngine (new spec-aligned system)
    // @see mapping_requirements.md Section 4
    if (this.config.useMusicalEvents) {
      this.musicalEventUnsubscribe = this.mappingEngine.onMusicalEvent(
        this.handleMusicalEvent.bind(this)
      );
      if (this.config.debug) {
        console.log('[MusicController] Subscribed to MusicalEvents from MappingEngine');
      }
    }

    if (this.config.debug) {
      console.log('[MusicController] Initialized with scale:', this.scale.slice(0, 8));
    }
  }

  /**
   * Start processing frames.
   */
  start(): void {
    this.isRunning = true;
    if (this.config.debug) {
      console.log('[MusicController] Started');
    }
  }

  /**
   * Stop processing.
   */
  stop(): void {
    this.isRunning = false;
    this.soundEngine.releaseAll();
    if (this.config.debug) {
      console.log('[MusicController] Stopped');
    }
  }

  /**
   * Process a tracking frame and generate music.
   * This is the main entry point called each frame.
   */
  processFrame(trackingFrame: TrackingFrame): void {
    if (!this.isRunning) return;

    const timestamp = trackingFrame.timestamp;

    // Extract hand features
    const handFeatures = this.handFeatureExtractor.extract(trackingFrame);
    this.lastHandFeatures = {
      left: handFeatures.leftHand,
      right: handFeatures.rightHand,
    };

    // Get primary control position (prefer right hand, fall back to pose)
    const controlPosition = this.getControlPosition(trackingFrame, handFeatures);
    if (!controlPosition) {
      return;
    }

    // Apply hand articulation to filter if enabled
    if (this.config.useHandArticulation) {
      this.applyHandArticulation(handFeatures);
    }

    // Check for position-based note triggering
    if (this.config.positionNotesEnabled) {
      this.handlePositionNotes(controlPosition, timestamp);
    }

    // Accumulate movement for chord progression
    this.accumulateMovementForChords(controlPosition, timestamp);
  }

  /**
   * Process a pre-processed frame through the mapping engine.
   */
  processProcessedFrame(frame: ProcessedFrame): void {
    if (!this.isRunning) return;

    // Process through mapping engine
    const mappingOutput = this.mappingEngine.process(frame);

    // Detect movement events
    if (this.config.useMovementEvents) {
      this.movementEventDetector.processAll(frame.features);
    }

    // Apply mapping results to sound
    this.applyMappingResult(mappingOutput.result);
  }

  /**
   * Get primary control position from tracking data.
   */
  private getControlPosition(
    frame: TrackingFrame,
    handFeatures: { leftHand: HandFeatures; rightHand: HandFeatures }
  ): { x: number; y: number } | null {
    // Prefer right hand if tracked
    if (handFeatures.rightHand.isTracked) {
      return handFeatures.rightHand.wristPosition;
    }

    // Fall back to left hand
    if (handFeatures.leftHand.isTracked) {
      return handFeatures.leftHand.wristPosition;
    }

    // Fall back to pose right wrist (landmark 16)
    if (frame.pose?.landmarks && frame.pose.landmarks.length > 16) {
      const wrist = frame.pose.landmarks[16];
      if (wrist.visibility && wrist.visibility > 0.5) {
        return { x: wrist.x, y: wrist.y };
      }
    }

    // Fall back to pose left wrist (landmark 15)
    if (frame.pose?.landmarks && frame.pose.landmarks.length > 15) {
      const wrist = frame.pose.landmarks[15];
      if (wrist.visibility && wrist.visibility > 0.5) {
        return { x: wrist.x, y: wrist.y };
      }
    }

    return null;
  }

  /**
   * Handle position-based note triggering.
   */
  private handlePositionNotes(
    position: { x: number; y: number },
    timestamp: number
  ): void {
    // Check cooldown
    if (timestamp - this.noteState.lastNoteTime < this.config.melodyCooldownMs) {
      return;
    }

    // Check position change threshold
    const dx = position.x - this.noteState.lastPosition.x;
    const dy = position.y - this.noteState.lastPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < this.config.positionThreshold) {
      return;
    }

    // Map Y position to note (inverted: higher position = higher pitch)
    const note = positionToNote(position.y, this.scale, true);

    // Map X position to duration (left = short, right = long)
    const duration = position.x < 0.3 ? '16n' : position.x < 0.7 ? '8n' : '4n';

    // Calculate velocity based on movement speed
    const velocity = Math.min(0.9, 0.4 + distance * 5);

    // Play the note
    this.soundEngine.playNote('melody', note, { velocity, duration });

    // Update state
    this.noteState.lastNoteTime = timestamp;
    this.noteState.lastNote = note;
    this.noteState.lastPosition = { ...position };

    if (this.config.debug) {
      console.log(`[MusicController] Note: ${note} (vel: ${velocity.toFixed(2)}, dur: ${duration})`);
    }
  }

  /**
   * Apply hand articulation to sound parameters.
   */
  private applyHandArticulation(
    handFeatures: { leftHand: HandFeatures; rightHand: HandFeatures }
  ): void {
    // Use right hand articulation for filter
    if (handFeatures.rightHand.isTracked) {
      // Articulation (fist) = lower filter frequency
      const filterValue = 1 - handFeatures.rightHand.articulation;
      this.soundEngine.setFilterFrequency(filterValue);
    }

    // Use left hand spread for reverb
    if (handFeatures.leftHand.isTracked) {
      // Spread = more reverb
      const reverbValue = 0.2 + handFeatures.leftHand.spread * 0.5;
      this.soundEngine.setReverbWet(reverbValue);
    }
  }

  /**
   * Accumulate movement and trigger chord changes.
   */
  private accumulateMovementForChords(
    position: { x: number; y: number },
    timestamp: number
  ): void {
    // Calculate movement distance
    const dx = position.x - this.noteState.lastPosition.x;
    const dy = position.y - this.noteState.lastPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    this.movementAccumulator += distance;

    // Check if we should change chord
    const timeSinceLastChord = timestamp - this.lastChordChangeTime;
    if (
      timeSinceLastChord > this.config.chordCooldownMs &&
      this.movementAccumulator > 0.3
    ) {
      this.advanceChordProgression(timestamp);
      this.movementAccumulator = 0;
    }
  }

  /**
   * Advance to the next chord in the progression.
   */
  private advanceChordProgression(timestamp: number): void {
    this.progressionState = nextChord(this.progressionState);
    this.lastChordChangeTime = timestamp;

    const chord = getCurrentChord(this.progressionState);
    if (chord) {
      this.playChord(chord);
    }
  }

  /**
   * Play a chord.
   */
  private playChord(chord: ChordInfo): void {
    // Convert chord tones to full notes with octave
    const notes = chord.chordTones.map((tone, i) => {
      const octave = i < 2 ? 3 : 4; // Bass notes in lower octave
      return `${tone}${octave}`;
    });

    this.soundEngine.playChord('chord', notes, { velocity: 0.4, duration: '2n' });

    if (this.config.debug) {
      console.log(`[MusicController] Chord: ${chord.name}`);
    }
  }

  /**
   * Handle movement events (legacy system).
   */
  private handleMovementEvent(event: MovementEvent): void {
    if (!this.isRunning) return;

    switch (event.type) {
      case 'motionBurst':
        // Play an accent note on burst
        const accentNote = this.scale[Math.floor(this.scale.length * 0.7)];
        this.soundEngine.playNote('melody', accentNote, {
          velocity: 0.8 + event.intensity * 0.2,
          duration: '8n',
        });
        break;

      case 'motionOnset':
        // Could start a sustained note here if desired
        break;

      case 'motionOffset':
        // Could release sustained notes here
        break;
    }
  }

  /**
   * Handle MusicalEvents from the MappingEngine.
   *
   * This is the new spec-aligned event handler that routes
   * MusicalEvents to the appropriate SoundEngine methods.
   *
   * @see mapping_requirements.md Section 3
   */
  private handleMusicalEvent(event: MusicalEvent): void {
    if (!this.isRunning) return;

    // Route event to appropriate handler based on type
    if (isNoteEvent(event)) {
      this.handleNoteEvent(event);
    } else if (isChordEvent(event)) {
      this.handleChordEvent(event);
    } else if (isControlChangeEvent(event)) {
      this.handleControlChangeEvent(event);
    } else if (isStructuralEvent(event)) {
      this.handleStructuralMusicalEvent(event);
    } else if (isSafetyEvent(event)) {
      this.handleSafetyEvent(event);
    }
  }

  /**
   * Handle NoteEvent - play or release a single note.
   *
   * For noteOn events, we use playNote with a short duration instead of
   * noteOn/noteOff pairs, since trigger-based notes are typically brief
   * percussive hits rather than sustained notes.
   *
   * IMPORTANT: The MIDI note from the event is typically a default (60/C4).
   * We override it with the current pitch from PitchMappingNode so that
   * finger position controls pitch while gestures (pinch) trigger notes.
   */
  private handleNoteEvent(event: import('../mapping/events').NoteEvent): void {
    // Get the current pitch from the PitchMappingNode
    // This allows finger position to control pitch while gesture triggers the note
    const pitchNode = this.mappingEngine.getPitchNode();
    let midiNote = event.midiNote;

    if (pitchNode) {
      // Use the current MIDI pitch from the pitch mapping node
      midiNote = Math.round(pitchNode.getCurrentMidi());
    }

    const noteName = midiToNoteName(midiNote);

    if (event.action === 'noteOn') {
      // Use playNote with duration instead of noteOn to avoid polyphony overflow
      // This automatically handles attack and release
      this.soundEngine.playNote('melody', noteName, {
        velocity: event.velocity,
        duration: '8n', // Short note duration
      });

      if (this.config.debug) {
        console.log(`[MusicController] PlayNote: ${noteName} (vel: ${event.velocity.toFixed(2)})`);
      }
    } else {
      // noteOff - release the note (may not be needed with playNote approach)
      this.soundEngine.noteOff('melody', noteName);

      if (this.config.debug) {
        console.log(`[MusicController] NoteOff: ${noteName}`);
      }
    }
  }

  /**
   * Handle ChordEvent - play or release a chord.
   */
  private handleChordEvent(event: import('../mapping/events').ChordEvent): void {
    const noteNames = event.midiNotes.map(midiToNoteName);

    if (event.action === 'chordOn') {
      // Use chord voice for chord events
      this.soundEngine.playChord('chord', noteNames, {
        velocity: event.velocity,
        duration: '2n', // Default duration for chords
      });

      if (this.config.debug) {
        console.log(`[MusicController] ChordOn: [${noteNames.join(', ')}]${event.voicingName ? ` (${event.voicingName})` : ''}`);
      }
    } else {
      // Release all notes in the chord
      for (const noteName of noteNames) {
        this.soundEngine.noteOff('chord', noteName);
      }

      if (this.config.debug) {
        console.log(`[MusicController] ChordOff: [${noteNames.join(', ')}]`);
      }
    }
  }

  /**
   * Handle ControlChangeEvent - update continuous parameters.
   */
  private handleControlChangeEvent(event: import('../mapping/events').ControlChangeEvent): void {
    switch (event.parameter) {
      case 'volume':
        // Skip volume control - was causing issues
        break;

      case 'filter_cutoff':
        this.soundEngine.setFilterFrequency(event.value);
        break;

      case 'reverb_mix':
        this.soundEngine.setReverbWet(event.value);
        break;

      case 'delay_mix':
        this.soundEngine.setDelayWet(event.value);
        break;

      // Future: Add more parameter handlers as needed
      case 'pitch':
      case 'filter_resonance':
      case 'pan':
      case 'attack':
      case 'release':
      case 'vibrato_rate':
      case 'vibrato_depth':
      case 'harmonic_richness':
      case 'formant':
      case 'custom':
        // These parameters are not yet implemented in SoundEngine
        if (this.config.debug) {
          console.log(`[MusicController] Unhandled control parameter: ${event.parameter}`);
        }
        break;
    }
  }

  /**
   * Handle StructuralEvent - mode changes, chord progression, etc.
   */
  private handleStructuralMusicalEvent(event: import('../mapping/events').StructuralEvent): void {
    switch (event.action) {
      case 'nextChord':
        this.advanceChordProgression(event.timestamp);
        break;

      case 'previousChord':
        // Could implement reverse progression
        break;

      case 'toggleLayer':
        // Future: Layer management
        break;

      case 'switchMode':
        // Future: Mode switching
        break;

      case 'switchPreset':
        // Future: Preset switching
        break;

      case 'switchScale':
        // Future: Scale switching via event
        break;

      case 'transposeUp':
        // Future: Transposition
        break;

      case 'transposeDown':
        // Future: Transposition
        break;

      case 'startRecording':
      case 'stopRecording':
      case 'toggleLoop':
        // Future: Loop recording
        break;

      default:
        if (this.config.debug) {
          console.log(`[MusicController] Unhandled structural action: ${event.action}`);
        }
    }
  }

  /**
   * Handle SafetyEvent - mute, panic, reset.
   */
  private handleSafetyEvent(event: import('../mapping/events').SafetyEvent): void {
    switch (event.action) {
      case 'muteOn':
        this.soundEngine.setMuted(true);
        if (this.config.debug) {
          console.log('[MusicController] Mute ON');
        }
        break;

      case 'muteOff':
        this.soundEngine.setMuted(false);
        if (this.config.debug) {
          console.log('[MusicController] Mute OFF');
        }
        break;

      case 'panic':
        this.soundEngine.releaseAll();
        if (this.config.debug) {
          console.log('[MusicController] PANIC - All notes released');
        }
        break;

      case 'reset':
        this.soundEngine.releaseAll();
        this.soundEngine.setMuted(false);
        this.soundEngine.setMasterVolume(0.7);
        this.soundEngine.setFilterFrequency(0.5);
        this.soundEngine.setReverbWet(0.35);
        if (this.config.debug) {
          console.log('[MusicController] RESET - All state restored to defaults');
        }
        break;
    }
  }

  /**
   * Apply mapping result to sound engine.
   */
  private applyMappingResult(result: MappingResult): void {
    // Apply filter - MappingEngine outputs Hz (200-8000), SoundEngine expects 0-1
    if (result.filterCutoff !== undefined && Number.isFinite(result.filterCutoff)) {
      // Normalize Hz to 0-1 range (logarithmic)
      const minFreq = 200;
      const maxFreq = 8000;
      const clampedFreq = Math.max(minFreq, Math.min(maxFreq, result.filterCutoff));
      const normalized = Math.log(clampedFreq / minFreq) / Math.log(maxFreq / minFreq);
      this.soundEngine.setFilterFrequency(normalized);
    }

    // Handle triggers (but with cooldown to prevent spam)
    // Skip triggers for now as they're causing note spam
    // for (const triggerId of result.triggers) {
    //   this.handleTrigger(triggerId);
    // }
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<MusicControllerConfig>): void {
    this.config = { ...this.config, ...config };

    // Regenerate scale if root/type changed
    if (config.rootNote || config.scaleType) {
      this.scale = generateScale(this.config.rootNote, this.config.scaleType, 3, 6);
    }

    // Reset progression if changed
    if (config.progressionId) {
      this.progressionState = createProgressionState(this.config.progressionId);
    }
  }

  /**
   * Set the scale.
   */
  setScale(rootNote: NoteName, scaleType: ScaleType): void {
    this.config.rootNote = rootNote;
    this.config.scaleType = scaleType;
    this.scale = generateScale(rootNote, scaleType, 3, 6);
  }

  /**
   * Set the chord progression.
   */
  setProgression(progressionId: string): void {
    if (PROGRESSIONS[progressionId]) {
      this.config.progressionId = progressionId;
      this.progressionState = createProgressionState(progressionId);
    }
  }

  /**
   * Get current hand features (for UI display).
   */
  getHandFeatures(): { left: HandFeatures; right: HandFeatures } | null {
    return this.lastHandFeatures;
  }

  /**
   * Get current chord info.
   */
  getCurrentChord(): ChordInfo | null {
    return getCurrentChord(this.progressionState);
  }

  /**
   * Test the sound engine and initialize instrument sampler.
   */
  async testSound(): Promise<void> {
    await this.soundEngine.testSound();
    // Also ensure instrument sampler is ready
    await this.instrumentSampler.resume();
  }

  /**
   * Trigger a sound for an instrument zone.
   * Called when a body part enters a zone.
   */
  triggerZoneSound(
    zone: { type: string; color: string; soundSettings?: { pitchOffset: number; volume: number; attack: number; decay: number } },
    _definition: { type: string; sound: { frequency?: number; type: 'drum' | 'tonal' | 'percussion' } }
  ): void {
    console.log(`[MusicController] triggerZoneSound: ${zone.type}`);
    // Use the InstrumentSampler for realistic instrument sounds with custom settings
    this.instrumentSampler.trigger(zone.type as InstrumentType, 0.8, zone.soundSettings);
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.stop();
    this.eventUnsubscribe?.();
    this.musicalEventUnsubscribe?.();
    this.soundEngine.dispose();
  }
}

// ============================================
// Singleton Instance
// ============================================

let musicControllerInstance: MusicController | null = null;

export function getMusicController(): MusicController {
  if (!musicControllerInstance) {
    musicControllerInstance = new MusicController();
  }
  return musicControllerInstance;
}

export function resetMusicController(): void {
  musicControllerInstance?.dispose();
  musicControllerInstance = null;
}
