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
import { MasterChain } from '../audio/MasterChain';
import { DEFAULT_BOARD_MIX } from '../audio/audioConfig';
import { channelPan, ducksForKick, legatoBeats } from '../audio/boardMix';
import { voiceSpecFor, worldOf, type SoundWorldChoice } from '../audio/worlds/soundWorlds';
import { harmonyAt, phraseEventsAtStep, type PhraseCell, type PhraseInput, type PhraseRole } from './phrases/phrases';
import { generateFill, type FillContext, type FillNote, type SoundingNote } from './generative/rulesFill';
import { loadMagenta, magentaFill, magentaStatus } from './generative/magentaFill';
import { describeEvolve, evolveState, NEUTRAL, type EvolveState } from '../audio/evolve/evolve';

/** A note the engine actually scheduled (drives note pops / "Now:" — never inferred from the playhead). */
export interface FiredNote {
  row: number;
  col: number;
  colour: ColourId;
  role: ColourRole;
  audioTime: number;
  durSec: number;
  source: 'live' | 'page' | 'loop';
  /**
   * Who made the note: the player's counter itself, or the phrase it started. Lets a
   * session log tell what the player placed from what the instrument played for it.
   */
  origin?: 'placed' | 'phrase' | 'fill';
}

/** How loud the fill is next to the player's own notes: about -6 dB. */
export const FILL_LEVEL = 0.5;

/**
 * How long the board has to stay still before the AI is asked for a new idea. Asking on
 * every move while a hand is placing counters would only throw ideas away.
 */
const AI_SETTLE_SEC = 0.6;

/** Where the fill comes from, as the player is told it. */
export type FillSourceStatus = 'rules' | 'loading' | 'thinking' | 'ai' | 'offline';

/** Mute ramps this fast: short enough to read as a cut, long enough not to click. */
const MUTE_GLIDE_SEC = 0.02;

/**
 * The most missed beats to replay after a stall. Long enough to cover a heavy camera
 * frame or a GC pause, short enough that coming back to a tab left open for an hour
 * doesn't dump a wall of notes.
 */
const MAX_CATCHUP_BEATS = 4;

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
  /** Off means every counter plays every pass — including inside saved loops. */
  variationEnabled?: boolean;
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
  /**
   * The studio mix: the shared master chain, stereo placement, kick ducking and notes that
   * ring into the next one. Off is the board's original mix, kept for A/B listening.
   * Default on.
   */
  studioMix?: boolean;
  /** The sound world parts without an instrument of their own use ('none' = old defaults). */
  soundWorld?: SoundWorldChoice;
  /** Each counter plays a phrase (groove, bassline, motif, chord change), not one note. */
  phrases?: boolean;
  /** Where fill ideas come from: Magenta's models, or the simple rules. */
  fillEngine?: 'magenta' | 'rules';
}

/** Evolve: how each colour's sound keeps changing as it plays (see audio/evolve). */
export interface EvolveSettings {
  amount: number;
  sceneLoops: number;
  seed: number;
  /** Hold the sound of this loop; null = keep evolving. */
  holdLap: number | null;
}

/** How long a drift step glides, in seconds: slow enough to be heard as movement, not a jump. */
const EVOLVE_GLIDE_SEC = 0.8;

/** How quickly the mix switch crossfades, so flipping it mid-loop never clicks. */
const MIX_SWITCH_TC = 0.03;

/** How long a replaced voice is kept so its last notes ring out. */
const VOICE_RETIRE_MS = 4000;

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
    /** Stereo placement (studio mix); null where the browser has no StereoPanner. */
    pan?: StereoPannerNode | null; panBase?: number;
    /** What Evolve has this colour sounding like now, and which instrument that is. */
    evo?: EvolveState; voiceName?: string | null;
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
  // Two outputs from the mix, crossfaded by the Studio mix switch: the original path
  // (limiter -> shared effects bus) and the studio path (the shared MasterChain).
  private classicOut: GainNode | null = null;
  private studioOut: GainNode | null = null;
  private masterChain: MasterChain | null = null;
  /** Bass, chords and pads pass through here and dip on each kick. */
  private duckBus: GainNode | null = null;
  /** The world's colour over the whole mix (Lo-fi's dusty top end), and over the kit. */
  private mixTone: BiquadFilterNode | null = null;
  private drumTone: BiquadFilterNode | null = null;
  private drumLevel: GainNode | null = null;
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
  // The fill: how much, which idea (seed), and a kept fill that no longer follows the board.
  private fillAmount = 0;
  private fillSeed = 1;
  private fillKept: FillNote[] | null = null;
  private fillNotes: FillNote[] = [];
  private fillKey = '';
  // The AI path: the board as last described to it, when that last changed, and which
  // board an idea has been asked for and received.
  private fillCtx: FillContext | null = null;
  private fillChangedAt = 0;
  private aiAskedKey = '';
  private aiAnsweredKey = '';
  /** Sixteenths each part plays right now: fill never sounds on one, even an older idea. */
  private fillTaken: Record<'melody' | 'bass' | 'drums', Set<number>> = {
    melody: new Set(), bass: new Set(), drums: new Set(),
  };
  private evolve: EvolveSettings = { amount: 0, sceneLoops: 8, seed: 1, holdLap: null };
  private evolveLap = -1;
  private evolveKey = '';
  /** The kit's Evolve state (one kit, shared by every drum colour). */
  private drumEvo: EvolveState = NEUTRAL;
  /** The drums' send into the shared reverb: none without Evolve, some room with it. */
  private drumRev: GainNode | null = null;
  /** The scene Evolve is in, so the fill can have a fresh idea for each one. */
  private evolveScene = 0;

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
    mix.gain.value = this.muted ? 0 : this.cfg.volume;
    const studio = this.studioOn();
    const world = worldOf(this.cfg.soundWorld ?? 'none');
    const mixTone = ctx.createBiquadFilter();
    mixTone.type = 'lowpass';
    mixTone.frequency.value = world?.mixToneHz ?? 20000;
    mixTone.Q.value = 0.5;
    mix.connect(mixTone);
    this.mixTone = mixTone;
    const classicOut = ctx.createGain();
    classicOut.gain.value = studio ? 0 : 1;
    mixTone.connect(classicOut);
    const limiter = new Tone.Limiter(-2);
    Tone.connect(classicOut, limiter);
    if (dest) limiter.connect(dest);
    // The studio path: the same EQ -> glue compressor -> saturation -> limiter that Song
    // and Remix go through. The board was left off it when they were overhauled.
    const studioOut = ctx.createGain();
    studioOut.gain.value = studio ? 1 : 0;
    mixTone.connect(studioOut);
    const masterChain = new MasterChain(ctx);
    studioOut.connect(masterChain.input);
    this.classicOut = classicOut;
    this.studioOut = studioOut;
    this.masterChain = masterChain;
    const duckBus = ctx.createGain();
    duckBus.gain.value = 1;
    duckBus.connect(mix);
    this.duckBus = duckBus;

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
      this.drumKit.setPans(studio ? DEFAULT_BOARD_MIX.drumPans : {});
      const drumTone = ctx.createBiquadFilter();
      drumTone.type = 'lowpass';
      drumTone.Q.value = 0.5;
      const drumLevel = ctx.createGain();
      drumTone.connect(drumLevel);
      drumLevel.connect(mix);
      this.drumTone = drumTone;
      this.drumLevel = drumLevel;
      const drumRev = ctx.createGain();
      drumRev.gain.value = 0;
      drumLevel.connect(drumRev);
      drumRev.connect(reverbBus);
      this.drumRev = drumRev;
      this.applyDrumColour();
      this.drumKit.connect(drumTone);
      await this.drumKit.whenReady();
    }
    // One sampled voice per melody/chord/bass channel → its own gain + FX sends.
    for (const ch of this.cfg.channels) {
      if (ch.role !== 'melody' && ch.role !== 'chord' && ch.role !== 'bass') continue;
      const v = new BoardSequencerVoice(this.ctx, voiceSpecFor(ch, this.cfg.soundWorld ?? 'none'));
      v.setBrightness(ch.tone ?? 1);
      const gain = ctx.createGain();
      gain.gain.value = ch.volume ?? 1;
      v.connect(gain);
      // Placement and ducking sit after the channel gain; the effect sends tap the gain
      // itself, so a reverb tail neither pumps nor jumps sides.
      const out = ducksForKick(ch) ? duckBus : mix;
      const panBase = channelPan(this.cfg.channels, ch.id);
      const pan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
      if (pan) {
        pan.pan.value = studio ? panBase : 0;
        gain.connect(pan);
        pan.connect(out);
      } else {
        gain.connect(out);
      }
      const revBase = ch.reverbSend ?? world?.reverbSend ?? 0.18;
      const delBase = ch.delaySend ?? world?.delaySend ?? 0;
      const rev = ctx.createGain();
      rev.gain.value = revBase * this.reverbAmount;
      gain.connect(rev);
      rev.connect(reverbBus);
      const del = ctx.createGain();
      del.gain.value = delBase * this.delayAmount;
      gain.connect(del);
      del.connect(delayBus);
      this.voiceByChannel.set(ch.id, {
        voice: v, gain, rev, del, revBase, delBase, toneBase: ch.tone ?? 1, pan, panBase,
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

  /** The kit's colour and level for the current world (open and full without one). */
  private applyDrumColour(): void {
    const world = worldOf(this.cfg.soundWorld ?? 'none');
    const t = Tone.immediate();
    this.drumTone?.frequency.setTargetAtTime(world?.drums.toneHz ?? 20000, t, MIX_SWITCH_TC);
    this.drumLevel?.gain.setTargetAtTime(world?.drums.level ?? 1, t, MIX_SWITCH_TC);
  }

  /**
   * Change sound world, live. Parts with an instrument the player picked keep it; the
   * rest swap to the new world's sound from their next note (the old voice is let ring
   * out, then freed). Sends follow the world unless the part has its own.
   */
  setSoundWorld(choice: SoundWorldChoice): void {
    if ((this.cfg.soundWorld ?? 'none') === choice) return;
    this.cfg.soundWorld = choice;
    const world = worldOf(choice);
    const t = Tone.immediate();
    this.mixTone?.frequency.setTargetAtTime(world?.mixToneHz ?? 20000, t, MIX_SWITCH_TC);
    this.applyDrumColour();
    for (const ch of this.cfg.channels) {
      const e = this.voiceByChannel.get(ch.id);
      if (!e) continue;
      if (!(ch.instrument && ch.instrument.length > 0)) {
        const next = new BoardSequencerVoice(this.ctx, voiceSpecFor(ch, choice));
        next.setBrightness(e.toneBase * this.toneScale);
        next.connect(e.gain);
        const old = e.voice;
        e.voice = next;
        e.voiceName = null;
        // Let anything still sounding finish before the old voice is freed.
        setTimeout(() => old.dispose(), VOICE_RETIRE_MS);
      }
      if (ch.reverbSend === undefined) {
        e.revBase = world?.reverbSend ?? 0.18;
        e.rev.gain.setTargetAtTime(e.revBase, t, MIX_SWITCH_TC);
      }
      if (ch.delaySend === undefined) {
        e.delBase = world?.delaySend ?? 0;
        e.del.gain.setTargetAtTime(e.delBase, t, MIX_SWITCH_TC);
      }
    }
  }

  /**
   * The fill: `amount` 0 = off. A new `seed` is a new idea for the same board. `kept`
   * freezes a fill: those notes play whatever the board does, until it is let go.
   */
  setFill(amount: number, seed: number, kept: FillNote[] | null): void {
    this.fillAmount = Math.max(0, Math.min(1, amount));
    this.fillSeed = seed;
    this.fillKept = kept;
  }

  /** Where fill ideas come from (switchable while playing). */
  setFillEngine(engine: 'magenta' | 'rules'): void {
    if ((this.cfg.fillEngine ?? 'magenta') === engine) return;
    this.cfg.fillEngine = engine;
    this.fillKey = ''; // rebuild from the new source on the next beat
  }

  /** What the player is told about where the fill is coming from. */
  getFillStatus(): FillSourceStatus {
    if ((this.cfg.fillEngine ?? 'magenta') === 'rules') return 'rules';
    const st = magentaStatus();
    if (st === 'failed') return 'offline';
    if (st !== 'ready') return 'loading';
    return this.aiAnsweredKey === this.fillKey ? 'ai' : 'thinking';
  }

  /** The fill playing now (kept or following the board), for drawing and for Keep. */
  getFillNotes(): FillNote[] {
    if (this.fillAmount <= 0) return [];
    return this.fillKept ?? this.fillNotes;
  }

  /** Evolve settings (safe while playing). Applied from the next beat. */
  setEvolve(settings: EvolveSettings): void {
    this.evolve = { ...settings, amount: Math.max(0, Math.min(1, settings.amount)) };
  }

  /** The loop Evolve is on now (for Hold). */
  getEvolveLap(): number {
    return Math.max(0, this.evolveLap);
  }

  /** What each colour sounds like now, in words, and which scene that is. */
  getEvolveLabels(): Map<string, { label: string; scene: number }> {
    const out = new Map<string, { label: string; scene: number }>();
    for (const ch of this.cfg.channels) {
      const e = this.voiceByChannel.get(ch.id);
      if (e) {
        const own = ch.instrument && ch.instrument.length > 0 ? ch.instrument : null;
        out.set(ch.id, { label: describeEvolve(e.evo ?? NEUTRAL, own ?? worldOf(this.cfg.soundWorld ?? 'none')?.name ?? 'Default', this.cfg.phrases === true), scene: e.evo?.scene ?? 0 });
      } else if (ch.role === 'drums') {
        const kit = this.drumEvo.variant > 0 ? `Drums, kit ${(this.drumEvo.variant % 4) + 1}` : 'Drums';
        out.set(ch.id, { label: describeEvolve(this.drumEvo, kit, this.cfg.phrases === true), scene: this.drumEvo.scene });
      }
    }
    return out;
  }

  /** The Evolve state for a colour (neutral when it has none). */
  private evoFor(id: string): EvolveState {
    return this.voiceByChannel.get(id)?.evo ?? NEUTRAL;
  }

  /**
   * Move every colour's sound to where Evolve has it on this loop: glide the drift, swap
   * the instrument at a scene change. Runs once per loop (or when the settings change).
   */
  private applyEvolve(beat: number): void {
    const cycle = Math.max(1, this.cfg.cols * Math.max(1, this.cfg.numPages));
    const lap = lapIndex(beat, cycle);
    const ev = this.evolve;
    const key = `${ev.amount}|${ev.sceneLoops}|${ev.seed}|${ev.holdLap}|${this.cfg.soundWorld}`;
    if (lap === this.evolveLap && key === this.evolveKey) return;
    this.evolveLap = lap;
    this.evolveKey = key;
    const world = this.cfg.soundWorld ?? 'none';
    const at = ev.holdLap ?? lap;
    this.evolveScene = ev.amount > 0 ? Math.floor(at / Math.max(1, ev.sceneLoops)) : 0;
    const t = Tone.immediate();
    const studio = this.studioOn();
    for (const ch of this.cfg.channels) {
      const role = ch.role;
      if (role === 'drums') {
        this.drumEvo = evolveState({ colour: ch.id, role, lap: at, seed: ev.seed, amount: ev.amount, sceneLoops: ev.sceneLoops, world, ownInstrument: true });
        const w = worldOf(world);
        const on = ev.amount > 0;
        // Without a world the kit is wide open, so a drift brighter could never be heard:
        // under Evolve it starts from a little below the top to have room both ways.
        const base = w?.drums.toneHz ?? (on ? 12000 : 20000);
        this.drumTone?.frequency.setTargetAtTime(Math.min(20000, base * this.drumEvo.brightness), t, EVOLVE_GLIDE_SEC);
        // Some room around the kit, growing and shrinking with the scene.
        this.drumRev?.gain.setTargetAtTime(on ? 0.12 * this.drumEvo.reverb : 0, t, EVOLVE_GLIDE_SEC);
        // Another kick and snare from the kit for this scene.
        this.drumKit?.setFixedVariant?.(this.drumEvo.variant > 0 ? this.drumEvo.variant : null);
        continue;
      }
      const e = this.voiceByChannel.get(ch.id);
      if (!e || (role !== 'melody' && role !== 'chord' && role !== 'bass')) continue;
      const own = !!(ch.instrument && ch.instrument.length > 0);
      const state = evolveState({ colour: ch.id, role, lap: at, seed: ev.seed, amount: ev.amount, sceneLoops: ev.sceneLoops, world, ownInstrument: own });
      // A scene's instrument: swap the voice, letting the old one ring out.
      const wanted = state.voice?.name ?? null;
      if (wanted !== (e.voiceName ?? null)) {
        const next = new BoardSequencerVoice(this.ctx, state.voice?.spec ?? voiceSpecFor(ch, world));
        next.connect(e.gain);
        const old = e.voice;
        e.voice = next;
        e.voiceName = wanted;
        setTimeout(() => old.dispose(), VOICE_RETIRE_MS);
      }
      e.evo = state;
      e.voice.setBrightness(e.toneBase * this.toneScale * state.brightness);
      e.rev.gain.setTargetAtTime(e.revBase * state.reverb, t, EVOLVE_GLIDE_SEC);
      e.del.gain.setTargetAtTime(e.delBase + state.delay, t, EVOLVE_GLIDE_SEC);
      if (studio && e.pan) e.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, (e.panBase ?? 0) + state.pan)), t, EVOLVE_GLIDE_SEC);
    }
  }

  /** Counters play phrases (on) or one note each (off), from the next beat. */
  setPhrases(on: boolean): void {
    this.cfg.phrases = on;
  }

  private studioOn(): boolean {
    return this.cfg.studioMix !== false;
  }

  /**
   * Switch between the studio mix and the original one, live, for A/B listening. The two
   * outputs crossfade; placement and ducking follow; note lengths change from the next
   * note on.
   */
  setStudioMix(on: boolean): void {
    if (on === this.studioOn()) return;
    this.cfg.studioMix = on;
    const t = Tone.immediate();
    this.studioOut?.gain.setTargetAtTime(on ? 1 : 0, t, MIX_SWITCH_TC);
    this.classicOut?.gain.setTargetAtTime(on ? 0 : 1, t, MIX_SWITCH_TC);
    this.voiceByChannel.forEach((e) => {
      e.pan?.pan.setTargetAtTime(on ? (e.panBase ?? 0) : 0, t, MIX_SWITCH_TC);
    });
    this.drumKit?.setPans(on ? DEFAULT_BOARD_MIX.drumPans : {});
    if (!on && this.duckBus) {
      this.duckBus.gain.cancelScheduledValues(t);
      this.duckBus.gain.setTargetAtTime(1, t, MIX_SWITCH_TC);
    }
  }

  /** Dip the ducked parts for a kick at `time` (studio mix only). */
  private duckForKick(time: number): void {
    const g = this.duckBus?.gain;
    if (!g || !this.studioOn()) return;
    const d = DEFAULT_BOARD_MIX.duck;
    const depth = worldOf(this.cfg.soundWorld ?? 'none')?.duck ?? d.depth;
    if (depth <= 0) return;
    // Kicks are scheduled in time order, so anything already queued past this one is a
    // recovery that this kick supersedes.
    g.cancelScheduledValues(time);
    g.setTargetAtTime(1 - depth, time, d.attackTc);
    g.setTargetAtTime(1, time + d.holdSec, d.releaseTc);
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
      this.voiceByChannel.forEach((e) => e.voice.setBrightness(e.toneBase * this.toneScale * (e.evo?.brightness ?? 1)));
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

  /**
   * Pause/resume all sound. The clock, the detection and the whole step keep running and
   * only the output is silenced, so the lights, the "Now:" line and the playhead carry on
   * — players who rely on watching rather than hearing must not lose the pattern the
   * moment someone presses Mute.
   */
  setMuted(muted: boolean): void {
    this.muted = muted;
    // Always its own short ramp: Mute has to cut, not fade. A volume counter glides over
    // controlGlideSec (0.3 s by default), and borrowing that made Mute take about a
    // second, with every note still firing underneath it.
    this.applyMixGain(MUTE_GLIDE_SEC);
  }

  /** Live sound controls (safe to call while running). */
  setVolume(v: number, glideSec = 0.02): void {
    this.cfg.volume = v;
    // Remembered for when the sound comes back; while muted the bus stays where it is,
    // so a volume counter being moved can neither un-mute nor restart the fade.
    if (this.muted) return;
    this.applyMixGain(glideSec);
  }

  private applyMixGain(glideSec = 0.02): void {
    if (this.mix) this.mix.gain.setTargetAtTime(this.muted ? 0 : this.cfg.volume, Tone.immediate(), glideSec);
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
    e.voice.setBrightness(t * this.toneScale * (e.evo?.brightness ?? 1));
  }

  setChannelReverbSend(id: string, s: number): void {
    const e = this.voiceByChannel.get(id);
    if (e) {
      e.revBase = s;
      e.rev.gain.setTargetAtTime(s * (e.evo?.reverb ?? 1), Tone.immediate(), 0.03);
    }
  }

  setChannelDelaySend(id: string, s: number): void {
    const e = this.voiceByChannel.get(id);
    if (e) {
      e.delBase = s;
      e.del.gain.setTargetAtTime(s + (e.evo?.delay ?? 0), Tone.immediate(), 0.03);
    }
  }

  /** How hard counters play when they have no loudness of their own (live). */
  setVelocity(v: number): void {
    this.cfg.velocity = Math.max(0, Math.min(1, v));
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

  /** Turn Variation on/off live. Off means every counter plays every pass, loops too. */
  setVariationEnabled(on: boolean): void {
    this.cfg.variationEnabled = on;
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
    const target = Math.floor((now + LOOKAHEAD_SEC - this.startSec) / secPerBeat);
    if (target === this.lastInternalBeat) return;
    // Catch up over EVERY beat that was missed, the way the song-locked path already does.
    // Jumping straight to the newest one deleted the beats in between: one heavy camera
    // frame dropped a column, and a backgrounded tab (setInterval clamped to 1 Hz) played
    // exactly half the pattern — while the playhead, which is time-derived, swept on and
    // lit the columns that never sounded.
    if (target < this.lastInternalBeat) {
      // The look-ahead is a fixed number of SECONDS, so it spans fewer beats after a
      // slow-down and the target can step back over beats that have already played.
      // Resync quietly: replaying them made sliding the tempo counter down hiccup and
      // flam, and the counter calls setBpm on every camera frame while it is moving.
      this.lastInternalBeat = target;
      return;
    }
    const first = Math.max(this.lastInternalBeat + 1, target - MAX_CATCHUP_BEATS);
    for (let beatIdx = first; beatIdx <= target; beatIdx++) {
      let stepTime = this.startSec + beatIdx * secPerBeat;
      if (beatIdx % 2 === 1) stepTime += this.cfg.swing * secPerBeat * 0.5; // groove off-beats
      // A stall can leave a beat's time already behind us; Tone would clamp it anyway, but
      // saying so here keeps the fired-note log honest about when it really sounds.
      this.fireStep(beatIdx, Math.max(now, stepTime), secPerBeat, null);
    }
    this.lastInternalBeat = target;
  }

  /** Locked to a song: fire a step on each of the song's beats, chord-locked. */
  private scheduleSynced(src: BoardSyncSource): void {
    const beats = src.beats;
    const t = src.getTime();
    const now = Tone.immediate();
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
      // `t` is the song's AUDIBLE position (ctx.currentTime), so the base has to be the
      // same clock. Tone.now() is currentTime + lookAhead, which put every board note a
      // whole look-ahead (100 ms) behind the song's beat — a constant, obvious flam.
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
    try {
      this.applyEvolve(beat);
    } catch (err) {
      console.warn('[BoardSequencer] Evolve could not change the sound:', err);
    }
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
    // Saved loops and pages outlive the grid they were made on, so a player who shrinks
    // Rows or Steps can hold cells that no longer fit. Those must be silent, not wrong:
    // a row past the top gives a negative degree and sounds an octave BELOW the root —
    // a note nobody ever placed.
    const onGrid = (c: ActiveCell): boolean =>
      c.row >= 0 && c.row < this.cfg.rows && c.col >= 0 && c.col < this.cfg.cols;
    const tagged: { cell: ActiveCell; source: FiredNote['source'] }[] = [
      ...cells.filter(onGrid).map((c) => ({ cell: c, source: liveSource })),
      ...this.activeLoops.flat().filter(onGrid).map((c) => ({ cell: c, source: 'loop' as const })),
    ];
    const playCells = tagged.map((t) => t.cell);
    this.fireFill(beat, cellTime, secPerBeat, chord, playCells);
    if (this.cfg.phrases) {
      this.firePhrases(beat, cellTime, secPerBeat, chord, tagged);
      return;
    }
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
    // The same drum piece hit twice at the same instant. Three kit pieces (hat, crash,
    // rim) have a single sample, so round robin reuses one Player, and Tone THROWS if a
    // Player is restarted at a time it is already playing. The exception escaped the loop
    // and every cell after it in this beat was silently dropped — which reads as "the
    // board randomly forgets notes". Two identical hits at one instant are one hit anyway.
    const drumHits = new Set<string>();
    // Where each colour plays, for letting a note ring up to the next one.
    const colsByColour = new Map<ColourId, number[]>();
    for (const c of playCells) {
      const list = colsByColour.get(c.colour);
      if (list) list.push(c.col);
      else colsByColour.set(c.colour, [c.col]);
    }
    for (const { cell, source } of tagged) {
      try {
        this.fireCell(cell, source, beat, cellTime, secPerBeat, chord, voicing, oct, h, melodicLoop, durSec, drumHits, colsByColour);
      } catch (err) {
        // One cell must never take the rest of the beat with it.
        console.warn('[BoardSequencer] a cell failed to play:', err);
      }
    }
  }

  /** The phrase engine's view of the cells, for both playing and fitting a fill around. */
  private phraseCells(cells: readonly ActiveCell[]): PhraseCell[] {
    const out: PhraseCell[] = [];
    for (const c of cells) {
      const role = this.roleFor(c.colour);
      if (role !== 'melody' && role !== 'chord' && role !== 'drums' && role !== 'bass') continue;
      if (role !== 'drums' && !this.voiceByChannel.has(c.colour)) continue;
      out.push({ row: c.row, col: c.col, colour: c.colour, role, conditional: c.conditional });
    }
    return out;
  }

  private phraseInput(cells: PhraseCell[], beat: number, chord: BoardChord | null, pingPong: boolean): PhraseInput {
    return {
      cells,
      stepFor: (role: PhraseRole) => playheadStep(beat, this.rawLoop(this.loopCategory(role)), this.cfg.cols, pingPong),
      loopFor: (role: PhraseRole) => loopLen(this.rawLoop(this.loopCategory(role)), this.cfg.cols),
      rows: this.cfg.rows,
      rootMidi: this.cfg.scaleRootMidi,
      semitones: this.cfg.scaleSemitones,
      songChord: chord && chord.notes.length > 0 ? chord.notes : null,
      style: worldOf(this.cfg.soundWorld ?? 'none')?.id ?? 'warm',
      evolveOf: (colour: string) => {
        const evo = this.roleFor(colour) === 'drums' ? this.drumEvo : this.evoFor(colour);
        return { variant: evo.variant, busy: evo.busy };
      },
    };
  }

  /**
   * Everything the board plays over one time round the loop, for the fill to fit around.
   * Uses exactly the rules that play it — phrases or one note per counter.
   */
  private soundingOverLoop(cells: readonly ActiveCell[], chord: BoardChord | null): SoundingNote[] {
    const out: SoundingNote[] = [];
    const cols = this.cfg.cols;
    if (this.cfg.phrases) {
      const pc = this.phraseCells(cells);
      for (let b = 0; b < cols; b++) {
        for (const ev of phraseEventsAtStep(this.phraseInput(pc, b, chord, false))) {
          out.push({ step: b, offset: ev.offset, role: ev.role, colour: ev.colour, midi: ev.midi, drum: ev.drum });
        }
      }
      return out;
    }
    for (const c of cells) {
      const ch = this.channelById.get(c.colour);
      if (!ch) continue;
      const degree = this.cfg.rows - 1 - c.row;
      const midi = degreeMidi(degree, this.cfg.scaleRootMidi, this.cfg.scaleSemitones);
      if (ch.role === 'melody') out.push({ step: c.col, offset: 0, role: 'melody', colour: c.colour, midi });
      else if (ch.role === 'bass') out.push({ step: c.col, offset: 0, role: 'bass', colour: c.colour, midi: midi - 12 });
      else if (ch.role === 'chord') out.push({ step: c.col, offset: 0, role: 'chord', colour: c.colour, midi });
      else if (ch.role === 'drums') {
        const drum = ch.drum && ch.drum.length > 0 ? ch.drum : drumForRow(c.row, this.cfg.rows, DEFAULT_DRUM_ROWS);
        if (drum) out.push({ step: c.col, offset: 0, role: 'drums', colour: c.colour, drum: drum as KitDrum });
      }
    }
    return out;
  }

  /**
   * Play the fill notes that fall in this beat. The fill is rebuilt only when the board,
   * the amount or the idea changes, never per beat, and a kept fill is never rebuilt.
   */
  private fireFill(
    beat: number, cellTime: number, secPerBeat: number, chord: BoardChord | null, cells: readonly ActiveCell[],
  ): void {
    if (this.fillAmount <= 0) return;
    if (!this.fillKept) {
      const key = JSON.stringify([
        cells.map((c) => `${c.row},${c.col},${c.colour}`).sort(), this.fillAmount, this.fillSeed, this.evolveScene,
        this.cfg.phrases, this.cfg.soundWorld, this.cfg.scaleRootMidi, this.cfg.scaleSemitones,
        this.cfg.rows, this.cfg.cols, chord?.notes ?? null,
      ]);
      const useAi = (this.cfg.fillEngine ?? 'magenta') === 'magenta';
      const fullKey = `${key}|${useAi ? 'ai' : 'rules'}`;
      if (fullKey !== this.fillKey) {
        this.fillKey = fullKey;
        this.fillChangedAt = cellTime;
        const pc = this.cfg.phrases ? this.phraseCells(cells) : [];
        const ctx: FillContext = {
          sounding: this.soundingOverLoop(cells, chord),
          loop: this.cfg.cols,
          rows: this.cfg.rows,
          rootMidi: this.cfg.scaleRootMidi,
          semitones: this.cfg.scaleSemitones,
          harmonyAt: this.cfg.phrases
            ? (step) => harmonyAt(this.phraseInput(pc, step, chord, false))?.tones ?? null
            : undefined,
          amount: this.fillAmount,
          // Each Evolve scene brings a fresh idea, so the fill moves on with the sound.
          seed: this.fillSeed + this.evolveScene * 7919,
        };
        this.fillCtx = ctx;
        this.fillTaken = { melody: new Set(), bass: new Set(), drums: new Set() };
        for (const n of ctx.sounding) {
          if (n.role !== 'chord') this.fillTaken[n.role].add(n.step * 4 + Math.round(n.offset * 4));
        }
        if (!useAi || magentaStatus() === 'failed') {
          this.fillNotes = generateFill(ctx);
        } else {
          void loadMagenta();
          // Until the models are ready the simple rules play; once they are, the last AI
          // idea plays on (minus anything now under the player's notes) until the next
          // one arrives.
          if (magentaStatus() !== 'ready' || this.aiAnsweredKey === '') this.fillNotes = generateFill(ctx);
        }
      }
      // Ask the AI once the board has been still for a moment.
      if (useAi && this.fillCtx && this.aiAskedKey !== this.fillKey
        && magentaStatus() !== 'failed' && cellTime - this.fillChangedAt >= AI_SETTLE_SEC) {
        const askedKey = this.fillKey;
        const ctx = this.fillCtx;
        this.aiAskedKey = askedKey;
        magentaFill(ctx, askedKey).then((notes) => {
          if (this.fillKey !== askedKey) return;
          this.fillNotes = notes;
          this.aiAnsweredKey = askedKey;
        }).catch(() => {
          if (this.fillKey === askedKey) this.fillNotes = generateFill(ctx);
        });
      }
    }
    const notes = this.fillKept ?? this.fillNotes;
    if (notes.length === 0) return;
    const step = ((beat % this.cfg.cols) + this.cfg.cols) % this.cfg.cols;
    const lap = lapIndex(beat, this.cfg.cols);
    const world = worldOf(this.cfg.soundWorld ?? 'none');
    const swing = Math.min(0.9, this.cfg.swing + (world?.phraseSwing ?? 0));
    const oct = this.cfg.octaveShift * 12;
    const hits = new Set<string>();
    for (const n of notes) {
      if (n.step !== step) continue;
      if (n.everyNthLap && lap % n.everyNthLap !== n.everyNthLap - 1) continue;
      // Never under a note the player is making now — an older idea may predate it.
      if (!this.fillKept && this.fillTaken[n.role].has(n.step * 4 + Math.round(n.offset * 4))) continue;
      try {
        const shifted = n.offset === 0.5 ? n.offset + swing / 6
          : (n.offset === 0.25 || n.offset === 0.75) ? n.offset + swing / 12 : n.offset;
        const time = Math.max(Tone.now(), cellTime + shifted * secPerBeat);
        // The fill sits under the player's notes: FILL_LEVEL is applied once, here.
        const vel = Math.max(0, Math.min(1, this.cfg.velocity * n.accent)) * FILL_LEVEL;
        if (n.drum) {
          if (!this.drumKit) continue;
          const hit = `${n.drum}@${time}`;
          if (hits.has(hit)) continue;
          hits.add(hit);
          this.drumKit.play(n.drum, vel, time);
        } else if (n.midi !== undefined) {
          const voice = this.voiceByChannel.get(n.colour)?.voice;
          if (!voice) continue;
          const evo = this.evoFor(n.colour);
          voice.play(n.midi + oct + 12 * evo.octave, vel, n.dur * secPerBeat * evo.length, time);
        } else continue;
        this.recordFired({
          row: n.cell.row, col: n.cell.col, colour: n.colour, role: n.role,
          audioTime: time, durSec: n.dur * secPerBeat, source: 'live', origin: 'fill',
        });
      } catch (err) {
        console.warn('[BoardSequencer] a fill note failed to play:', err);
      }
    }
  }

  /**
   * Phrase mode: every sequenced counter plays the idea it started (see phrases.ts), on
   * sub-steps inside this beat. Each note lights the counter that started it.
   */
  private firePhrases(
    beat: number, cellTime: number, secPerBeat: number, chord: BoardChord | null,
    tagged: { cell: ActiveCell; source: FiredNote['source'] }[],
  ): void {
    const world = worldOf(this.cfg.soundWorld ?? 'none');
    const cells = this.phraseCells(tagged.map((t) => t.cell));
    if (cells.length === 0) return;
    const byKey = new Map<string, { cell: ActiveCell; source: FiredNote['source'] }>();
    for (const t of tagged) byKey.set(`${t.cell.row},${t.cell.col},${t.cell.colour}`, t);
    const events = phraseEventsAtStep(this.phraseInput(cells, beat, chord, this.cfg.pingPong ?? false));
    const oct = this.cfg.octaveShift * 12;
    const h = this.cfg.humanize;
    // Swing on the off-beats inside the beat: the player's own plus the world's feel.
    const swing = Math.min(0.9, this.cfg.swing + (world?.phraseSwing ?? 0));
    const drumHits = new Set<string>();
    for (const ev of events) {
      try {
        const varies = ev.owner.conditional && this.cfg.variationEnabled !== false;
        if (!firesThisLapPaged(varies, beat, this.cfg.cols, this.cfg.numPages)) continue;
        const tag = byKey.get(`${ev.owner.row},${ev.owner.col},${ev.colour}`);
        const base = tag?.cell.velocity ?? this.cfg.velocity;
        const vel = Math.max(0, Math.min(1, base * ev.accent * (h > 0 ? 1 - Math.random() * h * 0.3 : 1)));
        const shifted = ev.offset === 0.5 ? ev.offset + swing / 6
          : (ev.offset === 0.25 || ev.offset === 0.75) ? ev.offset + swing / 12 : ev.offset;
        const time = Math.max(Tone.now(), cellTime + (shifted + (tag?.cell.timingBeats ?? 0)) * secPerBeat);
        const durSec = ev.dur * secPerBeat;
        if (ev.drum) {
          if (!this.drumKit) continue;
          const hit = `${ev.drum}@${time}`;
          if (drumHits.has(hit)) continue;
          drumHits.add(hit);
          this.drumKit.play(ev.drum, vel, time);
          if (ev.drum === 'kick') this.duckForKick(time);
        } else if (ev.midi !== undefined) {
          const voice = this.voiceByChannel.get(ev.colour)?.voice;
          if (!voice) continue;
          const evo = this.evoFor(ev.colour);
          voice.play(ev.midi + oct + 12 * evo.octave, vel, durSec * evo.length, time);
        } else continue;
        this.recordFired({
          row: ev.owner.row, col: ev.owner.col, colour: ev.colour, role: ev.role,
          audioTime: time, durSec, source: tag?.source ?? 'live', origin: 'phrase',
        });
      } catch (err) {
        console.warn('[BoardSequencer] a phrase note failed to play:', err);
      }
    }
  }

  /* eslint-disable-next-line max-params */
  private fireCell(
    cell: ActiveCell, source: FiredNote['source'], beat: number, cellTime: number,
    secPerBeat: number, chord: BoardChord | null, voicing: Map<string, number>,
    oct: number, h: number, melodicLoop: number, durSec: number, drumHits: Set<string>,
    colsByColour: Map<ColourId, number[]>,
  ): void {
    {
      const ch = this.channelById.get(cell.colour);
      if (!ch) return;
      const role = ch.role;
      // Control roles (faders/toggles) and 'off' are not sequenced.
      if (role !== 'melody' && role !== 'chord' && role !== 'drums' && role !== 'bass') return;
      // Per-role polyrhythm: a cell fires when its column matches the role's
      // own playhead (beat wrapped at that role's loop length).
      const cat = this.loopCategory(role);
      if (cell.col !== playheadStep(beat, this.rawLoop(cat), this.cfg.cols, this.cfg.pingPong ?? false)) return;
      // Variation: an off-centre ("conditional") cell plays only on variation laps,
      // so the loop alternates a full pass and a full-plus-variations pass.
      // A saved loop keeps the Variation flags it was captured with. Once Variation is
      // switched off the live board plays every counter every pass, so a loop that went
      // on dropping notes on alternate laps had nothing on screen explaining why.
      const varies = (cell.conditional ?? false) && this.cfg.variationEnabled !== false;
      if (!firesThisLapPaged(varies, beat, this.cfg.cols, this.cfg.numPages)) return;
      // Humanize: occasionally skip a step + vary velocity, so loops breathe.
      if (h > 0 && Math.random() < h * 0.5) return;
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
          const hit = `${drum}@${stepTime}`;
          if (drumHits.has(hit)) return;
          drumHits.add(hit);
          this.drumKit.play(drum as KitDrum, vel, stepTime);
          if (drum === 'kick' || drum === 'kickCrash') this.duckForKick(stepTime);
          this.recordFired({ row: cell.row, col: cell.col, colour: cell.colour, role, audioTime: stepTime, durSec, source });
        }
        return;
      }
      const voice = this.voiceByChannel.get(ch.id)?.voice;
      if (!voice) return;
      // Studio mix: a note rings on towards the channel's next note instead of stopping
      // dead after Note length, the single biggest cause of the board sounding plinky.
      // Note length stays the floor, so a player who chose long notes keeps them. Not with
      // ping-pong, where "the next note" depends on which way the playhead is going.
      const ringSec = (loop: number): number => {
        if (!this.studioOn() || this.cfg.pingPong) return durSec;
        const cols = colsByColour.get(cell.colour) ?? [];
        const beats = legatoBeats(cell.col, cols, loop, DEFAULT_BOARD_MIX.legatoMaxBeats);
        return Math.max(durSec, beats * secPerBeat);
      };
      if (role === 'bass') {
        // Bass pitch follows the row like melody (bottom = low), an octave down.
        const degree = this.cfg.rows - 1 - cell.row;
        const base = chord && chord.notes.length > 0
          ? chordDegreeMidi(degree, chord.notes)
          : degreeMidi(degree, this.cfg.scaleRootMidi, this.cfg.scaleSemitones);
        const dur = ringSec(loopLen(this.rawLoop('bass'), this.cfg.cols)) * this.evoFor(ch.id).length;
        voice.play(base - 12 + oct, vel, dur, stepTime);
        this.recordFired({ row: cell.row, col: cell.col, colour: cell.colour, role, audioTime: stepTime, durSec: dur, source });
      } else if (role === 'chord' || ch.instrument === 'chord') {
        // Chord stab: play a stack (the song chord, or a scale triad) at once.
        const evo = this.evoFor(ch.id);
        for (const n of this.chordStack(cell, chord, 'row')) {
          voice.play(n + oct + 12 * evo.octave, vel, durSec * evo.length, stepTime);
        }
        this.recordFired({ row: cell.row, col: cell.col, colour: cell.colour, role, audioTime: stepTime, durSec, source });
      } else {
        const midi = voicing.get(`${cell.row},${cell.col}`);
        if (midi !== undefined) {
          // A 'pad' instrument sustains a whole loop (re-triggered each pass) as a
          // held harmonic bed; others play the short note length.
          const evo = this.evoFor(ch.id);
          const dur = (ch.instrument === 'pad' ? secPerBeat * melodicLoop : ringSec(melodicLoop)) * evo.length;
          voice.play(midi + oct + 12 * evo.octave, vel, dur, stepTime);
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
      e.pan?.disconnect();
    });
    this.voiceByChannel.clear();
    this.channelById.clear();
    this.limiter?.dispose();
    this.limiter = null;
    this.classicOut?.disconnect();
    this.classicOut = null;
    this.studioOut?.disconnect();
    this.studioOut = null;
    this.masterChain?.dispose();
    this.masterChain = null;
    this.duckBus?.disconnect();
    this.duckBus = null;
    this.mixTone?.disconnect();
    this.mixTone = null;
    this.drumTone?.disconnect();
    this.drumTone = null;
    this.drumLevel?.disconnect();
    this.drumLevel = null;
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
