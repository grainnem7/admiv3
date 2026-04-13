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

import { SoundEngine, getSoundEngine, type VoiceType } from '../sound/SoundEngine';
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
  type ChordInfo,
} from '../sound/ChordProgressions';
import { HarmonyManager, getHarmonyManager } from '../accompaniment/HarmonyManager';
import { AccompanimentEngine, getAccompanimentEngine } from '../accompaniment/AccompanimentEngine';
import type { PerformanceMode } from '../accompaniment/types';
import { useAppStore } from '../state/store';
import { MappingEngine, getMappingEngine } from '../mapping/MappingEngine';
import type { ProcessedFrame, MappingResult, TrackingFrame, BodyPartMusicConfig, MusicSettings } from '../state/types';
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
// MIDI output
import { MIDIOutput } from '../midi';
// Sequencer for recording
import { getSequencer } from '../music/Sequencer';

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
  /**
   * When true, internal Tone.js sounds are muted (MIDI-only mode).
   * MIDI output still works. Useful when routing to external DAW/synth.
   * @default false
   */
  internalSoundsMuted?: boolean;
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
  positionNotesEnabled: true,  // ENABLED - free play position-based notes
  positionThreshold: 0.08,    // Higher threshold to reduce note spam
  useMovementEvents: false,   // DISABLED - causing too many notes
  useHandArticulation: true,
  useMusicalEvents: true,     // ENABLED - for MusiKraken-style continuous MIDI CC
  debug: false,
  internalSoundsMuted: false, // When true, only MIDI output (no internal sounds)
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
  private bassScale: string[] = [];
  private noteStates: Record<VoiceType, NoteState>;

  // Accompaniment state
  private harmonyManager: HarmonyManager;
  private accompanimentEngine: AccompanimentEngine;
  private performanceMode: PerformanceMode = 'free';
  private harmonyContextUnsubscribe: (() => void) | null = null;
  // lastChordChangeTime and movementAccumulator removed - chord drone feature disabled

  // Hand feature state
  private lastHandFeatures: { left: HandFeatures; right: HandFeatures } | null = null;

  // Body part musical role assignments
  private bodyPartConfigs: Record<string, BodyPartMusicConfig> = {};

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
    this.bassScale = generateScale(this.config.rootNote, this.config.scaleType, 1, 3);

    // Initialize HarmonyManager
    this.harmonyManager = getHarmonyManager();
    this.harmonyManager.setKey(this.config.rootNote, this.config.scaleType);
    this.harmonyManager.setProgression(this.config.progressionId);
    this.harmonyContextUnsubscribe = this.harmonyManager.onContextChange((context) => {
      useAppStore.getState().setCurrentHarmonyContext(context);
    });

    // Initialize AccompanimentEngine
    this.accompanimentEngine = getAccompanimentEngine(this.harmonyManager);
    const defaultNoteState = (): NoteState => ({
      lastNoteTime: 0,
      lastNote: '',
      lastPosition: { x: 0.5, y: 0.5 },
      activeNoteId: null,
    });
    this.noteStates = {
      melody: defaultNoteState(),
      bass: defaultNoteState(),
      chord: defaultNoteState(),
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
   * Get the SoundEngine instance for direct control.
   */
  getSoundEngine(): SoundEngine {
    return this.soundEngine;
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

    // Inject hand features into HandExpressionNode for MusiKraken-style continuous MIDI CC
    const handExpressionNode = this.mappingEngine.getHandExpressionNode();
    if (handExpressionNode) {
      if (handFeatures.leftHand.isTracked) {
        handExpressionNode.setHandFeatures('left', handFeatures.leftHand);
      } else {
        handExpressionNode.setHandFeatures('left', null);
      }
      if (handFeatures.rightHand.isTracked) {
        handExpressionNode.setHandFeatures('right', handFeatures.rightHand);
      } else {
        handExpressionNode.setHandFeatures('right', null);
      }
    }

    // Apply hand articulation to filter if enabled
    if (this.config.useHandArticulation) {
      this.applyHandArticulation(handFeatures);
    }

    // Position-based note triggering — both hands play simultaneously
    if (this.config.positionNotesEnabled) {
      const rightPos = handFeatures.rightHand.isTracked
        ? handFeatures.rightHand.wristPosition
        : this.getPoseWristPosition(trackingFrame, 'right');
      const leftPos = handFeatures.leftHand.isTracked
        ? handFeatures.leftHand.wristPosition
        : this.getPoseWristPosition(trackingFrame, 'left');

      if (rightPos) {
        this.handlePositionNotes(rightPos, timestamp, 'melody');
      }
      if (leftPos) {
        this.handlePositionNotes(leftPos, timestamp, 'bass');
      }
    }

    // Color tracking sound is handled in PerformanceScreenV2 via theremin engine
    // (continuous tone that starts/stops with blob detection)

    // Accompaniment engine tick - generate accompaniment events
    if (this.performanceMode === 'accompaniment' && this.accompanimentEngine.isEnabled()) {
      const accompEvents = this.accompanimentEngine.tick(timestamp);
      for (const event of accompEvents) {
        this.handleMusicalEvent(event);
      }
    }
  }

  /** Octave ranges for color tracking */
  private static COLOR_RANGES: Record<string, [number, number]> = {
    low: [1, 3],
    mid: [3, 5],
    high: [5, 7],
  };

  /**
   * Process color blob position to generate notes.
   * Plays a note whenever the position maps to a different pitch than
   * the currently playing note.
   */
  processColorPosition(
    position: { x: number; y: number },
    timestamp: number,
    voice: 'melody' | 'bass' | 'chord' = 'melody',
    range: 'low' | 'mid' | 'high' = 'mid'
  ): void {
    if (!this.isRunning) {
      this.isRunning = true;
    }

    // Use the voice's note state so multiple colors don't conflict
    const noteState = this.noteStates[voice] ?? this.noteStates.melody;

    // Cooldown check
    if (timestamp - noteState.lastNoteTime < 150) {
      return;
    }

    // Generate scale for the requested range
    const [minOct, maxOct] = MusicController.COLOR_RANGES[range] ?? [3, 5];
    const rangeScale = generateScale(this.config.rootNote, this.config.scaleType, minOct, maxOct);

    // Map Y position to note (inverted: higher position = higher pitch)
    const note = positionToNote(position.y, rangeScale, true);

    // Only play if the note changed
    if (note === noteState.lastNote) {
      return;
    }

    // Map X position to duration
    const duration = position.x < 0.3 ? '16n' : position.x < 0.7 ? '8n' : '4n';

    // Play the note on the appropriate voice
    if (!this.config.internalSoundsMuted) {
      if (voice === 'chord') {
        // Play a chord rooted on this note
        const midiRoot = this.noteNameToMidi(note);
        const chordNotes = [midiRoot, midiRoot + 4, midiRoot + 7].map(midiToNoteName);
        this.soundEngine.playChord('chord', chordNotes, { velocity: 0.5, duration: '2n' });
      } else {
        this.soundEngine.playNote(voice, note, { velocity: 0.7, duration });
      }
    }

    // Send MIDI
    const midiNote = this.noteNameToMidi(note);
    const midiChannels = MIDIOutput.getConfig().channels;
    const channel = voice === 'bass' ? midiChannels.bass : midiChannels.melody;
    MIDIOutput.sendNoteOn(midiNote, 89, channel);
    const durationMs = duration === '16n' ? 100 : duration === '8n' ? 200 : 400;
    setTimeout(() => {
      MIDIOutput.sendNoteOff(midiNote, 0, channel);
    }, durationMs);

    // Update state
    noteState.lastNoteTime = timestamp;
    noteState.lastNote = note;
    noteState.lastPosition = { ...position };
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
   * Get wrist position from pose landmarks as fallback when hand tracking unavailable.
   */
  private getPoseWristPosition(
    frame: TrackingFrame,
    side: 'left' | 'right'
  ): { x: number; y: number } | null {
    const landmarkIndex = side === 'right' ? 16 : 15;
    if (frame.pose?.landmarks && frame.pose.landmarks.length > landmarkIndex) {
      const wrist = frame.pose.landmarks[landmarkIndex];
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
    timestamp: number,
    voice: VoiceType = 'melody'
  ): void {
    const noteState = this.noteStates[voice];
    const voiceScale = voice === 'bass' ? this.bassScale : this.scale;

    // Check cooldown
    if (timestamp - noteState.lastNoteTime < this.config.melodyCooldownMs) {
      return;
    }

    // Check position change threshold
    const dx = position.x - noteState.lastPosition.x;
    const dy = position.y - noteState.lastPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < this.config.positionThreshold) {
      return;
    }

    // Map Y position to note (inverted: higher position = higher pitch)
    let note = positionToNote(position.y, voiceScale, true);

    // Map X position to duration (left = short, right = long)
    const duration = position.x < 0.3 ? '16n' : position.x < 0.7 ? '8n' : '4n';
    const durationMs = duration === '16n' ? 100 : duration === '8n' ? 200 : 400;

    // Calculate velocity based on movement speed
    const velocity = Math.min(0.9, 0.4 + distance * 5);

    // Quantize to scale in constrained or accompaniment mode
    let midiNote = this.noteNameToMidi(note);
    if (this.performanceMode !== 'free') {
      midiNote = this.harmonyManager.quantizeNote(midiNote);
      note = midiToNoteName(midiNote);
    }

    // Play the note (internal sound) - skip if internal sounds are muted
    if (!this.config.internalSoundsMuted) {
      this.soundEngine.playNote(voice, note, { velocity, duration });
    }

    // Also send MIDI note (already computed above)
    const midiChannels = MIDIOutput.getConfig().channels;
    const channel = voice === 'bass' ? midiChannels.bass : midiChannels.melody;
    MIDIOutput.sendNoteOn(midiNote, velocity * 127, channel);
    // Schedule note off
    setTimeout(() => {
      MIDIOutput.sendNoteOff(midiNote, 0, channel);
    }, durationMs);

    // Update state
    noteState.lastNoteTime = timestamp;
    noteState.lastNote = note;
    noteState.lastPosition = { ...position };

    if (this.config.debug) {
      console.log(`[MusicController] ${voice}: ${note} (vel: ${velocity.toFixed(2)}, dur: ${duration})`);
    }
  }

  /**
   * Convert note name (e.g., "C4") to MIDI note number
   */
  private noteNameToMidi(noteName: string): number {
    const match = noteName.match(/^([A-G]#?)(\d+)$/);
    if (!match) return 60; // Default to middle C

    const noteMap: Record<string, number> = {
      'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
      'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
    };

    const note = match[1];
    const octave = parseInt(match[2], 10);

    return (octave + 1) * 12 + (noteMap[note] ?? 0);
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

  // accumulateMovementForChords - DISABLED to prevent unwanted chord drones
  // Movement-triggered chords were causing continuous sound issues.
  // If needed in the future, this can be re-enabled with proper edge detection.

  /**
   * Advance to the next chord in the progression.
   */
  private advanceChordProgression(_timestamp: number): void {
    this.harmonyManager.advanceChord();

    const chord = this.harmonyManager.getCurrentChord();
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

    // Play internal sound - skip if internal sounds are muted
    if (!this.config.internalSoundsMuted) {
      this.soundEngine.playChord('chord', notes, { velocity: 0.4, duration: '2n' });
    }

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
   * Also sends events to MIDI output if enabled.
   *
   * @see mapping_requirements.md Section 3
   */
  private handleMusicalEvent(event: MusicalEvent): void {
    if (!this.isRunning) return;

    // Send to MIDI output (parallel to internal sound)
    // Determine voice type for MIDI channel routing
    const voiceType = this.getVoiceTypeForEvent(event);
    MIDIOutput.processMusicalEvent(event, voiceType);

    // Route event to appropriate handler based on type
    if (isNoteEvent(event)) {
      console.log('[MusicController] NoteEvent:', event.action, event.midiNote);
      this.handleNoteEvent(event);
    } else if (isChordEvent(event)) {
      console.log('[MusicController] ChordEvent:', event.action);
      this.handleChordEvent(event);
    } else if (isControlChangeEvent(event)) {
      // Control events are handled but not logged (too frequent)
      this.handleControlChangeEvent(event);
    } else if (isStructuralEvent(event)) {
      console.log('[MusicController] StructuralEvent:', event.action);
      this.handleStructuralMusicalEvent(event);
    } else if (isSafetyEvent(event)) {
      console.log('[MusicController] SafetyEvent:', event.action);
      this.handleSafetyEvent(event);
    }
  }

  /**
   * Determine voice type for MIDI channel routing based on event
   */
  private getVoiceTypeForEvent(event: MusicalEvent): 'melody' | 'bass' | 'chord' | 'drums' | 'gesture' {
    if (isChordEvent(event)) {
      return 'chord';
    }
    if (isNoteEvent(event)) {
      // Could enhance this to detect bass notes by pitch range
      if (event.midiNote < 48) {
        return 'bass';
      }
      return 'melody';
    }
    return 'melody';
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
    const isAccompaniment = event.voiceId?.startsWith('accomp-');

    // For accompaniment events, use the MIDI note directly from the event
    // For user events, override with PitchMappingNode
    let midiNote = event.midiNote;

    if (!isAccompaniment && !this.mappingEngine.isThereminMode()) {
      const pitchNode = this.mappingEngine.getPitchNode();
      if (pitchNode) {
        midiNote = Math.round(pitchNode.getCurrentMidi());
      }
    }

    const noteName = midiToNoteName(midiNote);

    if (event.action === 'noteOn') {
      if (!this.config.internalSoundsMuted) {
        if (isAccompaniment) {
          // Route to richer accompaniment synths
          const voice = midiNote < 48 ? 'bass' as const : midiNote < 60 ? 'chord' as const : 'melody' as const;
          this.soundEngine.accompNoteOn(voice, noteName, event.velocity);
        } else if (this.mappingEngine.isThereminMode()) {
          this.soundEngine.noteOn('melody', noteName, event.velocity);
        } else {
          this.soundEngine.playNote('melody', noteName, {
            velocity: event.velocity,
            duration: '8n',
          });
        }
      }

      if (this.config.debug) {
        console.log(`[MusicController] NoteOn: ${noteName} (vel: ${event.velocity.toFixed(2)}, accomp: ${isAccompaniment})`);
      }
    } else {
      if (!this.config.internalSoundsMuted) {
        if (isAccompaniment) {
          const voice = midiNote < 48 ? 'bass' as const : midiNote < 60 ? 'chord' as const : 'melody' as const;
          this.soundEngine.accompNoteOff(voice, noteName);
        } else {
          this.soundEngine.noteOff('melody', noteName);
        }
      }

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
    const isAccompaniment = event.voicingName?.startsWith('accomp-');

    if (event.action === 'chordOn') {
      if (!this.config.internalSoundsMuted) {
        if (isAccompaniment) {
          this.soundEngine.playAccompanimentChord('chord', noteNames, {
            velocity: event.velocity,
            duration: '1n',
          });
        } else {
          this.soundEngine.playChord('chord', noteNames, {
            velocity: event.velocity,
            duration: '2n',
          });
        }
      }

      if (this.config.debug) {
        console.log(`[MusicController] ChordOn: [${noteNames.join(', ')}]${event.voicingName ? ` (${event.voicingName})` : ''}`);
      }
    } else {
      if (!this.config.internalSoundsMuted) {
        if (isAccompaniment) {
          this.soundEngine.releaseAccompaniment();
        } else {
          for (const noteName of noteNames) {
            this.soundEngine.noteOff('chord', noteName);
          }
        }
      }

      if (this.config.debug) {
        console.log(`[MusicController] ChordOff: [${noteNames.join(', ')}]`);
      }
    }
  }

  /**
   * Handle ControlChangeEvent - send MIDI CC for continuous control.
   * Internal sound engine effects are NOT modified here to avoid conflicts.
   * Internal filter/reverb/delay are controlled via applyHandArticulation() instead.
   */
  private handleControlChangeEvent(event: import('../mapping/events').ControlChangeEvent): void {
    const channel = MIDIOutput.getConfig().channels.melody;

    // Only send MIDI CC - don't modify internal sound engine
    // This keeps MIDI output clean and avoids potential audio issues
    switch (event.parameter) {
      case 'volume':
        MIDIOutput.sendControlChange(7, event.value * 127, channel); // CC#7 = Volume
        break;

      case 'filter_cutoff':
        MIDIOutput.sendControlChange(74, event.value * 127, channel); // CC#74 = Filter Cutoff
        break;

      case 'reverb_mix':
        MIDIOutput.sendControlChange(91, event.value * 127, channel); // CC#91 = Reverb
        break;

      case 'delay_mix':
        MIDIOutput.sendControlChange(94, event.value * 127, channel); // CC#94 = Delay
        break;

      case 'pitch':
        // Send pitch bend (-1 to 1, where event.value is 0-1)
        MIDIOutput.sendPitchBend((event.value - 0.5) * 2, channel);
        break;

      case 'filter_resonance':
        MIDIOutput.sendControlChange(71, event.value * 127, channel); // CC#71 = Resonance
        break;

      case 'pan':
        MIDIOutput.sendControlChange(10, event.value * 127, channel); // CC#10 = Pan
        break;

      case 'attack':
        MIDIOutput.sendControlChange(73, event.value * 127, channel); // CC#73 = Attack
        break;

      case 'release':
        MIDIOutput.sendControlChange(72, event.value * 127, channel); // CC#72 = Release
        break;

      case 'vibrato_rate':
      case 'vibrato_depth':
      case 'harmonic_richness':
      case 'formant':
      case 'custom':
        // These parameters don't have standard MIDI CCs
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

      // Accompaniment system actions
      case 'setPerformanceMode':
        if (event.targetId === 'free' || event.targetId === 'constrained' || event.targetId === 'accompaniment') {
          this.setPerformanceMode(event.targetId);
        }
        break;

      case 'setAccompanimentPattern':
        if (event.targetId) {
          useAppStore.getState().setAccompanimentSettings({ pattern: event.targetId as 'pad' | 'drone' | 'arpeggio' | 'bassline' });
        }
        break;

      case 'adjustTension':
        if (event.value !== undefined) {
          const currentSettings = useAppStore.getState().accompanimentSettings;
          useAppStore.getState().setAccompanimentSettings({
            tension: Math.max(0, Math.min(1, currentSettings.tension + event.value)),
          });
        }
        break;

      case 'adjustDensity':
        if (event.value !== undefined) {
          const currentSettings = useAppStore.getState().accompanimentSettings;
          useAppStore.getState().setAccompanimentSettings({
            density: Math.max(0, Math.min(1, currentSettings.density + event.value)),
          });
        }
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

    // Regenerate scales if root/type changed
    if (config.rootNote || config.scaleType) {
      this.scale = generateScale(this.config.rootNote, this.config.scaleType, 3, 6);
      this.bassScale = generateScale(this.config.rootNote, this.config.scaleType, 1, 3);
    }

    // Reset progression if changed
    if (config.progressionId) {
      this.harmonyManager.setProgression(this.config.progressionId);
    }
  }

  /**
   * Set the performance mode (free, constrained, accompaniment).
   */
  setPerformanceMode(mode: PerformanceMode): void {
    this.performanceMode = mode;
    useAppStore.getState().setPerformanceMode(mode);

    // Enable/disable accompaniment engine
    if (mode === 'accompaniment') {
      const settings = useAppStore.getState().accompanimentSettings;
      this.accompanimentEngine.applySettings(settings);
    } else {
      this.accompanimentEngine.setEnabled(false);
    }

    if (this.config.debug) {
      console.log(`[MusicController] Performance mode: ${mode}`);
    }
  }

  /**
   * Sync accompaniment settings from store to engine.
   */
  syncAccompanimentSettings(): void {
    const settings = useAppStore.getState().accompanimentSettings;
    this.accompanimentEngine.applySettings(settings);
  }

  /**
   * Get the current performance mode.
   */
  getPerformanceMode(): PerformanceMode {
    return this.performanceMode;
  }

  /**
   * Get the HarmonyManager instance.
   */
  getHarmonyManager(): HarmonyManager {
    return this.harmonyManager;
  }

  /**
   * Set the scale.
   */
  setScale(rootNote: NoteName, scaleType: ScaleType): void {
    this.config.rootNote = rootNote;
    this.config.scaleType = scaleType;
    this.scale = generateScale(rootNote, scaleType, 3, 6);
    this.bassScale = generateScale(rootNote, scaleType, 1, 3);
    // Sync with HarmonyManager
    this.harmonyManager.setKey(rootNote, scaleType);
  }

  /**
   * Set the chord progression.
   */
  setProgression(progressionId: string): void {
    if (PROGRESSIONS[progressionId]) {
      this.config.progressionId = progressionId;
      this.harmonyManager.setProgression(progressionId);
    }
  }

  /**
   * Set whether internal sounds are muted (MIDI-only mode).
   * When true, only MIDI output is sent - no internal Tone.js sounds.
   */
  setInternalSoundsMuted(muted: boolean): void {
    this.config.internalSoundsMuted = muted;
    if (this.config.debug) {
      console.log(`[MusicController] Internal sounds ${muted ? 'muted' : 'unmuted'}`);
    }
  }

  /**
   * Get whether internal sounds are muted.
   */
  getInternalSoundsMuted(): boolean {
    return this.config.internalSoundsMuted;
  }

  /**
   * Set body part musical role configurations.
   */
  setBodyPartConfigs(configs: Record<string, BodyPartMusicConfig>): void {
    this.bodyPartConfigs = configs;
  }

  /**
   * Get body part musical role configurations.
   */
  getBodyPartConfigs(): Record<string, BodyPartMusicConfig> {
    return this.bodyPartConfigs;
  }

  /**
   * Apply a complete MusicSettings object.
   * Syncs scale, progression, sensitivity, and forwards to SoundEngine.
   */
  applyMusicSettings(settings: MusicSettings): void {
    // Update scale (cast MusicScaleType to ScaleType)
    this.setScale(settings.rootNote as NoteName, settings.scale as ScaleType);

    // Update progression
    this.setProgression(settings.chordProgression);

    // Update controller config
    this.config.melodyCooldownMs = settings.noteInterval;
    this.config.positionThreshold = settings.movementThreshold;

    // Update body part configs
    this.bodyPartConfigs = settings.bodyPartConfigs;

    // Sync accompaniment engine tempo
    const avgBpm = (settings.tempoRange[0] + settings.tempoRange[1]) / 2;
    this.accompanimentEngine.setBpm(avgBpm);

    // Forward to SoundEngine
    this.soundEngine.applyMusicSettings(settings);
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
    return this.harmonyManager.getCurrentChord();
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

    // Use the InstrumentSampler for realistic instrument sounds - skip if internal sounds are muted
    if (!this.config.internalSoundsMuted) {
      this.instrumentSampler.trigger(zone.type as InstrumentType, 0.8, zone.soundSettings);
    }

    // Also send to MIDI output
    // Convert instrument type to a MIDI note (using pitch offset if available)
    const baseMidiNote = this.getBaseMidiNoteForInstrument(zone.type);
    const pitchOffset = zone.soundSettings?.pitchOffset ?? 0;
    const midiNote = baseMidiNote + pitchOffset;
    const velocity = zone.soundSettings?.volume ?? 0.8;

    // Determine voice type for channel routing
    const voiceType = this.getVoiceTypeForInstrument(zone.type);
    const channel = MIDIOutput.getConfig().channels[voiceType];

    // Send note on via MIDIOutput
    MIDIOutput.sendNoteOn(midiNote, velocity * 127, channel);
    // Send note off after a short duration (instrument sampler handles its own envelope)
    setTimeout(() => {
      MIDIOutput.sendNoteOff(midiNote, 0, channel);
    }, 200);

    // Record to sequencer if recording is enabled
    const sequencer = getSequencer();
    if (sequencer.isRecording()) {
      sequencer.recordNote(midiNote, velocity);
    }
  }

  /**
   * Get base MIDI note for an instrument type
   */
  private getBaseMidiNoteForInstrument(instrumentType: string): number {
    // Map instruments to sensible MIDI notes
    const noteMap: Record<string, number> = {
      'kick': 36,      // C1 - Standard kick
      'snare': 38,     // D1 - Standard snare
      'hihat': 42,     // F#1 - Closed hi-hat
      'cymbal': 49,    // C#2 - Crash cymbal
      'tom': 45,       // A1 - Low tom
      'clap': 39,      // D#1 - Hand clap
      'piano-low': 36, // C2 - Low piano
      'piano-mid': 60, // C4 - Middle C
      'piano-high': 84,// C6 - High piano
      'synth-pad': 60, // C4
      'bell': 72,      // C5
      'woodblock': 76, // E5
    };
    return noteMap[instrumentType] ?? 60;
  }

  /**
   * Get voice type for MIDI channel routing based on instrument
   */
  private getVoiceTypeForInstrument(instrumentType: string): 'melody' | 'bass' | 'chord' | 'drums' | 'gesture' {
    const drumTypes = ['kick', 'snare', 'hihat', 'cymbal', 'tom', 'clap', 'woodblock'];
    if (drumTypes.includes(instrumentType)) {
      return 'drums';
    }
    if (instrumentType === 'piano-low') {
      return 'bass';
    }
    return 'melody';
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.stop();
    this.eventUnsubscribe?.();
    this.musicalEventUnsubscribe?.();
    this.harmonyContextUnsubscribe?.();
    this.accompanimentEngine.dispose();
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
