/**
 * AccompanimentEngine - Generates harmonically compatible accompaniment
 *
 * Produces MusicalEvent[] (not audio) that MusicController routes through
 * the existing SoundEngine + MIDI pipeline.
 *
 * Features:
 * - Pattern-based generation (pad, drone, arpeggio, bassline)
 * - User-controllable tension, density, volume
 * - Predictive double-buffering for smooth chord transitions
 * - Subscribes to HarmonyManager context changes
 *
 * Design principle: assistive co-creator, not dominant performer.
 */

import type { MusicalEvent } from '../mapping/events/MusicalEvents';
import {
  createNoteEvent,
  createChordEvent,
} from '../mapping/events/MusicalEvents';
import { type NoteName, NOTE_NAMES } from '../sound/MusicTheory';
import type { ChordInfo } from '../sound/ChordProgressions';
import type { HarmonyManager } from './HarmonyManager';
import type { AccompanimentPattern, AccompanimentSettings, ScheduledNote, HarmonyContext } from './types';
import { ACCOMPANIMENT_PATTERNS, getStepsForDensity, type PatternStep } from './AccompanimentPatterns';

// ============================================
// Types
// ============================================

interface EngineState {
  /** Whether engine is active */
  enabled: boolean;
  /** Current pattern type */
  pattern: AccompanimentPattern;
  /** Tension 0-1 */
  tension: number;
  /** Density 0-1 */
  density: number;
  /** Volume 0-1 */
  volume: number;
  /** BPM for timing calculations */
  bpm: number;
}

interface BufferedChord {
  /** Scheduled notes for this chord */
  notes: ScheduledNote[];
  /** Timestamp when this buffer starts */
  startTime: number;
  /** Duration of this buffer in ms */
  durationMs: number;
  /** Active note-off timers */
  activeNoteOffs: Set<number>;
}

// ============================================
// AccompanimentEngine
// ============================================

export class AccompanimentEngine {
  private harmonyManager: HarmonyManager;
  private state: EngineState;

  // Double buffering
  private currentBuffer: BufferedChord | null = null;
  private lastChordChangeTime: number = 0;
  private lastTickTime: number = 0;

  // Active sustained notes (MIDI numbers) for cleanup
  private activeSustainedNotes: Map<number, string> = new Map(); // midi -> voiceId

  // Context change listener
  private contextUnsubscribe: (() => void) | null = null;

  constructor(harmonyManager: HarmonyManager) {
    this.harmonyManager = harmonyManager;
    this.state = {
      enabled: false,
      pattern: 'pad',
      tension: 0.3,
      density: 0.4,
      volume: 0.5,
      bpm: 80,
    };

    // Subscribe to harmony context changes
    this.contextUnsubscribe = this.harmonyManager.onContextChange(
      this.handleContextChange.bind(this)
    );
  }

  // ============================================
  // Configuration
  // ============================================

  setEnabled(enabled: boolean): void {
    this.state.enabled = enabled;
    if (!enabled) {
      this.releaseAllSustained();
      this.currentBuffer = null;
    }
  }

  setPattern(pattern: AccompanimentPattern): void {
    if (this.state.pattern !== pattern) {
      this.releaseAllSustained();
      this.state.pattern = pattern;
      this.regenerateBuffer(Date.now());
    }
  }

  setTension(tension: number): void {
    this.state.tension = Math.max(0, Math.min(1, tension));
  }

  setDensity(density: number): void {
    if (Math.abs(this.state.density - density) > 0.05) {
      this.state.density = Math.max(0, Math.min(1, density));
      this.regenerateBuffer(Date.now());
    } else {
      this.state.density = Math.max(0, Math.min(1, density));
    }
  }

  setVolume(volume: number): void {
    this.state.volume = Math.max(0, Math.min(1, volume));
  }

  setBpm(bpm: number): void {
    this.state.bpm = Math.max(30, Math.min(300, bpm));
  }

  /** Apply full settings from store */
  applySettings(settings: AccompanimentSettings): void {
    this.setPattern(settings.pattern);
    this.setTension(settings.tension);
    this.setDensity(settings.density);
    this.setVolume(settings.volume);
    this.setEnabled(settings.enabled);
  }

  isEnabled(): boolean {
    return this.state.enabled;
  }

  // ============================================
  // Core Tick - Called each frame by MusicController
  // ============================================

  /**
   * Generate accompaniment events for this frame.
   * Returns MusicalEvent[] to be emitted through the event pipeline.
   */
  tick(timestamp: number): MusicalEvent[] {
    if (!this.state.enabled) return [];

    const events: MusicalEvent[] = [];

    // Initialize buffer if needed
    if (!this.currentBuffer) {
      this.regenerateBuffer(timestamp);
      this.lastChordChangeTime = timestamp;
    }

    const buffer = this.currentBuffer;
    if (!buffer) return [];

    const patternDef = ACCOMPANIMENT_PATTERNS[this.state.pattern];

    // For sustained patterns (pad, drone): emit chord on first tick after chord change
    if (patternDef.sustained) {
      if (timestamp - this.lastChordChangeTime < 50) {
        // Just changed chord - release old and trigger new sustained notes
        events.push(...this.generateSustainedEvents(buffer, timestamp));
      }
    } else {
      // For rhythmic patterns (arpeggio, bassline): check scheduled notes
      events.push(...this.checkScheduledNotes(buffer, timestamp));
    }

    this.lastTickTime = timestamp;
    return events;
  }

  // ============================================
  // Pattern Generation
  // ============================================

  private regenerateBuffer(timestamp: number): void {
    const chord = this.harmonyManager.getCurrentChord();
    if (!chord) {
      this.currentBuffer = null;
      return;
    }

    const patternDef = ACCOMPANIMENT_PATTERNS[this.state.pattern];
    const steps = getStepsForDensity(patternDef, this.state.density);
    const beatDurationMs = 60000 / this.state.bpm;
    const bufferDurationMs = patternDef.lengthBeats * beatDurationMs;

    const notes = this.stepsToScheduledNotes(steps, chord, patternDef, beatDurationMs);

    this.currentBuffer = {
      notes,
      startTime: timestamp,
      durationMs: bufferDurationMs,
      activeNoteOffs: new Set(),
    };
  }

  private stepsToScheduledNotes(
    steps: PatternStep[],
    chord: ChordInfo,
    patternDef: { voiceType: 'melody' | 'bass' | 'chord' },
    beatDurationMs: number
  ): ScheduledNote[] {
    const chordMidi = this.chordInfoToMidi(chord, patternDef.voiceType);

    return steps.map((step) => {
      let midiNote: number;

      if (step.degree >= 0 && step.degree < chordMidi.length) {
        midiNote = chordMidi[step.degree];
      } else if (step.degree < 0) {
        // Negative degrees: approach tone below root
        midiNote = chordMidi[0] + step.degree;
      } else {
        // Degree beyond chord tones: use scale
        const scaleMidi = this.harmonyManager.getScaleMidiNotes(
          patternDef.voiceType === 'bass' ? 1 : 3,
          patternDef.voiceType === 'bass' ? 3 : 5
        );
        const rootMidi = chordMidi[0];
        // Find scale note closest to root + degree semitones above
        const targetMidi = rootMidi + step.degree;
        midiNote = scaleMidi.reduce((closest, note) =>
          Math.abs(note - targetMidi) < Math.abs(closest - targetMidi) ? note : closest,
          scaleMidi[0]
        );
      }

      // Apply tension: shift toward extensions (add semitone wobble)
      if (this.state.tension > 0.5 && step.degree > 0) {
        const tensionShift = Math.random() < (this.state.tension - 0.5) ? 1 : 0;
        if (tensionShift && Math.random() < 0.3) {
          midiNote += Math.random() < 0.5 ? 1 : -1;
          // Re-quantize to scale
          midiNote = this.harmonyManager.quantizeNote(midiNote);
        }
      }

      return {
        midiNote,
        velocity: step.velocity * this.state.volume,
        offsetMs: step.beatOffset * beatDurationMs,
        durationMs: step.durationBeats * beatDurationMs,
        voiceType: patternDef.voiceType,
      };
    });
  }

  /**
   * Convert ChordInfo to MIDI notes in the appropriate octave range.
   */
  private chordInfoToMidi(chord: ChordInfo, voiceType: 'melody' | 'bass' | 'chord'): number[] {
    const octave = voiceType === 'bass' ? 2 : voiceType === 'chord' ? 3 : 4;

    return chord.chordTones.map((toneName) => {
      // Handle flat note names
      const flatToSharp: Record<string, string> = {
        'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#',
        'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
      };
      const resolvedName = flatToSharp[toneName] ?? toneName;
      const noteIndex = NOTE_NAMES.indexOf(resolvedName as NoteName);

      if (noteIndex === -1) return 60; // fallback

      return (octave + 1) * 12 + noteIndex;
    });
  }

  // ============================================
  // Event Generation
  // ============================================

  /**
   * Generate events for sustained patterns (pad, drone).
   * Releases old notes and triggers new ones.
   */
  private generateSustainedEvents(buffer: BufferedChord, timestamp: number): MusicalEvent[] {
    const events: MusicalEvent[] = [];

    // Release all currently sustained notes
    const releaseEvents = this.createReleaseEvents(timestamp);
    events.push(...releaseEvents);

    // For pad pattern, emit as a ChordEvent
    const patternDef = ACCOMPANIMENT_PATTERNS[this.state.pattern];
    if (patternDef.id === 'pad' && buffer.notes.length > 1) {
      const midiNotes = buffer.notes.map((n) => n.midiNote);
      const avgVelocity =
        buffer.notes.reduce((sum, n) => sum + n.velocity, 0) / buffer.notes.length;

      events.push(
        createChordEvent(
          'chordOn',
          midiNotes,
          avgVelocity,
          timestamp,
          `accomp-${this.state.pattern}`,
          buffer.notes.map((_, i) => `accomp-${this.state.pattern}-${i}`)
        )
      );

      // Track sustained notes
      for (const note of buffer.notes) {
        this.activeSustainedNotes.set(note.midiNote, `accomp-${this.state.pattern}`);
      }
    } else {
      // Drone or single note: emit individual NoteEvents
      for (const note of buffer.notes) {
        events.push(
          createNoteEvent(
            'noteOn',
            note.midiNote,
            note.velocity,
            timestamp,
            `accomp-${this.state.pattern}-${note.midiNote}`
          )
        );
        this.activeSustainedNotes.set(note.midiNote, `accomp-${this.state.pattern}-${note.midiNote}`);
      }
    }

    return events;
  }

  /**
   * Check and emit scheduled notes for rhythmic patterns.
   */
  private checkScheduledNotes(buffer: BufferedChord, timestamp: number): MusicalEvent[] {
    const events: MusicalEvent[] = [];
    const elapsed = timestamp - buffer.startTime;

    // Loop the pattern
    const loopedElapsed = elapsed % buffer.durationMs;

    for (let i = 0; i < buffer.notes.length; i++) {
      const note = buffer.notes[i];
      const noteStartMs = note.offsetMs;
      const noteEndMs = noteStartMs + note.durationMs;
      const lastElapsed = (this.lastTickTime - buffer.startTime) % buffer.durationMs;

      // Check if we crossed the note start since last tick
      const crossedStart =
        (lastElapsed < noteStartMs && loopedElapsed >= noteStartMs) ||
        (loopedElapsed < lastElapsed && loopedElapsed >= noteStartMs); // loop wrapped

      if (crossedStart && !buffer.activeNoteOffs.has(i)) {
        events.push(
          createNoteEvent(
            'noteOn',
            note.midiNote,
            note.velocity,
            timestamp,
            `accomp-${this.state.pattern}-${i}`
          )
        );
        buffer.activeNoteOffs.add(i);

        // Schedule note off (approximate via next tick check)
        // We'll use a simple timer since we can't predict next tick
        setTimeout(() => {
          buffer.activeNoteOffs.delete(i);
        }, note.durationMs);
      }

      // Check if we crossed the note end
      const crossedEnd =
        (lastElapsed < noteEndMs && loopedElapsed >= noteEndMs) ||
        (loopedElapsed < lastElapsed && loopedElapsed >= noteEndMs);

      if (crossedEnd) {
        events.push(
          createNoteEvent(
            'noteOff',
            note.midiNote,
            0,
            timestamp,
            `accomp-${this.state.pattern}-${i}`
          )
        );
      }
    }

    return events;
  }

  /**
   * Create noteOff events for all currently sustained notes.
   */
  private createReleaseEvents(timestamp: number): MusicalEvent[] {
    const events: MusicalEvent[] = [];

    for (const [midiNote, voiceId] of this.activeSustainedNotes) {
      events.push(createNoteEvent('noteOff', midiNote, 0, timestamp, voiceId));
    }
    this.activeSustainedNotes.clear();

    return events;
  }

  /**
   * Release all sustained notes (for cleanup).
   */
  private releaseAllSustained(): void {
    // Note: we can't emit events here since we're not in a tick.
    // The next tick() will handle cleanup if needed.
    this.activeSustainedNotes.clear();
    this.currentBuffer = null;
  }

  // ============================================
  // Context Change Handler
  // ============================================

  private handleContextChange(_context: HarmonyContext): void {
    if (!this.state.enabled) return;

    const now = Date.now();
    this.lastChordChangeTime = now;
    this.regenerateBuffer(now);
  }

  // ============================================
  // Cleanup
  // ============================================

  dispose(): void {
    this.contextUnsubscribe?.();
    this.releaseAllSustained();
    this.currentBuffer = null;
  }
}

// ============================================
// Singleton
// ============================================

let engineInstance: AccompanimentEngine | null = null;

export function getAccompanimentEngine(harmonyManager: HarmonyManager): AccompanimentEngine {
  if (!engineInstance) {
    engineInstance = new AccompanimentEngine(harmonyManager);
  }
  return engineInstance;
}
