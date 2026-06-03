/**
 * BoardSequencerEngine — standalone audio engine for the board sequencer.
 *
 * Owns: an internal look-ahead step clock (off the audio-context clock, NOT
 * Tone.Transport, so it never clashes with a song), a sampled voice per row,
 * an optional confirmation tick, and the current active-cell matrix. Routes
 * into the shared effects bus (EffectChainManager.getInput()).
 *
 * The board is standalone: own tempo, fixed pentatonic scale, no song / no
 * chordLookup. "Next loop pass" semantics are emergent — each step reads the
 * CURRENT active set via notesForStep.
 */

import * as Tone from 'tone';
import { BoardSequencerVoice } from './voices/BoardSequencerVoice';
import { voicingForCells, drumForRow, DEFAULT_DRUM_ROWS } from './boardSequencerScale';
import type { ActiveCell } from '../tracking/BoardSequencerMode';
import { getEffectChainManager } from '../effects';
import { RoundRobinDrumKit } from '../audio/instruments/RoundRobinDrumKit';
import type { HeadBopDrum } from './voices/HeadBopKit';

/** Minimal chord shape the board needs for chord-locked pitch. */
export interface BoardChord {
  notes: number[];
}

/**
 * Optional sync to a backing song. When present (with beats), the board stops
 * using its internal clock and instead fires a step on each of the song's beats
 * (tempo + phase lock), and melodic pitch is taken from the song's CURRENT
 * chord (chord-lock) instead of the standalone pentatonic.
 */
export interface BoardSyncSource {
  /** Current song playback time in seconds. */
  getTime(): number;
  /** Beat timestamps (seconds from song start), ascending. */
  beats: number[];
  /** The chord active at a given song time, or null. */
  chordAt(timeSec: number): BoardChord | null;
}

export interface BoardEngineConfig {
  bpm: number;
  rows: number;
  cols: number;
  scaleRootMidi: number;
  scaleSemitones: number[];
  noteLengthBeats: number;
  velocity: number;
  tickEnabled: boolean;
  instrumentKey: string;
  rowMode: 'pitched' | 'drumKit' | 'instruments';
  /** Layer black pieces as drums on top of a melodic mode (ignored in drumKit). */
  blackDrums: boolean;
  /** Per-row palette keys, used in 'instruments' mode (indexed by row, 0 = top). */
  rowInstruments: string[];
}

const LOOKAHEAD_SEC = 0.1;
const TICK_INTERVAL_MS = 25;

/** Largest index whose beats[idx] <= t, or -1 if none. Binary search. */
function lastIndexLEQ(beats: number[], t: number): number {
  let lo = 0;
  let hi = beats.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

export class BoardSequencerEngine {
  private ctx: AudioContext;
  private cfg: BoardEngineConfig;
  private voices: BoardSequencerVoice[] = [];
  private drumKit: RoundRobinDrumKit | null = null;
  private tick: Tone.MembraneSynth | null = null;
  private active: ActiveCell[] = [];
  private startSec = 0;
  private lastScheduledStep = -1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private muted = false;
  private syncSource: BoardSyncSource | null = null;
  private lastBeatIndex = -1;

  constructor(cfg: BoardEngineConfig) {
    this.cfg = cfg;
    // Matches the codebase's standard AudioContext acquisition
    // (see SongPresetEngine.loadSong). BoardSequencerVoice / ToneVoiceBase
    // construct their raw Web Audio nodes against this same context.
    this.ctx = Tone.getContext().rawContext as AudioContext;
  }

  async init(): Promise<void> {
    const fx = getEffectChainManager();
    await fx.initialize();
    // Shared effects-bus input: a Tone.Gain. Its `.input` is the underlying
    // native GainNode, so the voices' native outputGain can connect to it
    // directly via the inherited connect(destination: AudioNode). The tick is
    // a Tone node and connects to the Tone.Gain directly.
    const dest = fx.getInput();
    const needsDrums = this.cfg.rowMode === 'drumKit' || this.cfg.blackDrums;
    const needsVoices = this.cfg.rowMode !== 'drumKit';
    if (needsDrums) {
      this.drumKit = new RoundRobinDrumKit(this.ctx, 'studio-kit');
      if (dest) this.drumKit.connect(dest.input);
      await this.drumKit.whenReady();
    }
    if (needsVoices) {
      // One sampled voice per row. 'instruments' gives each row its own
      // instrument; 'pitched' uses the single chosen instrument for all.
      const perRow = this.cfg.rowMode === 'instruments';
      for (let r = 0; r < this.cfg.rows; r++) {
        const key = perRow
          ? (this.cfg.rowInstruments[r] ?? this.cfg.instrumentKey)
          : this.cfg.instrumentKey;
        const v = new BoardSequencerVoice(this.ctx, key);
        if (dest) v.connect(dest.input);
        this.voices.push(v);
      }
    }
    if (this.cfg.tickEnabled) {
      this.tick = new Tone.MembraneSynth({
        pitchDecay: 0.008,
        octaves: 2,
        envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.02 },
        volume: -14,
      });
      if (dest) this.tick.connect(dest);
    }
  }

  setActiveCells(cells: ActiveCell[]): void {
    this.active = cells;
  }

  /** Pause/resume all sound (the clock + detection keep running; output is silent). */
  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /** Attach (or clear) a backing song to lock tempo/beat + chords to. */
  setSyncSource(src: BoardSyncSource | null): void {
    this.syncSource = src;
    this.lastBeatIndex = -1;
  }

  /** Fire the confirmation tick immediately (distinct from a sequenced note). */
  fireTick(): void {
    if (this.muted) return;
    if (this.tick) this.tick.triggerAttackRelease('C2', 0.05, Tone.now());
  }

  start(): void {
    this.startSec = Tone.now();
    this.lastScheduledStep = -1;
    this.lastBeatIndex = -1;
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.scheduleTick(), TICK_INTERVAL_MS);
  }

  private scheduleTick(): void {
    if (this.syncSource && this.syncSource.beats.length > 0) {
      this.scheduleSynced(this.syncSource);
    } else {
      this.scheduleInternal();
    }
  }

  /** Standalone clock: advance one step per beat at the configured BPM. */
  private scheduleInternal(): void {
    const secPerBeat = 60 / this.cfg.bpm;
    const now = Tone.now();
    const beatIdx = Math.floor((now + LOOKAHEAD_SEC - this.startSec) / secPerBeat);
    const step = ((beatIdx % this.cfg.cols) + this.cfg.cols) % this.cfg.cols;
    if (step === this.lastScheduledStep) return;
    this.lastScheduledStep = step;
    const stepTime = this.startSec + beatIdx * secPerBeat;
    this.fireStep(step, stepTime, secPerBeat, null);
  }

  /** Locked to a song: fire a step on each of the song's beats, chord-locked. */
  private scheduleSynced(src: BoardSyncSource): void {
    const beats = src.beats;
    const t = src.getTime();
    const now = Tone.now();
    // Re-align the beat pointer on start / seek / loop (when it no longer
    // straddles the current song time).
    const cur = this.lastBeatIndex;
    const aligned = cur >= 0 && cur < beats.length
      && beats[cur] <= t + 0.2
      && (cur + 1 >= beats.length || beats[cur + 1] >= t - 0.2);
    if (!aligned) this.lastBeatIndex = lastIndexLEQ(beats, t);

    const horizon = t + LOOKAHEAD_SEC;
    let i = this.lastBeatIndex + 1;
    while (i < beats.length && beats[i] <= horizon) {
      const beatTime = beats[i];
      const audioTime = now + Math.max(0, beatTime - t);
      const step = ((i % this.cfg.cols) + this.cfg.cols) % this.cfg.cols;
      const spacing = i + 1 < beats.length
        ? Math.max(0.05, beats[i + 1] - beatTime)
        : (i > 0 ? Math.max(0.05, beatTime - beats[i - 1]) : 0.5);
      this.fireStep(step, audioTime, spacing, src.chordAt(beatTime));
      this.lastBeatIndex = i;
      i++;
    }
  }

  private isDrumCell(cell: ActiveCell): boolean {
    return this.cfg.rowMode === 'drumKit'
      || (this.cfg.blackDrums && cell.colour === 'black');
  }

  /** The instrument key a melodic row plays (per-row in 'instruments', else the single one). */
  private instrumentForRow(row: number): string {
    return this.cfg.rowMode === 'instruments'
      ? (this.cfg.rowInstruments[row] ?? this.cfg.instrumentKey)
      : this.cfg.instrumentKey;
  }

  /** Play every active cell in `step` at `stepTime`. chord locks melodic pitch. */
  private fireStep(step: number, stepTime: number, secPerBeat: number, chord: BoardChord | null): void {
    if (this.muted) return;
    const durSec = this.cfg.noteLengthBeats * secPerBeat;
    // Voice ALL active melodic cells together so pitch is a complementary
    // spread that depends on the whole board (re-voices as pieces change /
    // follows the chord when locked); then play only this column's cells.
    const melodic = this.active.filter(
      (c) => !this.isDrumCell(c) && c.row >= 0 && c.row < this.voices.length,
    );
    // Per-row instruments: each instrument (row) plays a melody across columns
    // → pitch by column. Pitched (single instrument): piano roll → pitch by row.
    const axis = this.cfg.rowMode === 'instruments' ? 'col' : 'row';
    const voicing = voicingForCells(
      melodic, this.cfg.scaleRootMidi, this.cfg.scaleSemitones,
      chord && chord.notes.length > 0 ? chord.notes : null, axis,
    );
    for (const cell of this.active) {
      if (cell.col !== step) continue;
      if (this.isDrumCell(cell)) {
        const drum = drumForRow(cell.row, this.cfg.rows, DEFAULT_DRUM_ROWS);
        if (drum) this.drumKit?.play(drum as HeadBopDrum, this.cfg.velocity, stepTime);
      } else {
        const midi = voicing.get(`${cell.row},${cell.col}`);
        if (midi !== undefined) {
          // Pad rows sustain for a whole loop (re-triggered each pass) so they
          // act as a held harmonic bed; other rows play the short note length.
          const dur = this.instrumentForRow(cell.row) === 'pad'
            ? secPerBeat * this.cfg.cols
            : durSec;
          this.voices[cell.row].play(midi, this.cfg.velocity, dur, stepTime);
        }
      }
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  dispose(): void {
    this.stop();
    this.voices.forEach((v) => v.dispose());
    this.voices = [];
    this.drumKit?.dispose();
    this.drumKit = null;
    this.tick?.dispose();
    this.tick = null;
  }
}
