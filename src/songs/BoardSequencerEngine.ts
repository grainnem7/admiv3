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
import { voicingForCells, degreeMidi, chordDegreeMidi, drumForRow, DEFAULT_DRUM_ROWS, loopLen, playheadStep, lapIndex, strictlyAfter, pageIndexAt, faderValue, firesThisLap, firesThisLapPaged } from './boardSequencerScale';
import type { ActiveCell } from '../tracking/BoardSequencerMode';
import type { ColourChannel, ColourId, ColourRole } from '../tracking/boardColours';
import { isFaderRole, isControlRole } from '../tracking/boardColours';
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
  octaveShift: number;
  volume: number;
  /** The user's colour channels: each carries its role + (for sounds) instrument. */
  channels: ColourChannel[];
  /** Axis a control-colour piece's position maps to its value ('row' = vertical). */
  faderAxis: 'row' | 'col';
  /** Polyrhythm: per-role loop length in steps (0 = full grid width). */
  loopStepsRed: number;
  loopStepsBlack: number;
  loopStepsBlue: number;
  /** Pattern chaining: number of pages (master loop = numPages * cols steps). */
  numPages: number;
  /** Ping-pong playhead: sweep → then ← (repeat-edge) instead of always left→right. */
  pingPong?: boolean;
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
  // One sampled voice per melody/chord/bass channel (keyed by channel id), each
  // with its own gain + reverb/delay sends into the shared buses.
  private voiceByChannel = new Map<string, {
    voice: BoardSequencerVoice; gain: GainNode; rev: GainNode; del: GainNode;
  }>();
  private channelById = new Map<string, ColourChannel>();
  private drumKit: RoundRobinDrumKit | null = null;
  private tick: Tone.MembraneSynth | null = null;
  private mix: GainNode | null = null;
  private reverb: Tone.Reverb | null = null;
  private reverbBus: GainNode | null = null;
  private delay: Tone.FeedbackDelay | null = null;
  private delayBus: GainNode | null = null;
  private limiter: Tone.Limiter | null = null;
  private active: ActiveCell[] = [];
  // Layered loops from the loop bank; each plays on top of the live pattern.
  private activeLoops: ActiveCell[][] = [];
  // Pattern chaining: captured page snapshots (the selected page plays live from
  // `active`; other pages play from their stored snapshot here).
  private pages: ActiveCell[][] = [];
  private selectedPage = 0;
  private lastFiredPage = 0;
  private startSec = 0;
  private lastInternalBeat = -1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private muted = false;
  private syncSource: BoardSyncSource | null = null;
  private lastBeatIndex = -1;
  private lastTickTime = 0;

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

    // Index channels for fast role/instrument lookup during scheduling.
    this.channelById = new Map(this.cfg.channels.map((c) => [c.id, c]));
    const needsDrums = this.cfg.channels.some((c) => c.role === 'drums');
    if (needsDrums) {
      this.drumKit = new RoundRobinDrumKit(this.ctx, 'studio-kit');
      this.drumKit.connect(mix);
      await this.drumKit.whenReady();
    }
    // One sampled voice per melody/chord/bass channel → its own gain + FX sends.
    for (const ch of this.cfg.channels) {
      if (ch.role !== 'melody' && ch.role !== 'chord' && ch.role !== 'bass') continue;
      const inst = ch.instrument && ch.instrument.length > 0
        ? ch.instrument
        : (ch.role === 'bass' ? 'bassElectric' : 'electricPiano');
      const v = new BoardSequencerVoice(this.ctx, inst);
      v.setBrightness(ch.tone ?? 1);
      const gain = ctx.createGain();
      gain.gain.value = ch.volume ?? 1;
      v.connect(gain);
      gain.connect(mix);
      const rev = ctx.createGain();
      rev.gain.value = ch.reverbSend ?? 0.18;
      gain.connect(rev);
      rev.connect(reverbBus);
      const del = ctx.createGain();
      del.gain.value = ch.delaySend ?? 0;
      gain.connect(del);
      del.connect(delayBus);
      this.voiceByChannel.set(ch.id, { voice: v, gain, rev, del });
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
    this.applyControls(cells);
  }

  /** Set the layered loops (from the loop bank) that play atop the live pattern. */
  setActiveLoops(loops: ActiveCell[][]): void {
    this.activeLoops = loops;
  }

  /**
   * Apply control-colour pieces live: fader colours map their pieces' position
   * to a 0..1 value (volume / reverb / delay / tone); toggle colours switch an
   * effect on while a piece of that colour is present. Reads the LIVE board only
   * (controls are not paged). Cheap no-op when no colour has a control role.
   */
  private applyControls(active: ActiveCell[]): void {
    const byColour = new Map<ColourId, ActiveCell[]>();
    for (const c of active) {
      const list = byColour.get(c.colour);
      if (list) list.push(c); else byColour.set(c.colour, [c]);
    }
    for (const ch of this.cfg.channels) {
      if (!isControlRole(ch.role)) continue;
      const cells = byColour.get(ch.id) ?? [];
      if (isFaderRole(ch.role)) {
        const fv = faderValue(cells, this.cfg.faderAxis, this.cfg.rows, this.cfg.cols);
        if (fv !== null) {
          this.applyFader(ch.role, fv);
        } else if (ch.role !== 'tempo') {
          // No piece → most faders fall to 0 (a missing volume counter = silence),
          // but tempo KEEPS the current tempo rather than crawling to the minimum.
          this.applyFader(ch.role, 0);
        }
      } else {
        this.applyToggle(ch.role, cells.length > 0);
      }
    }
  }

  private applyFader(role: ColourRole, v: number): void {
    const t = Tone.now();
    if (role === 'volume') this.setVolume(v);
    else if (role === 'reverb') this.reverbBus?.gain.setTargetAtTime(v, t, 0.05);
    else if (role === 'delay') this.delayBus?.gain.setTargetAtTime(v, t, 0.05);
    else if (role === 'tone') this.voiceByChannel.forEach((e) => e.voice.setBrightness(v));
    else if (role === 'tempo') this.setTempo(80 + v * (300 - 80)); // 80…300 BPM (low ≈ original)
  }

  /**
   * Set the standalone BPM live, rebasing the clock so the beat position stays
   * continuous across the change (no skipped/repeated beats). No effect while
   * locked to a song (the song drives tempo).
   */
  private setTempo(bpm: number): void {
    const clamped = Math.max(20, Math.min(400, bpm));
    if (Math.abs(clamped - this.cfg.bpm) < 0.05) return;
    const now = Tone.now();
    const elapsedBeats = (now - this.startSec) / (60 / this.cfg.bpm);
    this.startSec = now - elapsedBeats * (60 / clamped);
    this.cfg.bpm = clamped;
  }

  /** The column the playhead is on right now (drives the visual playhead). */
  getPlayheadCol(cols: number): number {
    const beat = this.syncSource && this.syncSource.beats.length > 0
      ? this.lastBeatIndex
      : Math.floor((Tone.now() - this.startSec) / (60 / this.cfg.bpm));
    return playheadStep(beat, 0, cols, this.cfg.pingPong ?? false);
  }

  /** Whether the current lap is a variation (B) lap — drives the overlay A/B cue.
   * Reads Tone.now() at draw time while the gate fires from the look-ahead beat,
   * so the cue is best-effort (can disagree by one lap near a boundary), not sample-accurate. */
  isVariationLap(): boolean {
    const beat = this.syncSource && this.syncSource.beats.length > 0
      ? this.lastBeatIndex
      : Math.floor((Tone.now() - this.startSec) / (60 / this.cfg.bpm));
    return firesThisLap(true, beat, this.cfg.cols);
  }

  private applyToggle(role: ColourRole, on: boolean): void {
    const t = Tone.now();
    const amt = on ? 0.35 : 0;
    if (role === 'reverbToggle') this.reverbBus?.gain.setTargetAtTime(amt, t, 0.05);
    else if (role === 'delayToggle') this.delayBus?.gain.setTargetAtTime(amt, t, 0.05);
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

  /** Live per-channel mixer (no-op if that channel has no voice). */
  setChannelVolume(id: string, v: number): void {
    const e = this.voiceByChannel.get(id);
    if (e) e.gain.gain.setTargetAtTime(v, Tone.now(), 0.02);
  }

  setChannelTone(id: string, t: number): void {
    this.voiceByChannel.get(id)?.voice.setBrightness(t);
  }

  setChannelReverbSend(id: string, s: number): void {
    const e = this.voiceByChannel.get(id);
    if (e) e.rev.gain.setTargetAtTime(s, Tone.now(), 0.03);
  }

  setChannelDelaySend(id: string, s: number): void {
    const e = this.voiceByChannel.get(id);
    if (e) e.del.gain.setTargetAtTime(s, Tone.now(), 0.03);
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

  /** Set the number of chained pages live (master loop = numPages * cols). */
  setNumPages(n: number): void {
    this.cfg.numPages = Math.max(1, Math.floor(n));
  }

  /** Toggle the ping-pong playhead live (safe while running). */
  setPingPong(on: boolean): void {
    this.cfg.pingPong = on;
  }

  /** Current sweep direction for the overlay arrow: +1 forward (→), -1 return (←). */
  getPlayheadDirection(): 1 | -1 {
    if (!this.cfg.pingPong) return 1;
    const beat = this.syncSource && this.syncSource.beats.length > 0
      ? this.lastBeatIndex
      : Math.floor((Tone.now() - this.startSec) / (60 / this.cfg.bpm));
    return lapIndex(beat, this.cfg.cols) % 2 === 0 ? 1 : -1;
  }

  /** Choose which page is bound to the live camera board (others play snapshots). */
  setSelectedPage(i: number): void {
    this.selectedPage = Math.max(0, Math.floor(i));
  }

  /** Replace all captured page snapshots (e.g. on start or after a capture). */
  setPages(pages: ActiveCell[][]): void {
    this.pages = pages.map((p) => [...p]);
  }

  /** Store a snapshot into a single page slot. */
  setPageSnapshot(i: number, cells: ActiveCell[]): void {
    if (i < 0) return;
    while (this.pages.length <= i) this.pages.push([]);
    this.pages[i] = [...cells];
  }

  /** The page the sequencer last fired (for UI highlight); 0 when single-page. */
  getCurrentPage(): number {
    return this.lastFiredPage;
  }

  /** Attach (or clear) a backing song to lock tempo/beat + chords to. */
  setSyncSource(src: BoardSyncSource | null): void {
    this.syncSource = src;
    this.lastBeatIndex = -1;
  }

  /** Fire the confirmation tick immediately (distinct from a sequenced note). */
  fireTick(): void {
    if (this.muted || !this.tick) return;
    // The tick is a monophonic MembraneSynth; Tone requires strictly increasing
    // start times. Two cells settling in the same audio quantum repeat Tone.now(),
    // so guard against a non-increasing time (was throwing "Start time must be
    // strictly greater than previous start time").
    const t = strictlyAfter(Tone.now(), this.lastTickTime);
    this.lastTickTime = t;
    this.tick.triggerAttackRelease('C2', 0.05, t);
  }

  start(): void {
    this.startSec = Tone.now();
    this.lastInternalBeat = -1;
    this.lastBeatIndex = -1;
    this.lastTickTime = 0;
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

  /** The role a cell plays, from its colour channel. */
  private roleFor(colour: ColourId): ColourRole {
    return this.channelById.get(colour)?.role ?? 'off';
  }

  /** The polyrhythm-loop category for a role (melody/chord share the melody loop). */
  private loopCategory(role: ColourRole): 'melodic' | 'drum' | 'bass' {
    if (role === 'drums') return 'drum';
    if (role === 'bass') return 'bass';
    return 'melodic';
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
    // Pattern chaining: pick this beat's page. The selected page plays live from
    // the camera (`active`); other pages play from their captured snapshot.
    const page = pageIndexAt(beat, this.cfg.cols, this.cfg.numPages);
    this.lastFiredPage = page;
    const cells = page === this.selectedPage ? this.active : (this.pages[page] ?? []);
    // Loop bank: active saved loops layer on top of the live/page cells. Pitch is
    // per-row-absolute, so a plain concat never disturbs voicing.
    const playCells = this.activeLoops.length > 0 ? [...cells, ...this.activeLoops.flat()] : cells;
    // Voice ALL active melodic cells together so pitch is a complementary
    // spread that depends on the whole board (re-voices as pieces change /
    // follows the chord when locked); then play only this column's cells. A
    // "melodic" cell is one whose colour role is melody or chord.
    const melodic = playCells.filter((c) => {
      const r = this.roleFor(c.colour);
      return (r === 'melody' || r === 'chord') && this.voiceByChannel.has(c.colour);
    });
    // Pitch is always by ABSOLUTE row position (bottom = low, top = high);
    // column = time. The instrument/role come from the cell's colour channel.
    const voicing = voicingForCells(
      melodic, this.cfg.scaleRootMidi, this.cfg.scaleSemitones,
      chord && chord.notes.length > 0 ? chord.notes : null, 'row', this.cfg.rows,
    );
    const oct = this.cfg.octaveShift * 12;
    const h = this.cfg.humanize;
    for (const cell of playCells) {
      const ch = this.channelById.get(cell.colour);
      if (!ch) continue;
      const role = ch.role;
      // Control roles (faders/toggles) and 'off' are not sequenced.
      if (role !== 'melody' && role !== 'chord' && role !== 'drums' && role !== 'bass') continue;
      // Per-role polyrhythm: a cell fires when its column matches the role's
      // own playhead (beat wrapped at that role's loop length).
      const cat = this.loopCategory(role);
      if (cell.col !== playheadStep(beat, this.rawLoop(cat), this.cfg.cols, this.cfg.pingPong ?? false)) continue;
      // Variation: an off-centre ("conditional") cell plays only on variation laps,
      // so the loop alternates a full pass and a full-plus-variations pass.
      if (!firesThisLapPaged(cell.conditional ?? false, beat, this.cfg.cols, this.cfg.numPages)) continue;
      // Humanize: occasionally skip a step + vary velocity, so loops breathe.
      if (h > 0 && Math.random() < h * 0.5) continue;
      const vel = h > 0 ? this.cfg.velocity * (1 - Math.random() * h * 0.4) : this.cfg.velocity;
      if (role === 'drums') {
        // The drum varies by row (kick→…→crash bottom→top), unless the channel
        // pins a specific kit piece.
        const drum = ch.drum && ch.drum.length > 0
          ? ch.drum
          : drumForRow(cell.row, this.cfg.rows, DEFAULT_DRUM_ROWS);
        if (drum) this.drumKit?.play(drum as KitDrum, vel, stepTime);
        continue;
      }
      const voice = this.voiceByChannel.get(ch.id)?.voice;
      if (!voice) continue;
      if (role === 'bass') {
        // Bass pitch follows the row like melody (bottom = low), an octave down.
        const degree = this.cfg.rows - 1 - cell.row;
        const base = chord && chord.notes.length > 0
          ? chordDegreeMidi(degree, chord.notes)
          : degreeMidi(degree, this.cfg.scaleRootMidi, this.cfg.scaleSemitones);
        voice.play(base - 12 + oct, vel, durSec, stepTime);
      } else if (role === 'chord' || ch.instrument === 'chord') {
        // Chord stab: play a stack (the song chord, or a scale triad) at once.
        for (const n of this.chordStack(cell, chord, 'row')) {
          voice.play(n + oct, vel, durSec, stepTime);
        }
      } else {
        const midi = voicing.get(`${cell.row},${cell.col}`);
        if (midi !== undefined) {
          // A 'pad' instrument sustains a whole loop (re-triggered each pass) as a
          // held harmonic bed; others play the short note length.
          const dur = ch.instrument === 'pad' ? secPerBeat * melodicLoop : durSec;
          voice.play(midi + oct, vel, dur, stepTime);
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
    this.voiceByChannel.forEach((e) => {
      e.voice.dispose();
      e.gain.disconnect();
      e.rev.disconnect();
      e.del.disconnect();
    });
    this.voiceByChannel.clear();
    this.channelById.clear();
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
