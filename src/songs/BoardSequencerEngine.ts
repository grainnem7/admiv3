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
import { cellMidi, columnMidi, drumsForStep, DEFAULT_DRUM_ROWS } from './boardSequencerScale';
import type { CellRef } from '../tracking/BoardSequencerMode';
import { getEffectChainManager } from '../effects';
import { RoundRobinDrumKit } from '../audio/instruments/RoundRobinDrumKit';
import type { HeadBopDrum } from './voices/HeadBopKit';

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
  /** Per-row palette keys, used in 'instruments' mode (indexed by row, 0 = top). */
  rowInstruments: string[];
}

const LOOKAHEAD_SEC = 0.1;
const TICK_INTERVAL_MS = 25;

export class BoardSequencerEngine {
  private ctx: AudioContext;
  private cfg: BoardEngineConfig;
  private voices: BoardSequencerVoice[] = [];
  private drumKit: RoundRobinDrumKit | null = null;
  private tick: Tone.MembraneSynth | null = null;
  private active: CellRef[] = [];
  private startSec = 0;
  private lastScheduledStep = -1;
  private timer: ReturnType<typeof setInterval> | null = null;

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
    if (this.cfg.rowMode === 'drumKit') {
      this.drumKit = new RoundRobinDrumKit(this.ctx, 'studio-kit');
      if (dest) this.drumKit.connect(dest.input);
      await this.drumKit.whenReady();
    } else {
      // One sampled voice per row. 'instruments' mode gives each row its own
      // instrument; 'pitched' mode uses the single chosen instrument for all.
      for (let r = 0; r < this.cfg.rows; r++) {
        const key = this.cfg.rowMode === 'instruments'
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

  setActiveCells(cells: CellRef[]): void {
    this.active = cells;
  }

  /** Fire the confirmation tick immediately (distinct from a sequenced note). */
  fireTick(): void {
    if (this.tick) this.tick.triggerAttackRelease('C2', 0.05, Tone.now());
  }

  start(): void {
    this.startSec = Tone.now();
    this.lastScheduledStep = -1;
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.scheduleTick(), TICK_INTERVAL_MS);
  }

  private scheduleTick(): void {
    const secPerBeat = 60 / this.cfg.bpm;
    const now = Tone.now();
    const beatIdx = Math.floor((now + LOOKAHEAD_SEC - this.startSec) / secPerBeat);
    const lookaheadStep = ((beatIdx % this.cfg.cols) + this.cfg.cols) % this.cfg.cols;
    if (lookaheadStep === this.lastScheduledStep) return;
    this.lastScheduledStep = lookaheadStep;
    const stepTime = this.startSec + beatIdx * secPerBeat;
    if (this.cfg.rowMode === 'drumKit') {
      const drums = drumsForStep(this.active, lookaheadStep, this.cfg.rows, DEFAULT_DRUM_ROWS);
      for (const drum of drums) {
        this.drumKit?.play(drum as HeadBopDrum, this.cfg.velocity, stepTime);
      }
    } else {
      // Pitched: row → pitch (bottom row lowest), one instrument for all.
      // Instruments: row → instrument, pitch generated from the COLUMN so it is
      // always pentatonic. Either way every active cell in this column plays on
      // its row's voice.
      const instruments = this.cfg.rowMode === 'instruments';
      const durSec = this.cfg.noteLengthBeats * secPerBeat;
      for (const cell of this.active) {
        if (cell.col !== lookaheadStep) continue;
        if (cell.row < 0 || cell.row >= this.voices.length) continue;
        const midi = instruments
          ? columnMidi(cell.col, this.cfg.scaleRootMidi, this.cfg.scaleSemitones)
          : cellMidi(cell.row, this.cfg.rows, this.cfg.scaleRootMidi, this.cfg.scaleSemitones);
        this.voices[cell.row].play(midi, this.cfg.velocity, durSec, stepTime);
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
