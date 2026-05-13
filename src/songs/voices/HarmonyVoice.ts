/**
 * HarmonyVoice.ts — Green object in 'harmonizer' mode.
 *
 * Plays one harmony pitch per active vocal note from the song's
 * pre-computed `harmony[]` analysis (produced by scripts/build_harmony.py).
 *
 * Each harmony entry carries four candidate intervals (3rd up, 5th up,
 * 6th up, 3rd down) — all chord-tone-snapped, so any choice is musically
 * safe. The user picks among them via the green object's vertical position:
 *
 *   Y bottom (0.875–1.0)  → thirdDn   (low harmony, dark)
 *   Y low    (0.625–0.875) → thirdUp   (close major/minor 3rd above)
 *   Y high   (0.375–0.625) → fifthUp   (open 5th)
 *   Y top    (0.0–0.375)  → sixthUp   (sweet 6th, brightest)
 *
 * If `harmony[]` is empty (song has no vocal-harmony track), the voice
 * is silent — never throws.
 */

import type { HarmonyEntry } from '../analysisLoader';
import type { ChordEntry } from './chordLookup';
import { ToneVoiceBase, clamp } from './ToneVoiceBase';
import { SynthPlayer, type Player } from './SynthPlayer';
import {
  HARMONY_PRESETS,
  HARMONY_PRESET_LIST,
  DEFAULT_HARMONY_PRESET,
  type HarmonyPreset,
} from './presets/harmonyPresets';

export { HARMONY_PRESET_LIST };

type IntervalChoice = 'thirdDn' | 'thirdUp' | 'fifthUp' | 'sixthUp';

export class HarmonyVoice extends ToneVoiceBase {
  private currentPreset: HarmonyPreset = HARMONY_PRESETS[DEFAULT_HARMONY_PRESET];
  private player: Player;
  private harmony: HarmonyEntry[] = [];

  // Last triggered note + entry index, so we don't re-trigger every frame
  private lastEntryIndex = -1;
  private lastTriggeredMidi: number | null = null;
  private lastIntervalChoice: IntervalChoice | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    this.player = new SynthPlayer(this.currentPreset.synthConfig, this.filterNode);
  }

  setHarmony(harmony: HarmonyEntry[]): void {
    this.harmony = harmony ?? [];
    this.lastEntryIndex = -1;
    this.lastTriggeredMidi = null;
  }

  override setPreset(key: string): void {
    const preset = HARMONY_PRESETS[key];
    if (!preset) return;
    this.currentPreset = preset;
    this.player.dispose();
    this.player = new SynthPlayer(preset.synthConfig, this.filterNode);
  }

  update(playbackTime: number, _chord: ChordEntry | null, _velocity: number): void {
    if (this.isSilent() && !this.active) return;
    if (this.harmony.length === 0) return;

    const idx = this.findActiveEntryIndex(playbackTime);
    if (idx === -1) {
      // No vocal note at this moment — release any held tail
      if (this.lastTriggeredMidi !== null) {
        this.player.releaseAll();
        this.lastTriggeredMidi = null;
      }
      this.lastEntryIndex = -1;
      return;
    }

    const entry = this.harmony[idx];
    const intervalChoice = this.intervalFromY(this.posY);
    const midi = entry.harmonies[intervalChoice].midi;

    // Re-trigger only when entry changes OR interval choice changes mid-entry
    if (idx !== this.lastEntryIndex || intervalChoice !== this.lastIntervalChoice) {
      if (!this.player.isReady()) return;
      const noteVelocity = clamp(0.4 + this.velocity * 0.5, 0.4, 0.9);
      this.player.triggerAttackRelease(
        midi,
        Math.max(entry.duration, this.currentPreset.duration),
        undefined,
        noteVelocity,
      );
      this.lastEntryIndex = idx;
      this.lastTriggeredMidi = midi;
      this.lastIntervalChoice = intervalChoice;
      this.onNoteTrigger?.();
    }
  }

  onTransportStart(): void {
    this.lastEntryIndex = -1;
    this.lastTriggeredMidi = null;
    this.lastIntervalChoice = null;
  }

  onTransportStop(): void {
    this.player.releaseAll();
    this.lastEntryIndex = -1;
    this.lastTriggeredMidi = null;
    this.lastIntervalChoice = null;
  }

  dispose(): void {
    this.player.releaseAll();
    this.player.dispose();
    this.disposeBase();
  }

  // ---- Internal ----

  /**
   * Map vertical hand position to one of four interval choices.
   * Y is normalised 0 (top) to 1 (bottom) in this codebase's convention.
   */
  private intervalFromY(y: number): IntervalChoice {
    if (y < 0.375) return 'sixthUp';
    if (y < 0.625) return 'fifthUp';
    if (y < 0.875) return 'thirdUp';
    return 'thirdDn';
  }

  /**
   * Linear scan to find the harmony entry active at `playbackTime`.
   * Could be made O(log n) with binary search, but harmony arrays are
   * typically a few hundred entries; linear with a starting hint at the
   * last index is plenty fast enough for the 60 Hz update loop.
   */
  private findActiveEntryIndex(playbackTime: number): number {
    // Hint search around lastEntryIndex
    const startHint =
      this.lastEntryIndex >= 0 ? Math.max(0, this.lastEntryIndex - 1) : 0;
    for (let i = startHint; i < this.harmony.length; i++) {
      const e = this.harmony[i];
      if (playbackTime < e.time) {
        // Past this entry's start without entering it — no active entry
        return -1;
      }
      if (playbackTime < e.time + e.duration) {
        return i;
      }
    }
    // If we ran past the last entry or our hint was too high, do a full scan
    if (startHint > 0) {
      for (let i = 0; i < startHint; i++) {
        const e = this.harmony[i];
        if (playbackTime >= e.time && playbackTime < e.time + e.duration) {
          return i;
        }
      }
    }
    return -1;
  }
}
