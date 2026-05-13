/**
 * Head Rhythm Mapping Node
 *
 * Detects rhythmic downward head movements ("head bops") and emits
 * percussive triggers — addresses Session 5 Change ID 6, where Tim's
 * spontaneous head bopping in time with the accompaniment was musically
 * meaningful but not captured by the instrument.
 *
 * The detector uses the head's normalised Y position over a short
 * history window: a "bop" is registered when the Y position reverses
 * direction (downward to upward) after travelling more than
 * `minDownExcursion` of frame-height since the last upward turning
 * point.  This isolates intentional bopping from involuntary tremor or
 * postural drift — both of which lack the down-then-up reversal
 * profile a deliberate bop produces.
 *
 * The bop event is emitted as a NoteEvent ('noteOn') so it can be
 * routed through the existing sound pipeline; the configured MIDI note
 * defaults to a kick-drum equivalent but can be set per-session.
 *
 * NOT registered in MappingEngine.createDefaultNodes by default — this
 * is opt-in.  Tim should discover it in an exploration context and
 * decide whether he wants it; making it default would conscript
 * unintentional movement into music, which is exactly what the session
 * notes warn against.
 */

import { MappingNode, type MappingNodeConfig, type MappingNodeOutput } from '../MappingNode';
import type { ProcessedFrame, FaceLandmarks } from '../../state/types';
import { createNoteEvent, type MusicalEvent } from '../events';

export interface HeadRhythmConfig extends MappingNodeConfig {
  /**
   * MIDI note fired on each detected bop.  Default 36 (kick drum on a
   * General MIDI drum kit, channel 10 convention).  When wired to a
   * pitched instrument instead, set this to the desired chord-root
   * pitch — SongPresetEngine can update it on chord changes.
   */
  midiNote: number;
  /**
   * Note velocity (0–1) for each bop event.  Used as-is unless the
   * caller wires up velocity from the bop's downward amplitude.
   */
  velocity: number;
  /**
   * Minimum downward excursion (in normalised frame-height units)
   * between an upward turning point and the next downward turning
   * point before a bop counts.  Tunable for Tim's range — default
   * 0.025 (≈2.5% of frame height) is small enough to catch the
   * gentle head bopping observed in session, but large enough to
   * reject tremor.
   */
  minDownExcursion: number;
  /**
   * Refractory period (ms) after a bop fires during which no new bop
   * can fire.  Prevents double-triggering on a single bop's vibration.
   */
  cooldownMs: number;
  /**
   * Index into the 478-landmark face array to use as the head's Y
   * source.  Default 1 = nose tip, which is the most stable reference
   * point under typical lighting.  Index 10 (forehead centre) is also
   * a reasonable choice.
   */
  landmarkIndex: number;
}

const DEFAULT_CONFIG: Omit<HeadRhythmConfig, 'id' | 'name' | 'inputs'> = {
  enabled: true,
  midiNote: 36,
  velocity: 0.7,
  minDownExcursion: 0.025,
  cooldownMs: 200,
  landmarkIndex: 1,
};

/**
 * Pure peak detector.  Tracks the most recent direction-of-travel and
 * the last upward turning point; emits true exactly once per
 * direction-reversal that follows a downward excursion of at least
 * `minDownExcursion` since the last upward turn.
 *
 * State is purely numeric so the detector is straightforward to test
 * without instantiating any DOM/face-detector infrastructure.
 */
export class HeadBopDetector {
  private lastY = Number.NaN;
  /**
   * Y at the moment a descent began — used to measure the descent's
   * total excursion when the direction reverses upward.  We use the
   * PREVIOUS sample's y (not the current one) because by the time we
   * detect direction = "descending", we've already moved one step away
   * from the actual top.
   */
  private descentTopY = Number.NaN;
  /** -1 = travelling up (y decreasing), +1 = travelling down (y increasing), 0 = not yet established. */
  private direction: -1 | 0 | 1 = 0;
  /** Ms timestamp of the last bop event; -Infinity means none yet. */
  private lastBopAt = Number.NEGATIVE_INFINITY;
  /**
   * Descent amplitude (normalised frame-height units) of the most
   * recent bop.  Used by callers to scale velocity / sound intensity
   * from the gesture's energy.  0 until the first bop fires.
   */
  private lastBopAmplitude = 0;

  constructor(
    private minDownExcursion: number,
    private cooldownMs: number,
  ) {}

  setConfig(minDownExcursion: number, cooldownMs: number): void {
    this.minDownExcursion = minDownExcursion;
    this.cooldownMs = cooldownMs;
  }

  reset(): void {
    this.lastY = Number.NaN;
    this.descentTopY = Number.NaN;
    this.direction = 0;
    this.lastBopAt = Number.NEGATIVE_INFINITY;
    this.lastBopAmplitude = 0;
  }

  /**
   * Descent amplitude of the most recent bop, in normalised
   * frame-height units (same scale as minDownExcursion).  Useful for
   * mapping bop energy to note velocity / sound intensity.  0 before
   * the first bop fires.
   */
  getLastBopAmplitude(): number {
    return this.lastBopAmplitude;
  }

  /**
   * Feed a new (y, timestampMs) sample.  Returns true on the frame that
   * a bop is detected — caller fires whatever musical event it likes.
   *
   * Y convention: larger value = lower on the frame (matches MediaPipe).
   * A "downward" head movement therefore INCREASES y.
   */
  step(y: number, timestampMs: number): boolean {
    if (Number.isNaN(this.lastY)) {
      this.lastY = y;
      return false;
    }

    const dy = y - this.lastY;
    const epsilon = 0.0005; // ignore noise-level wobbles
    const newDirection: -1 | 0 | 1 = dy > epsilon ? 1 : dy < -epsilon ? -1 : this.direction;

    let bopped = false;

    if (newDirection === 1 && this.direction !== 1) {
      // Just started descending.  The actual top of the descent was the
      // previous sample (before we'd moved enough to detect direction).
      this.descentTopY = this.lastY;
    } else if (newDirection === -1 && this.direction === 1) {
      // Was descending, now ascending — bottom of a bop.  this.lastY is
      // the previous sample's y, i.e. the deepest point reached before
      // the reversal (since we haven't yet stored the current y).
      if (!Number.isNaN(this.descentTopY)) {
        const excursion = this.lastY - this.descentTopY;
        if (
          excursion >= this.minDownExcursion &&
          timestampMs - this.lastBopAt >= this.cooldownMs
        ) {
          bopped = true;
          this.lastBopAt = timestampMs;
          this.lastBopAmplitude = excursion;
        }
      }
    }

    if (newDirection !== 0) this.direction = newDirection;
    this.lastY = y;
    return bopped;
  }
}

export class HeadRhythmNode extends MappingNode {
  private rhythmConfig: HeadRhythmConfig;
  private detector: HeadBopDetector;
  private faceLandmarks: FaceLandmarks | null = null;

  constructor(
    config: Partial<HeadRhythmConfig> & Pick<MappingNodeConfig, 'id' | 'name'>,
  ) {
    const fullConfig: HeadRhythmConfig = {
      ...DEFAULT_CONFIG,
      inputs: [],
      ...config,
    };
    super(fullConfig);
    this.rhythmConfig = fullConfig;
    this.detector = new HeadBopDetector(fullConfig.minDownExcursion, fullConfig.cooldownMs);
  }

  /**
   * Inject face landmarks for this frame.  Called by the screen layer
   * that has access to the full TrackingFrame — mirrors the pattern
   * FaceExpressionNode uses for blendshapes.
   */
  setFaceLandmarks(landmarks: FaceLandmarks | null): void {
    this.faceLandmarks = landmarks;
  }

  process(frame: ProcessedFrame): MappingNodeOutput {
    if (!this.enabled || !this.faceLandmarks) {
      return {
        nodeId: this.id,
        value: 0,
        active: false,
        timestamp: frame.timestamp,
        events: [],
      };
    }

    const landmark = this.faceLandmarks.landmarks[this.rhythmConfig.landmarkIndex];
    if (!landmark) {
      return {
        nodeId: this.id,
        value: 0,
        active: false,
        timestamp: frame.timestamp,
        events: [],
      };
    }

    const events: MusicalEvent[] = [];
    if (this.detector.step(landmark.y, frame.timestamp)) {
      events.push(
        createNoteEvent(
          'noteOn',
          this.rhythmConfig.midiNote,
          this.rhythmConfig.velocity,
          frame.timestamp,
          'head-rhythm',
        ),
      );
    }

    return {
      nodeId: this.id,
      value: landmark.y,
      active: true,
      timestamp: frame.timestamp,
      events,
    };
  }

  setMidiNote(note: number): void {
    this.rhythmConfig.midiNote = Math.max(0, Math.min(127, Math.round(note)));
  }

  setMinDownExcursion(value: number): void {
    this.rhythmConfig.minDownExcursion = Math.max(0.005, Math.min(0.5, value));
    this.detector.setConfig(this.rhythmConfig.minDownExcursion, this.rhythmConfig.cooldownMs);
  }

  setCooldownMs(ms: number): void {
    this.rhythmConfig.cooldownMs = Math.max(0, ms);
    this.detector.setConfig(this.rhythmConfig.minDownExcursion, this.rhythmConfig.cooldownMs);
  }

  getRhythmConfig(): HeadRhythmConfig {
    return { ...this.rhythmConfig };
  }

  reset(): void {
    this.detector.reset();
  }
}
