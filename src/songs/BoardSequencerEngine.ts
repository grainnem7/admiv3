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
import { notesForStep, stepIndexAt } from './boardSequencerScale';
import type { CellRef } from '../tracking/BoardSequencerMode';
import { getEffectChainManager } from '../effects';

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
}

const LOOKAHEAD_SEC = 0.1;
const TICK_INTERVAL_MS = 25;

export class BoardSequencerEngine {
  private ctx: AudioContext;
  private cfg: BoardEngineConfig;
  private voices: BoardSequencerVoice[] = [];
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
    for (let r = 0; r < this.cfg.rows; r++) {
      const v = new BoardSequencerVoice(this.ctx, this.cfg.instrumentKey);
      if (dest) v.connect(dest.input);
      this.voices.push(v);
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
    const lookaheadStep = stepIndexAt(now + LOOKAHEAD_SEC, this.startSec, secPerBeat, this.cfg.cols);
    if (lookaheadStep === this.lastScheduledStep) return;
    this.lastScheduledStep = lookaheadStep;
    const beatsSinceStart = Math.round((now + LOOKAHEAD_SEC - this.startSec) / secPerBeat);
    const stepTime = this.startSec + beatsSinceStart * secPerBeat;
    const pitches = notesForStep(
      this.active, lookaheadStep, this.cfg.rows, this.cfg.scaleRootMidi, this.cfg.scaleSemitones,
    );
    const durSec = this.cfg.noteLengthBeats * secPerBeat;
    pitches.forEach((midi, i) => {
      const voice = this.voices[i % this.voices.length];
      voice.play(midi, this.cfg.velocity, durSec, stepTime);
    });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  dispose(): void {
    this.stop();
    this.voices.forEach((v) => v.dispose());
    this.voices = [];
    this.tick?.dispose();
    this.tick = null;
  }
}
