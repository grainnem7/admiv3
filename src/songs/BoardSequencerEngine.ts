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
import { voicingForCells, degreeMidi, chordDegreeMidi, drumForRow, DEFAULT_DRUM_ROWS, loopLen, playheadStep, lapIndex, strictlyAfter, pageIndexAt, firesThisLap, firesThisLapPaged } from './boardSequencerScale';
import type { ActiveCell } from '../tracking/BoardSequencerMode';
import type { ColourChannel, ColourId, ColourRole } from '../tracking/boardColours';
import type { FaderRole } from '../profiles/BoardSequencerConfig';
import { getEffectChainManager } from '../effects';
import { RoundRobinDrumKit } from '../audio/instruments/RoundRobinDrumKit';
import { audibleTime } from './audibleTime';
import type { KitDrum } from '../audio/instruments/RoundRobinDrumKit';

/** A note the engine actually scheduled (drives note pops / "Now:" — never inferred from the playhead). */
export interface FiredNote {
  row: number;
  col: number;
  colour: ColourId;
  role: ColourRole;
  audioTime: number;
  durSec: number;
  source: 'live' | 'page' | 'loop';
}

export const FIRED_NOTE_CAP = 256;

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
  /** Effect amount a toggle colour switches in (default 0.35). */
  toggleAmount?: number;
  /** Glide time for control-counter changes, so a slide never clicks (default 0.3 s). */
  controlGlideSec?: number;
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
    /** The channel's own send/tone settings; control counters scale these, never replace them. */
    revBase: number; delBase: number; toneBase: number;
  }>();
  /**
   * How much of each effect is returned to the mix, when a control counter owns it.
   * One writer: a fader beats its toggle before either reaches the bus.
   */
  private reverbAmount = 1;
  private delayAmount = 1;
  private toneScale = 1;
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
  private fired: FiredNote[] = [];

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
      const revBase = ch.reverbSend ?? 0.18;
      const delBase = ch.delaySend ?? 0;
      const rev = ctx.createGain();
      rev.gain.value = revBase * this.reverbAmount;
      gain.connect(rev);
      rev.connect(reverbBus);
      const del = ctx.createGain();
      del.gain.value = delBase * this.delayAmount;
      gain.connect(del);
      del.connect(delayBus);
      this.voiceByChannel.set(ch.id, {
        voice: v, gain, rev, del, revBase, delBase, toneBase: ch.tone ?? 1,
      });
    }
    // Always built so the tick can be switched on live (setTickEnabled).
    this.tick = new Tone.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.02 },
      volume: -14,
    });
    this.tick.connect(mix);
  }

  private recordFired(n: FiredNote): void {
    this.fired.push(n);
    if (this.fired.length > FIRED_NOTE_CAP) this.fired.splice(0, this.fired.length - FIRED_NOTE_CAP);
  }

  /** Take (and clear) the notes scheduled since the last call. Polled from rAF. */
  drainFiredNotes(): FiredNote[] {
    const out = this.fired;
    this.fired = [];
    return out;
  }

  setActiveCells(cells: ActiveCell[]): void {
    this.active = cells;
  }

  /** Set the layered loops (from the loop bank) that play atop the live pattern. */
  setActiveLoops(loops: ActiveCell[][]): void {
    this.activeLoops = loops;
  }

  /**
   * Apply the values read from the control counters this frame. Already ranged and
   * debounced by `stepControls`, so this only routes them. A fader wins over its toggle,
   * so the two can never fight over the same parameter, and a control that isn't present
   * simply isn't in `values` — its parameter is left exactly as it was.
   */
  setControlValues(
    values: Partial<Record<FaderRole, number>>,
    toggles: Partial<Record<ColourRole, boolean>> = {},
  ): void {
    const glide = this.cfg.controlGlideSec ?? 0.3;
    const amt = this.cfg.toggleAmount ?? 0.35;
    if (values.volume !== undefined) this.setVolume(values.volume, glide);
    if (values.tempo !== undefined) this.setBpm(values.tempo);

    const toggleAmount = (on: boolean | undefined): number | undefined =>
      (on === undefined ? undefined : (on ? amt : 0));
    const reverb = values.reverb ?? toggleAmount(toggles.reverbToggle);
    const delay = values.delay ?? toggleAmount(toggles.delayToggle);
    const t = Tone.immediate();
    if (reverb !== undefined && reverb !== this.reverbAmount) {
      this.reverbAmount = reverb;
      this.reverbBus?.gain.setTargetAtTime(reverb, t, glide);
    }
    if (delay !== undefined && delay !== this.delayAmount) {
      this.delayAmount = delay;
      this.delayBus?.gain.setTargetAtTime(delay, t, glide);
    }

    if (values.tone !== undefined && values.tone !== this.toneScale) {
      this.toneScale = values.tone;
      // Scale each channel's own Tone rather than overwriting it, so a bright lead and a
      // dark bass keep their relationship.
      this.voiceByChannel.forEach((e) => e.voice.setBrightness(e.toneBase * this.toneScale));
    }
  }

  /**
   * Set the standalone BPM live, rebasing the clock so the beat position stays
   * continuous (no skipped/repeated beats). Ignored while locked to a song with
   * beats (the song owns tempo).
   */
  setBpm(bpm: number): void {
    if (this.syncSource && this.syncSource.beats.length > 0) return;
    const clamped = Math.max(20, Math.min(400, bpm));
    if (Math.abs(clamped - this.cfg.bpm) < 0.05) return;
    const now = Tone.now();
    const elapsedBeats = (now - this.startSec) / (60 / this.cfg.bpm);
    this.startSec = now - elapsedBeats * (60 / clamped);
    this.cfg.bpm = clamped;
  }

  /** The tempo actually in effect: the song's (from beat spacing) when synced, else cfg.bpm. */
  getBpm(): number {
    const beats = this.syncSource?.beats;
    if (beats && beats.length > 1) {
      const i = Math.min(Math.max(this.lastBeatIndex, 0), beats.length - 2);
      const spacing = beats[i + 1] - beats[i];
      if (spacing > 0) return 60 / spacing;
    }
    return this.cfg.bpm;
  }

  /** Context time of the sound being heard now (visuals use this, not Tone.now()). */
  audibleNow(): number {
    return audibleTime(this.ctx, performance.now());
  }

  /** The beat being heard now (synced: the last fired song beat). */
  private visualBeat(): number {
    return this.syncSource && this.syncSource.beats.length > 0
      ? this.lastBeatIndex
      : Math.floor((this.audibleNow() - this.startSec) / (60 / this.cfg.bpm));
  }

  /** The beat being heard now, for the pulse dot. The engine rebases its own clock on a
   *  tempo change and follows the song's beats when synced, so nothing outside can
   *  reconstruct this from a start time. */
  getVisualBeat(): number {
    return this.visualBeat();
  }

  /** The column the playhead is on right now (drives the visual playhead). */
  getPlayheadCol(cols: number): number {
    const beat = this.visualBeat();
    return playheadStep(beat, 0, cols, this.cfg.pingPong ?? false);
  }

  /** Whether the lap being heard is a variation (B) lap — drives the A/B cue. */
  isVariationLap(): boolean {
    const beat = this.visualBeat();
    return firesThisLap(true, beat, this.cfg.cols);
  }

  /** Pause/resume all sound (the clock + detection keep running; output is silent). */
  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /** Live sound controls (safe to call while running). */
  setVolume(v: number, glideSec = 0.02): void {
    this.cfg.volume = v;
    if (this.mix) this.mix.gain.setTargetAtTime(v, Tone.immediate(), glideSec);
  }

  /** Live per-channel mixer (no-op if that channel has no voice). */
  setChannelVolume(id: string, v: number): void {
    const e = this.voiceByChannel.get(id);
    if (e) e.gain.gain.setTargetAtTime(v, Tone.immediate(), 0.02);
  }

  setChannelTone(id: string, t: number): void {
    const e = this.voiceByChannel.get(id);
    if (!e) return;
    e.toneBase = t;
    e.voice.setBrightness(t * this.toneScale);
  }

  setChannelReverbSend(id: string, s: number): void {
    const e = this.voiceByChannel.get(id);
    if (e) {
      e.revBase = s;
      e.rev.gain.setTargetAtTime(s, Tone.immediate(), 0.03);
    }
  }

  setChannelDelaySend(id: string, s: number): void {
    const e = this.voiceByChannel.get(id);
    if (e) {
      e.delBase = s;
      e.del.gain.setTargetAtTime(s, Tone.immediate(), 0.03);
    }
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
    const beat = this.visualBeat();
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

  /** Turn the settle tick on/off live. */
  setTickEnabled(on: boolean): void {
    this.cfg.tickEnabled = on;
  }

  /** Fire the confirmation tick immediately (distinct from a sequenced note). */
  fireTick(): void {
    if (this.muted || !this.tick || !this.cfg.tickEnabled) return;
    // The tick is a monophonic MembraneSynth; Tone requires strictly increasing
    // start times. Two cells settling in the same audio quantum repeat Tone.now(),
    // so guard against a non-increasing time (was throwing "Start time must be
    // strictly greater than previous start time").
    const t = strictlyAfter(Tone.immediate(), this.lastTickTime);
    this.lastTickTime = t;
    this.tick.triggerAttackRelease('C2', 0.05, t);
  }

  start(): void {
    this.startSec = Tone.now();
    this.lastInternalBeat = -1;
    this.lastBeatIndex = -1;
    this.lastTickTime = 0;
    this.fired = [];
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
  private fireStep(beat: number, cellTime: number, secPerBeat: number, chord: BoardChord | null): void {
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
    const liveSource: FiredNote['source'] = page === this.selectedPage ? 'live' : 'page';
    const tagged: { cell: ActiveCell; source: FiredNote['source'] }[] = [
      ...cells.map((c) => ({ cell: c, source: liveSource })),
      ...this.activeLoops.flat().map((c) => ({ cell: c, source: 'loop' as const })),
    ];
    const playCells = tagged.map((t) => t.cell);
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
    for (const { cell, source } of tagged) {
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
      // Box detail: where the counter sits gives it its own loudness and timing. The
      // shift can never reach into the past — a late note is fine, a missed one is not.
      const base = cell.velocity ?? this.cfg.velocity;
      const vel = h > 0 ? base * (1 - Math.random() * h * 0.4) : base;
      const stepTime = cell.timingBeats
        ? Math.max(Tone.now(), cellTime + cell.timingBeats * secPerBeat)
        : cellTime;
      if (role === 'drums') {
        // The drum varies by row (kick→…→crash bottom→top), unless the channel
        // pins a specific kit piece.
        const drum = ch.drum && ch.drum.length > 0
          ? ch.drum
          : drumForRow(cell.row, this.cfg.rows, DEFAULT_DRUM_ROWS);
        if (drum && this.drumKit) {
          this.drumKit.play(drum as KitDrum, vel, stepTime);
          this.recordFired({ row: cell.row, col: cell.col, colour: cell.colour, role, audioTime: stepTime, durSec, source });
        }
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
        this.recordFired({ row: cell.row, col: cell.col, colour: cell.colour, role, audioTime: stepTime, durSec, source });
      } else if (role === 'chord' || ch.instrument === 'chord') {
        // Chord stab: play a stack (the song chord, or a scale triad) at once.
        for (const n of this.chordStack(cell, chord, 'row')) {
          voice.play(n + oct, vel, durSec, stepTime);
        }
        this.recordFired({ row: cell.row, col: cell.col, colour: cell.colour, role, audioTime: stepTime, durSec, source });
      } else {
        const midi = voicing.get(`${cell.row},${cell.col}`);
        if (midi !== undefined) {
          // A 'pad' instrument sustains a whole loop (re-triggered each pass) as a
          // held harmonic bed; others play the short note length.
          const dur = ch.instrument === 'pad' ? secPerBeat * melodicLoop : durSec;
          voice.play(midi + oct, vel, dur, stepTime);
          this.recordFired({ row: cell.row, col: cell.col, colour: cell.colour, role, audioTime: stepTime, durSec: dur, source });
        }
      }
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.fired = [];
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
