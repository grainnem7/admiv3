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
import { voicingForCells, degreeMidi, drumForRowChoice, loopLen, roleStep } from './boardSequencerScale';
import type { ActiveCell } from '../tracking/BoardSequencerMode';
import { getEffectChainManager } from '../effects';
import { RoundRobinDrumKit } from '../audio/instruments/RoundRobinDrumKit';
import type { KitDrum } from '../audio/instruments/RoundRobinDrumKit';

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
  swing: number;
  humanize: number;
  noteLengthBeats: number;
  velocity: number;
  tickEnabled: boolean;
  instrumentKey: string;
  octaveShift: number;
  volume: number;
  rowMode: 'pitched' | 'drumKit' | 'instruments';
  /** Layer black pieces as drums on top of a melodic mode (ignored in drumKit). */
  blackDrums: boolean;
  /** Layer blue pieces as a bass voice on top of a melodic mode (ignored in drumKit). */
  blueBass: boolean;
  /** Per-row palette keys, used in 'instruments' mode (indexed by row, 0 = top). */
  rowInstruments: string[];
  /** Per-row drum override (indexed by row, 0 = top); '' = default kit mapping. */
  rowDrums: string[];
  /** Polyrhythm: per-role loop length in steps (0 = full grid width). */
  loopStepsRed: number;
  loopStepsBlack: number;
  loopStepsBlue: number;
  /** Per-row mixer (indexed by row): volume, tone/brightness, reverb-send, delay-send (0..1). */
  rowVolume: number[];
  rowTone: number[];
  rowReverbSend: number[];
  rowDelaySend: number[];
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
  private bassVoice: BoardSequencerVoice | null = null;
  private drumKit: RoundRobinDrumKit | null = null;
  private tick: Tone.MembraneSynth | null = null;
  private mix: GainNode | null = null;
  private reverb: Tone.Reverb | null = null;
  private reverbBus: GainNode | null = null;
  private delay: Tone.FeedbackDelay | null = null;
  private delayBus: GainNode | null = null;
  private limiter: Tone.Limiter | null = null;
  // Per-row mixer nodes (parallel to `voices`).
  private rowGains: GainNode[] = [];
  private rowRevSends: GainNode[] = [];
  private rowDlySends: GainNode[] = [];
  private active: ActiveCell[] = [];
  private startSec = 0;
  private lastInternalBeat = -1;
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
    const ctx = this.ctx;
    // Mix bus → limiter → shared effects bus. Shared reverb + delay buses return
    // into the mix; per-row sends feed them. Limiter stops stacked voices clipping.
    const mix = ctx.createGain();
    mix.gain.value = this.cfg.volume;
    const limiter = new Tone.Limiter(-2);
    Tone.connect(mix, limiter);
    if (dest) limiter.connect(dest);

    const reverb = new Tone.Reverb({ decay: 2.5, wet: 1 });
    await reverb.ready;
    const reverbBus = ctx.createGain();
    Tone.connect(reverbBus, reverb);
    reverb.connect(mix);

    const delay = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.32, wet: 1 });
    const delayBus = ctx.createGain();
    Tone.connect(delayBus, delay);
    delay.connect(mix);

    this.mix = mix;
    this.limiter = limiter;
    this.reverb = reverb;
    this.reverbBus = reverbBus;
    this.delay = delay;
    this.delayBus = delayBus;

    const needsDrums = this.cfg.rowMode === 'drumKit' || this.cfg.blackDrums;
    const needsVoices = this.cfg.rowMode !== 'drumKit';
    if (needsDrums) {
      this.drumKit = new RoundRobinDrumKit(this.ctx, 'studio-kit');
      this.drumKit.connect(mix);
      await this.drumKit.whenReady();
    }
    if (needsVoices) {
      // One sampled voice per row + a per-row mixer strip: voice → rowGain
      // (volume) → mix (dry), with reverb/delay send taps off rowGain. Tone is
      // the voice's own low-pass cutoff.
      for (let r = 0; r < this.cfg.rows; r++) {
        const v = new BoardSequencerVoice(this.ctx, this.instrumentForRow(r));
        v.setBrightness(this.cfg.rowTone[r] ?? 1);
        const rg = ctx.createGain();
        rg.gain.value = this.cfg.rowVolume[r] ?? 1;
        v.connect(rg);
        rg.connect(mix);
        const rs = ctx.createGain();
        rs.gain.value = this.cfg.rowReverbSend[r] ?? 0;
        rg.connect(rs);
        rs.connect(reverbBus);
        const ds = ctx.createGain();
        ds.gain.value = this.cfg.rowDelaySend[r] ?? 0;
        rg.connect(ds);
        ds.connect(delayBus);
        this.voices.push(v);
        this.rowGains.push(rg);
        this.rowRevSends.push(rs);
        this.rowDlySends.push(ds);
      }
    }
    if (this.cfg.blueBass) {
      this.bassVoice = new BoardSequencerVoice(this.ctx, 'bassElectric');
      this.bassVoice.connect(mix);
    }
    if (this.cfg.tickEnabled) {
      this.tick = new Tone.MembraneSynth({
        pitchDecay: 0.008,
        octaves: 2,
        envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.02 },
        volume: -14,
      });
      this.tick.connect(mix);
    }
  }

  setActiveCells(cells: ActiveCell[]): void {
    this.active = cells;
  }

  /** Pause/resume all sound (the clock + detection keep running; output is silent). */
  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /** Live sound controls (safe to call while running). */
  setVolume(v: number): void {
    this.cfg.volume = v;
    if (this.mix) this.mix.gain.setTargetAtTime(v, Tone.now(), 0.02);
  }

  setRowVolume(row: number, v: number): void {
    const g = this.rowGains[row];
    if (g) g.gain.setTargetAtTime(v, Tone.now(), 0.02);
  }

  setRowTone(row: number, t: number): void {
    this.voices[row]?.setBrightness(t);
  }

  setRowReverbSend(row: number, s: number): void {
    const g = this.rowRevSends[row];
    if (g) g.gain.setTargetAtTime(s, Tone.now(), 0.03);
  }

  setRowDelaySend(row: number, s: number): void {
    const g = this.rowDlySends[row];
    if (g) g.gain.setTargetAtTime(s, Tone.now(), 0.03);
  }

  setOctaveShift(octaves: number): void {
    this.cfg.octaveShift = octaves;
  }

  setNoteLength(beats: number): void {
    this.cfg.noteLengthBeats = beats;
  }

  setScale(rootMidi: number, semitones: number[]): void {
    this.cfg.scaleRootMidi = rootMidi;
    this.cfg.scaleSemitones = semitones;
  }

  setSwing(swing: number): void {
    this.cfg.swing = swing;
  }

  setHumanize(h: number): void {
    this.cfg.humanize = h;
  }

  /** Set a role's polyrhythm loop length live (0 = full grid width). */
  setLoopSteps(role: 'red' | 'black' | 'blue', steps: number): void {
    if (role === 'red') this.cfg.loopStepsRed = steps;
    else if (role === 'black') this.cfg.loopStepsBlack = steps;
    else this.cfg.loopStepsBlue = steps;
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
    this.lastInternalBeat = -1;
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
    if (beatIdx === this.lastInternalBeat) return;
    this.lastInternalBeat = beatIdx;
    let stepTime = this.startSec + beatIdx * secPerBeat;
    if (beatIdx % 2 === 1) stepTime += this.cfg.swing * secPerBeat * 0.5; // groove off-beats
    this.fireStep(beatIdx, stepTime, secPerBeat, null);
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
      const spacing = i + 1 < beats.length
        ? Math.max(0.05, beats[i + 1] - beatTime)
        : (i > 0 ? Math.max(0.05, beatTime - beats[i - 1]) : 0.5);
      let audioTime = now + Math.max(0, beatTime - t);
      if (i % 2 === 1) audioTime += this.cfg.swing * spacing * 0.5; // groove off-beats
      this.fireStep(i, audioTime, spacing, src.chordAt(beatTime));
      this.lastBeatIndex = i;
      i++;
    }
  }

  private isDrumCell(cell: ActiveCell): boolean {
    return this.cfg.rowMode === 'drumKit'
      || (this.cfg.blackDrums && cell.colour === 'black');
  }

  private isBassCell(cell: ActiveCell): boolean {
    return this.cfg.blueBass && cell.colour === 'blue';
  }

  /** Notes for a chord-stab cell: the song chord (when locked) or a scale triad. */
  private chordStack(cell: ActiveCell, chord: BoardChord | null, axis: 'row' | 'col'): number[] {
    if (chord && chord.notes.length > 0) return chord.notes;
    const degree = axis === 'row' ? this.cfg.rows - 1 - cell.row : cell.col;
    const root = this.cfg.scaleRootMidi;
    const semis = this.cfg.scaleSemitones;
    return [
      degreeMidi(degree, root, semis),
      degreeMidi(degree + 2, root, semis),
      degreeMidi(degree + 4, root, semis),
    ];
  }

  /** The instrument a row plays: its per-row override if set, else the default. */
  private instrumentForRow(row: number): string {
    const k = this.cfg.rowInstruments[row];
    return k && k.length > 0 ? k : this.cfg.instrumentKey;
  }

  /** A role's configured polyrhythm loop-length setting (0 = full grid width). */
  private rawLoop(role: 'melodic' | 'drum' | 'bass'): number {
    return role === 'drum' ? this.cfg.loopStepsBlack
      : role === 'bass' ? this.cfg.loopStepsBlue
        : this.cfg.loopStepsRed;
  }

  /**
   * Play every active cell whose role-step matches `beat` at `stepTime`.
   * `beat` is the GLOBAL beat index; each role wraps it at its own loop length
   * (polyrhythm), so a cell fires when cell.col === (beat mod roleLength).
   * chord locks melodic pitch.
   */
  private fireStep(beat: number, stepTime: number, secPerBeat: number, chord: BoardChord | null): void {
    if (this.muted) return;
    const durSec = this.cfg.noteLengthBeats * secPerBeat;
    const melodicLoop = loopLen(this.rawLoop('melodic'), this.cfg.cols);
    // Voice ALL active melodic cells together so pitch is a complementary
    // spread that depends on the whole board (re-voices as pieces change /
    // follows the chord when locked); then play only this column's cells.
    const melodic = this.active.filter(
      (c) => !this.isDrumCell(c) && !this.isBassCell(c) && c.row >= 0 && c.row < this.voices.length,
    );
    // Per-row instruments: each instrument (row) plays a melody across columns
    // → pitch by column. Pitched (single instrument): piano roll → pitch by row.
    const axis = this.cfg.rowMode === 'instruments' ? 'col' : 'row';
    const voicing = voicingForCells(
      melodic, this.cfg.scaleRootMidi, this.cfg.scaleSemitones,
      chord && chord.notes.length > 0 ? chord.notes : null, axis, this.cfg.rows,
    );
    const oct = this.cfg.octaveShift * 12;
    // Bass note: the chord's lowest tone (or the scale root), an octave down.
    const bassMidi = (chord && chord.notes.length > 0
      ? Math.min(...chord.notes)
      : this.cfg.scaleRootMidi) - 12 + oct;
    const h = this.cfg.humanize;
    for (const cell of this.active) {
      // Per-role polyrhythm: a cell fires when its column matches the role's
      // own playhead (beat wrapped at that role's loop length).
      const role = this.isDrumCell(cell) ? 'drum' : this.isBassCell(cell) ? 'bass' : 'melodic';
      if (cell.col !== roleStep(beat, this.rawLoop(role), this.cfg.cols)) continue;
      // Humanize: occasionally skip a step + vary velocity, so loops breathe.
      if (h > 0 && Math.random() < h * 0.5) continue;
      const vel = h > 0 ? this.cfg.velocity * (1 - Math.random() * h * 0.4) : this.cfg.velocity;
      if (role === 'drum') {
        const drum = drumForRowChoice(cell.row, this.cfg.rows, this.cfg.rowDrums);
        if (drum) this.drumKit?.play(drum as KitDrum, vel, stepTime);
      } else if (role === 'bass') {
        this.bassVoice?.play(bassMidi, vel, durSec, stepTime);
      } else {
        const voice = this.voices[cell.row];
        if (!voice) continue;
        const inst = this.instrumentForRow(cell.row);
        if (inst === 'chord') {
          // Chord stab: play a stack (the song chord, or a scale triad) at once.
          for (const n of this.chordStack(cell, chord, axis)) {
            voice.play(n + oct, vel, durSec, stepTime);
          }
        } else {
          const midi = voicing.get(`${cell.row},${cell.col}`);
          if (midi !== undefined) {
            // Pad rows sustain for a whole loop (re-triggered each pass) so they
            // act as a held harmonic bed; other rows play the short note length.
            const dur = inst === 'pad' ? secPerBeat * melodicLoop : durSec;
            voice.play(midi + oct, vel, dur, stepTime);
          }
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
    [...this.rowGains, ...this.rowRevSends, ...this.rowDlySends].forEach((g) => g.disconnect());
    this.rowGains = [];
    this.rowRevSends = [];
    this.rowDlySends = [];
    this.bassVoice?.dispose();
    this.bassVoice = null;
    this.limiter?.dispose();
    this.limiter = null;
    this.reverb?.dispose();
    this.reverb = null;
    this.reverbBus?.disconnect();
    this.reverbBus = null;
    this.delay?.dispose();
    this.delay = null;
    this.delayBus?.disconnect();
    this.delayBus = null;
    this.mix?.disconnect();
    this.mix = null;
    this.drumKit?.dispose();
    this.drumKit = null;
    this.tick?.dispose();
    this.tick = null;
  }
}
