/**
 * InstrumentVoice — alternative baton voice that plays specific instrument
 * notes constrained to the current chord, instead of the parameter-mode
 * behaviour of MelodicVoice / BassSynthVoice / ArpeggioVoice / ChordPadVoice.
 *
 * Playable axes:
 *   • **Y position** picks a chord-tone pitch from a ladder built across
 *     two octaves of the current chord's voicing.  Top of the frame =
 *     high pitch, bottom = low.
 *   • **X position** picks an octave register: left third = -1 octave,
 *     centre = 0, right third = +1 octave.  Combined with Y, the baton
 *     covers ~four octaves of chord-tone pitches — enough range for
 *     melodic phrases, not just a single arpeggio.
 *   • Notes trigger when *either* Y or X cross a zone boundary, so the
 *     baton has two independent expressive paths: hold X, move Y to
 *     arpeggiate within a register; hold Y, move X to leap octaves;
 *     diagonal motion sweeps the whole range.
 *   • The smoothed movement velocity passed in by SongPresetEngine
 *     drives note velocity AND adds a filter-brightness boost — gentle
 *     moves produce soft, dark notes; energetic moves produce loud,
 *     bright ones.
 *   • The chord is sourced from the same ChordEntry the parameter-mode
 *     voices already consume (SongPresetEngine.currentChord), so chord
 *     changes in the song automatically shift the baton's available
 *     notes.
 *
 * @see InstrumentPaletteEntry for the per-instrument tuning parameters.
 * @see SongPresetEngine for the chord-context source and voice swap logic.
 */

import type { ChordEntry } from './chordLookup';
import {
  ToneVoiceBase,
  clamp,
  LEFT_THRESHOLD,
  RIGHT_THRESHOLD,
} from './ToneVoiceBase';
import { SamplerPlayer, SAMPLE_CONFIGS } from './SamplerPlayer';
import type { Player } from './SynthPlayer';
import {
  getInstrumentEntry,
  type InstrumentPaletteEntry,
} from './presets/instrumentPalette';

// ============================================
// Module helpers
// ============================================

/**
 * Binary-search for the next beat strictly after `targetTime`.  When
 * `targetTime` falls past the last beat, extrapolate one final beat
 * interval beyond — keeps beat-snap working on the song's tail.
 *
 * Exported for unit testing; not part of the InstrumentVoice public API.
 */
export function nextBeatAfter(
  beats: readonly number[],
  targetTime: number,
): number {
  if (beats.length === 0) return targetTime;
  let lo = 0, hi = beats.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= targetTime) lo = mid + 1;
    else hi = mid;
  }
  if (lo >= beats.length) {
    const interval = beats.length >= 2
      ? beats[beats.length - 1] - beats[beats.length - 2]
      : 0.5;
    return beats[beats.length - 1] + interval;
  }
  return beats[lo];
}

// ============================================
// Tuning constants
// ============================================

/** Octave shift, in semitones, applied to the picked pitch. */
export type OctaveShift = -12 | 0 | 12;

/** Minimum interval between consecutive note triggers (seconds). */
const MIN_TRIGGER_INTERVAL_S = 0.08;

/**
 * Velocity below which a zone-crossing is ignored.
 *
 * Without this gate, a baton dragged slowly through several zones would
 * spray notes at near-zero velocity — those are below the instrument's
 * minimum velocity floor anyway and tend to sound like glitches rather
 * than expression.  Above the gate, gentle moves still register but at
 * the lower end of the configured velocity range.
 */
const VELOCITY_TRIGGER_FLOOR = 0.03;

// ============================================
// InstrumentVoice
// ============================================

export class InstrumentVoice extends ToneVoiceBase {
  private entry: InstrumentPaletteEntry;
  private player: Player;

  /** MIDI pitches the baton currently has access to, derived from the chord. */
  private availablePitches: number[] = [];
  /** Chord whose tones were last decomposed into availablePitches. */
  private lastChordName: string | null = null;

  /** Last pitch-ladder index the baton occupied; -1 means "not yet positioned". */
  private lastPitchIndex = -1;
  /**
   * Last octave register selected by X.  Sentinel value of `NaN` so
   * the first trigger is never suppressed by an accidental match.
   */
  private lastOctaveShift: number = Number.NaN;
  /**
   * ctx.currentTime when the last note triggered.  Initialised to
   * -Infinity so the very first trigger is never blocked by the
   * cooldown gate (otherwise an AudioContext that just started at
   * currentTime ≈ 0 would silently swallow the user's first note).
   */
  private lastTriggeredTime = Number.NEGATIVE_INFINITY;

  /**
   * Beat-snap mode (Session 5 Change ID 7 — "Beat Bopping").  When on,
   * baton-driven note triggers are deferred to the next beat in
   * `beatTimestamps` instead of firing immediately.  Pending triggers
   * are overwritten by later baton motion, so the LAST pitch index
   * picked before the beat is the one that plays — the user can adjust
   * until the beat hits.
   */
  private beatSnap = false;
  private beatTimestamps: readonly number[] | null = null;
  private pendingTrigger:
    | { midi: number; velocity: number; targetTime: number }
    | null = null;

  constructor(ctx: AudioContext, instrumentKey: string) {
    super(ctx);
    this.entry = getInstrumentEntry(instrumentKey);
    this.player = this.createPlayer(this.entry);
  }

  /**
   * Enable or disable beat quantisation.  When enabled, every triggered
   * note waits for the next beat from `setBeatTimestamps` before
   * actually firing — turning the baton into a beat-locked percussion
   * trigger.  Behaves as a no-op if no beat data is available.
   */
  setBeatSnap(enabled: boolean): void {
    this.beatSnap = enabled;
    if (!enabled) {
      // Drop any deferred note so disabling snap takes immediate effect.
      this.pendingTrigger = null;
    }
  }

  isBeatSnap(): boolean {
    return this.beatSnap;
  }

  /**
   * Provide the song's beat timestamp grid (in song-playback seconds).
   * The baton-snap logic uses this directly — no Tone.Transport
   * scheduling so it survives looping/seek without re-scheduling.
   * Pass null to clear (snap then becomes a no-op).
   */
  setBeatTimestamps(beats: readonly number[] | null): void {
    this.beatTimestamps = beats;
  }

  /**
   * Switch instrument at runtime (e.g. when the user picks a different
   * palette entry).  Disposes the previous Tone.Sampler and creates a
   * new one for the new sample set.
   */
  override setPreset(key: string): void {
    const next = getInstrumentEntry(key);
    if (next.key === this.entry.key) return;
    this.entry = next;
    this.player.dispose();
    this.player = this.createPlayer(next);
    // Reset trigger state so the new instrument fires on the next
    // pitch/register change, even if the baton hasn't moved since the
    // swap.
    this.lastPitchIndex = -1;
    this.lastOctaveShift = Number.NaN;
  }

  /** Currently-loaded palette key. */
  getInstrumentKey(): string {
    return this.entry.key;
  }

  private createPlayer(entry: InstrumentPaletteEntry): Player {
    return new SamplerPlayer(SAMPLE_CONFIGS[entry.sampleKey], this.filterNode);
  }

  update(playbackTime: number, chord: ChordEntry | null, velocity: number): void {
    if (!chord) return;
    if (this.isSilent() && !this.active) return;

    // Recompute the available-pitch ladder whenever the chord changes —
    // this is what makes the baton "follow" the song's harmony.
    if (chord.name !== this.lastChordName) {
      this.availablePitches = this.buildPitchLadder(chord);
      this.lastChordName = chord.name;
      // Force a re-trigger on the next axis read so the new chord is
      // audible immediately rather than waiting for the user to move.
      this.lastPitchIndex = -1;
      this.lastOctaveShift = Number.NaN;
    }

    // Fire any pending beat-snapped trigger whose target beat has passed.
    // Done BEFORE the new-trigger decision so the deferred note plays
    // before any same-frame replacement is queued.
    this.flushPendingTrigger(playbackTime);

    if (this.availablePitches.length === 0) return;

    const pitchIndex = this.getPitchIndex();
    const octaveShift = this.getOctaveShift();
    const pitchChanged = pitchIndex !== this.lastPitchIndex;
    const octaveChanged = octaveShift !== this.lastOctaveShift;
    if (!pitchChanged && !octaveChanged) return;

    // Movement below the velocity floor is treated as drift, not intent.
    if (velocity < VELOCITY_TRIGGER_FLOOR) {
      this.lastPitchIndex = pitchIndex;
      this.lastOctaveShift = octaveShift;
      return;
    }

    const now = this.ctx.currentTime;
    if (now - this.lastTriggeredTime < MIN_TRIGGER_INTERVAL_S) return;

    const basePitch = this.availablePitches[pitchIndex];
    const targetMidi = basePitch + octaveShift;

    if (this.beatSnap && this.beatTimestamps && this.beatTimestamps.length > 0) {
      // Defer to next beat.  Overwrite any existing pending so the
      // LAST pitch picked before the beat is what plays — gives the
      // user a window to adjust their aim.
      const targetTime = nextBeatAfter(this.beatTimestamps, playbackTime);
      this.pendingTrigger = { midi: targetMidi, velocity, targetTime };
    } else {
      this.triggerNote(targetMidi, velocity);
      this.lastTriggeredTime = now;
    }

    this.lastPitchIndex = pitchIndex;
    this.lastOctaveShift = octaveShift;
  }

  /**
   * If a pending beat-snapped note's target time has arrived, fire it
   * and clear.  Idempotent — safe to call every frame.
   */
  private flushPendingTrigger(playbackTime: number): void {
    if (!this.pendingTrigger) return;
    if (playbackTime < this.pendingTrigger.targetTime) return;

    const now = this.ctx.currentTime;
    if (now - this.lastTriggeredTime >= MIN_TRIGGER_INTERVAL_S) {
      this.triggerNote(this.pendingTrigger.midi, this.pendingTrigger.velocity);
      this.lastTriggeredTime = now;
    }
    this.pendingTrigger = null;
  }

  onTransportStop(): void {
    this.player.releaseAll();
    this.lastPitchIndex = -1;
    this.lastOctaveShift = Number.NaN;
    this.lastTriggeredTime = Number.NEGATIVE_INFINITY;
    // Drop pending beat-snapped triggers on stop — they were aimed at
    // beats that won't arrive while the transport is paused.
    this.pendingTrigger = null;
  }

  dispose(): void {
    this.player.releaseAll();
    this.player.dispose();
    this.disposeBase();
  }

  // ============================================
  // Internal
  // ============================================

  /**
   * Build the pitch ladder from a chord's notes.
   *
   * The chord progression already supplies its own voicing for each
   * chord (e.g. D = [D3, A3, D4, F#4]).  We sort those, then layer the
   * same voicing an octave higher so the baton has a roughly two-octave
   * playable range.  Duplicate pitches are dropped, and the result is
   * sorted low→high so zone 0 (top of the baton's range) maps to the
   * highest pitch when zoneToPitchIndex inverts the index.
   */
  private buildPitchLadder(chord: ChordEntry): number[] {
    if (chord.notes.length === 0) return [];
    const lower = [...chord.notes];
    const upper = chord.notes.map((n) => n + 12);
    const all = [...lower, ...upper];
    // Dedupe (in case a chord voicing crosses an octave already) and sort.
    return Array.from(new Set(all)).sort((a, b) => a - b);
  }

  /**
   * Map the baton's current Y position directly to an index into the
   * pitch ladder.  Top of the frame = highest ladder index = highest
   * pitch, matching the musical convention where "up" means "higher".
   *
   * One zone per ladder entry (no overlap, no dead zones) — every Y
   * position has a distinct pitch.
   */
  private getPitchIndex(): number {
    const numPitches = this.availablePitches.length;
    if (numPitches <= 1) return 0;
    // posY: 0 = top, 1 = bottom.  Map to ladder index where the top
    // of the frame picks the highest pitch.
    const fromBottom = 1 - clamp(this.posY, 0, 0.999);
    return clamp(
      Math.floor(fromBottom * numPitches),
      0,
      numPitches - 1,
    );
  }

  /**
   * Map the baton's current X position to an octave shift in semitones.
   *
   * Three wide zones — the same LEFT/RIGHT thresholds the parameter-mode
   * voices already use — so the X mental model is consistent across
   * modes: "left = low, centre = mid, right = high".
   */
  private getOctaveShift(): OctaveShift {
    if (this.posX < LEFT_THRESHOLD) return -12;
    if (this.posX > RIGHT_THRESHOLD) return 12;
    return 0;
  }

  /**
   * Trigger a note on the assigned instrument.
   *
   * Two things scale with movement velocity:
   *   1. Note velocity, mapped into the instrument's configured range.
   *   2. A transient filter-brightness boost, so energetic motions sound
   *      brighter — important for single-velocity samples that can't
   *      themselves shift timbre with dynamics.
   */
  private triggerNote(midi: number, velocity: number): void {
    if (!this.player.isReady()) return;

    const { min, max } = this.entry.velocityRange;
    const noteVelocity = clamp(min + velocity * (max - min), min, max);

    // Velocity-driven filter brightness boost (transient — the
    // filterNode also tracks Y position elsewhere via the existing
    // voice ecosystem; here we just nudge upward on each trigger).
    const boost = velocity * this.entry.brightnessBoostHz;
    this.filterNode.frequency.value = clamp(
      this.filterNode.frequency.value + boost,
      200,
      12000,
    );

    this.player.triggerAttackRelease(
      midi,
      this.entry.duration,
      undefined,
      noteVelocity,
    );
    this.onNoteTrigger?.();
  }
}
