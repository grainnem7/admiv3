/**
 * SongPresetEngine — Tone.js-powered stem playback with 5-color voice system.
 *
 * Manages 4 audio stems (vocals, drums, bass, other) alongside 4 generated
 * accompaniment voices (chord pad, melody, arpeggio, bass synth). At any time,
 * only 2 of 5 colored objects are active — whichever 2 the camera sees.
 *
 * Color roles:
 *   Blue   → Stem Mixer (controls original recording)
 *   Red    → Chord Pad (warm FM pad with event triggering)
 *   Green  → Melodic Notes (quantized pentatonic, band-crossing triggers)
 *   Yellow → Arpeggio (Transport-locked cascading pattern)
 *   Orange → Bass Synth (rhythmic MonoSynth hits)
 *
 * Audio graph:
 *
 *   Stems ── StemMixerVoice ── stemBus ── sidechainGain ──┐
 *                                                          ├── dryGain ──────────┐
 *   ChordPadVoice  ─┐                                     │                     │
 *   MelodicVoice   ─┼── generatedBus ────────────────────┘                     │
 *   ArpeggioVoice  ─┤                                                           ├── masterGain ── dest
 *   BassSynthVoice ─┘                                                           │
 *                         reverbSend ── Tone.Reverb ── reverbWetGain ──────────┘
 */

import * as Tone from 'tone';
import type { SongConfig } from './songLibrary';
import type { ColorRole } from './songLibrary';
import type { ChordEntry } from './voices/chordLookup';
import { getChordAtTime } from './voices/chordLookup';
import { ToneVoiceBase, lerp, clamp } from './voices/ToneVoiceBase';
import { StemMixerVoice } from './voices/StemMixerVoice';
import type { StemGainRef } from './voices/StemMixerVoice';
import { ChordPadVoice } from './voices/ChordPadVoice';
import { MelodicVoice } from './voices/MelodicVoice';
import { HarmonyVoice } from './voices/HarmonyVoice';
import { ArpeggioVoice } from './voices/ArpeggioVoice';
import { BassSynthVoice } from './voices/BassSynthVoice';
import { InstrumentVoice, nextBeatAfter } from './voices/InstrumentVoice';
import { WalkVoice } from './voices/WalkVoice';
import { MasterChain } from '../audio/MasterChain';
import {
  DEFAULT_INSTRUMENT_KEY,
  INSTRUMENT_PALETTE_BY_KEY,
} from './voices/presets/instrumentPalette';
import { loadStemBuffers } from '../remix/loadStemBuffers';
import { loadSongAnalysis } from './analysisLoader';
import { HeadBopDetector } from '../mapping/nodes/HeadRhythmNode';
import { HeadBopKit, pickHeadBopDrum } from './voices/HeadBopKit';
import type { HeadBopDrum } from './voices/HeadBopKit';
import type { FaceLandmarks } from '../state/types';

// ============================================
// Types
// ============================================

/**
 * Per-baton mode selector.
 *   parameter  → existing colour-role behaviour (melody, bass, arp, chord pad)
 *   instrument → InstrumentVoice plays chord-tone notes on a chosen
 *                instrument from the curated palette.
 *   harmonizer → green-only mode. Plays a chord-aware harmony to the
 *                song's vocal melody (from analysis.json.harmony[]).
 *   walk       → generates an up-down arpeggio over the current chord's
 *                voicing notes. Triggers on beat while the baton moves.
 *                X is ignored; Y drives dynamics. Available on any
 *                generative baton (red/green/yellow/orange).
 */
export type BatonMode = 'parameter' | 'instrument' | 'harmonizer' | 'walk';

/** Persisted assignment for a single baton. */
export interface BatonAssignment {
  mode: BatonMode;
  /** Palette key (e.g. "piano"); only meaningful in instrument mode. */
  instrumentKey: string;
}

export interface VoicePosition {
  x: number;   // 0-1 normalised horizontal
  y: number;   // 0-1 normalised vertical
  found: boolean;
}

export interface SongCalibration {
  [role: string]: { minX: number; maxX: number; minY: number; maxY: number };
}

export interface SongPresetStatus {
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  stemsLoaded: number;
  stemsTotal: number;
  loadingComplete: boolean;
  stemVolumes: Record<string, number>;
  filterHz: number;
  reverbWet: number;
  distance: number;
  stemMixerZone: 'left' | 'center' | 'right' | null;
  activeColors: ColorRole[];
  currentChordName: string | null;
  accompVolume: number;
  stemVolume: number;
  chordOffset: number;
  bpmAdjust: number;
  effectiveBpm: number;
  currentBeatIndex: number;
  totalBeats: number;
  hasAnalysis: boolean;
  continuousBackingEnabled: boolean;
  continuousBackingLevel: number;
  voicePresets: Record<string, string>;
  /**
   * Per-baton mode ("parameter" or "instrument") for each of the four
   * generative colour roles.  Blue (stem mixer) is omitted because it
   * is not switchable.
   */
  batonModes: Record<string, BatonMode>;
  /**
   * Per-baton instrument-palette key when in instrument mode.  Kept
   * even when the role is in parameter mode so toggling back doesn't
   * lose the previous selection.
   */
  batonInstruments: Record<string, string>;
  /**
   * Beat-snap (Beat Bopping) mode.  When true, every instrument-mode
   * baton trigger is quantised to the next beat in the song's beat
   * grid.  Has no effect on parameter-mode voices (which are already
   * beat-aware) or on songs without beat data.
   */
  beatSnap: boolean;
  currentChordRoot: number | null;
}

// ============================================
// Constants
// ============================================

const REVERB_LERP = 0.05;
const BEAT_PULSE_DB = 1.5;    // dB bump on downbeats
const BEAT_PULSE_MS = 50;     // ms duration of beat pulse
const SIDECHAIN_DEPTH = 0.7;  // gain during duck (≈-3dB)
const SIDECHAIN_RECOVERY = 0.06; // time constant for recovery

/** Smoothed velocity below which a baton is considered still (default; tunable via setStillnessThreshold) */
const STILLNESS_THRESHOLD_DEFAULT = 0.04;

/** How long (ms) a baton must be below threshold before its voice is muted (default; tunable via setStillnessHysteresisMs) */
const STILLNESS_HYSTERESIS_MS_DEFAULT = 300;

/**
 * How long (ms) sustained motion above threshold is required before a
 * silenced baton un-mutes.  Default 0 = un-mute on first motion frame,
 * matching the original behaviour.  Raising this debounces the pick-up
 * spike that occurs when a baton enters frame after being set down —
 * without it, the centroid jump from "not detected" to "detected" can
 * register as a note onset on the very first frame.
 */
const ONSET_DEBOUNCE_MS_DEFAULT = 0;

// The 5 color roles in priority order (for selecting which 2 are active)
const ROLE_PRIORITY: ColorRole[] = ['blue', 'red', 'green', 'yellow', 'orange'];

// ============================================
// Stem state
// ============================================

interface StemState {
  id: string;
  buffer: AudioBuffer;
  sourceNode: AudioBufferSourceNode | null;
  gainNode: GainNode;
  currentGain: number;
  targetGain: number;
}

// ============================================
// Velocity state per color
// ============================================

interface VelocityState {
  prevX: number;
  prevY: number;
  smoothVel: number;
  /** Wall-clock timestamp (ms, Date.now()) when smoothVel first dropped below the still threshold; null while moving */
  stillSince: number | null;
  /** Wall-clock timestamp when sustained motion above threshold first started; null while still or already unmuted */
  motionSince: number | null;
  /** True when the stillness gate is currently silencing this role */
  isMuted: boolean;
}

// ============================================
// Utility
// ============================================

function applyCalibration(raw: number, min: number, max: number): number {
  if (max <= min) return 0.5;
  return clamp((raw - min) / (max - min), 0, 1);
}

/**
 * Find the beat in `beats` closest to `targetTime`.  Returns null if
 * the beat array is empty or undefined.  Exported (not just file-local)
 * so unit tests can exercise the quantisation logic without
 * instantiating the full engine + its Tone.js dependency tree.
 */
export function findNearestBeat(
  beats: readonly number[] | undefined | null,
  targetTime: number,
): number | null {
  if (!beats || beats.length === 0) return null;

  // Binary-search for the insertion point.
  let lo = 0, hi = beats.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] < targetTime) lo = mid + 1;
    else hi = mid;
  }
  const after = beats[lo];
  const before = lo > 0 ? beats[lo - 1] : after;
  return Math.abs(after - targetTime) <= Math.abs(before - targetTime) ? after : before;
}

// ============================================
// Engine
// ============================================

export class SongPresetEngine {
  private ctx: AudioContext | null = null;
  private song: SongConfig | null = null;

  // Stem buffers & nodes (raw Web Audio — kept for simplicity)
  private stems: Map<string, StemState> = new Map();
  private stemsLoaded = 0;
  private stemsTotal = 0;

  // Voices (now ToneVoiceBase)
  private voices: Map<ColorRole, ToneVoiceBase> = new Map();
  private stemMixerVoice: StemMixerVoice | null = null;
  private melodicVoice: MelodicVoice | null = null;

  // Active color tracking
  private activeRoles: ColorRole[] = [];
  private positions: Map<ColorRole, VoicePosition> = new Map();

  // Audio routing (raw GainNodes + shared Tone.Reverb)
  private dryGain: GainNode | null = null;
  private stemBus: GainNode | null = null;
  private sidechainGain: GainNode | null = null;
  private generatedBus: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private reverb: Tone.Reverb | null = null;
  private reverbWetGain: GainNode | null = null;
  private masterGainNode: GainNode | null = null;
  private masterChain: MasterChain | null = null;

  // Playback state
  private isPlayingState = false;
  private isPausedState = false;
  private playbackStartTime = 0;
  private playbackOffset = 0;
  private duration = 0;
  private loopEnabled = true;
  private loopStart = 0;
  private loopEnd = 0;

  // Chord state
  private currentChord: ChordEntry | null = null;
  private chordOffset = 0;
  private bpmAdjust = 0;
  private tappedChordTimes: number[] = [];

  // Beat-quantised chord application: a chord detected mid-beat waits in
  // `pendingChord` until `currentTime` passes `pendingChordBeat`. Time
  // references are aligned — currentTime, beats[], and ChordEntry.time
  // are all seconds from playback start.
  private pendingChord: ChordEntry | null = null;
  private pendingChordBeat: number = 0;
  private lastAppliedChordName: string = '';

  // Reverb state
  private currentReverbWet = 0;
  private currentDistance = 1;

  // Volume controls
  private accompVolume = 1.0;
  private stemVolume = 1.0;

  // Continuous backing
  private continuousBackingEnabled = true;
  private continuousBackingLevel = 0.4;

  // Voice instrument presets (persist across song loads).
  // These are the *parameter-mode* presets — each role-specific voice
  // class (ChordPadVoice, MelodicVoice, etc.) consumes its matching
  // preset catalog (PAD_PRESETS, MELODY_PRESETS, ...).
  private voicePresets: Map<ColorRole, string> = new Map([
    ['red',    'rhodesEP'],     // was 'warmPad'
    ['green',  'clarinet'],     // was 'bell'
    ['yellow', 'nylonGuitar'],  // was 'sparkle'
    ['orange', 'upright'],      // was 'sub'
  ]);

  /**
   * Per-baton mode.  Defaults to 'parameter' (existing behaviour).
   * Blue (stem mixer) is intentionally absent — it is not switchable.
   */
  private batonModes: Map<ColorRole, BatonMode> = new Map([
    ['red',    'parameter'],
    ['green',  'parameter'],
    ['yellow', 'parameter'],
    ['orange', 'parameter'],
  ]);

  /**
   * Per-baton instrument-palette key (used only when the matching role
   * is in instrument mode).  Stored separately from voicePresets so
   * toggling mode preserves both selections.
   */
  private batonInstruments: Map<ColorRole, string> = new Map([
    ['red',    DEFAULT_INSTRUMENT_KEY],
    ['green',  DEFAULT_INSTRUMENT_KEY],
    ['yellow', DEFAULT_INSTRUMENT_KEY],
    ['orange', DEFAULT_INSTRUMENT_KEY],
  ]);

  // Velocity tracking
  private velocityState: Map<ColorRole, VelocityState> = new Map();

  // Stillness gate (per-engine, applied to all colour roles).  Tunable
  // at runtime so the facilitator can lower the threshold when Tim's
  // movements are small, or raise the hysteresis when the camera is
  // shaky.
  private stillnessThreshold = STILLNESS_THRESHOLD_DEFAULT;
  private stillnessHysteresisMs = STILLNESS_HYSTERESIS_MS_DEFAULT;
  private onsetDebounceMs = ONSET_DEBOUNCE_MS_DEFAULT;

  // Beat Bopping mode (Session 5 Change ID 7).  When on, every
  // instrument-mode baton trigger is deferred to the next beat in the
  // loaded song's beat grid — making it impossible to play off-rhythm.
  // Off by default; applies to every InstrumentVoice currently in play
  // and any new ones built on song load / mode switch.
  private beatSnap = false;

  // Head Bopping (Session 5 Change ID 6).  Detects rhythmic downward
  // head movements via FaceLandmarks Y of a chosen landmark (nose tip
  // by default), and fires a drum-kit hit on each bop.  The drum
  // chosen depends on which beat of the bar is hit — downbeat gets a
  // kick + crash splash, backbeats get a snare, others get a kick —
  // and the bop's descent amplitude scales note velocity so small
  // nods sound soft and big nods sound loud.  Beat-snapped if
  // beatSnap is on so it always lands on rhythm.
  private headBopEnabled = false;
  private headBopDetector = new HeadBopDetector(0.025, 200);
  private headBopKit: HeadBopKit | null = null;
  private headBopPending: { targetTime: number; drum: HeadBopDrum; velocity: number } | null = null;
  /** Landmark index sampled for head Y; 1 = nose tip, 10 = forehead. */
  private headBopLandmarkIndex = 1;
  /**
   * Amplitude (frame-height fraction) that should map to maximum
   * velocity (1.0).  Smaller bops below this still get scaled
   * proportionally; larger bops clamp at the top.  Calibrated for the
   * range of head movement typical in seated playing.
   */
  private readonly HEADBOP_AMPLITUDE_FOR_FULL_VELOCITY = 0.08;
  /** Last currentTime seen in update() — used by processFaceLandmarks. */
  private lastUpdateTime = 0;

  // Beat pulse tracking
  private lastDownbeatIndex = -1;

  // Calibration
  private calibration: SongCalibration | null = null;

  // Animation frame
  private animFrameId: number | null = null;

  // Loading callback
  private onLoadProgress: ((loaded: number, total: number) => void) | null = null;

  // ---- Public API ----

  setLoadProgressCallback(cb: (loaded: number, total: number) => void): void {
    this.onLoadProgress = cb;
  }

  async loadSong(song: SongConfig): Promise<void> {
    this.stopPlayback();
    this.disposeAudio();

    this.song = song;
    const stemIds = Object.keys(song.stems);
    this.stemsTotal = stemIds.length;
    this.stemsLoaded = 0;

    // Ensure Tone.js audio context is started
    await Tone.start();
    this.ctx = Tone.getContext().rawContext as AudioContext;

    // Build shared routing
    this.buildRouting();

    // Load all stems via the shared helper, then build per-stem gain nodes.
    const buffers = await loadStemBuffers(
      this.ctx!,
      song.stems,
      (loaded, total) => {
        this.stemsLoaded = loaded;
        this.onLoadProgress?.(loaded, total);
      },
    );
    for (const [stemId, audioBuffer] of buffers) {
      const gainNode = this.ctx!.createGain();
      gainNode.gain.value = 0;
      this.stems.set(stemId, {
        id: stemId,
        buffer: audioBuffer,
        sourceNode: null,
        gainNode,
        currentGain: 0,
        targetGain: 0,
      });
    }

    // Load AI analysis data if available
    if (song.analysisUrl) {
      try {
        const analysis = await loadSongAnalysis(song.analysisUrl);
        song.chordProgression = analysis.chordProgression;
        song.beats = analysis.beats;
        song.downbeats = analysis.downbeats;
        song.harmony = analysis.harmony;
        if (Math.abs(analysis.bpm - song.bpm) < 5) {
          song.bpm = analysis.bpm;
        }
        console.log(`[SongPresetEngine] Loaded analysis: ${analysis.chordProgression.length} chords, ${analysis.beats.length} beats, BPM ${analysis.bpm}`);
      } catch (err) {
        console.warn('[SongPresetEngine] Failed to load analysis, using fallback chord data:', err);
      }
    }

    let maxDuration = 0;
    for (const stem of this.stems.values()) {
      maxDuration = Math.max(maxDuration, stem.buffer.duration);
    }
    this.duration = maxDuration;
    this.loopEnd = maxDuration;

    // Set Transport BPM for synth scheduling
    Tone.getTransport().bpm.value = song.bpm + this.bpmAdjust;

    // Build voices (creates Tone.Sampler instances that start loading)
    this.buildVoices();

    // Wait for all instrument samples to load (10 s timeout in case CDN is slow/offline)
    await Promise.race([
      Tone.loaded(),
      new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
    ]);

    console.log(`[SongPresetEngine] Loaded "${song.title}" — ${stemIds.length} stems, ${maxDuration.toFixed(1)}s, ${song.chordProgression ? song.chordProgression.length + ' chords' : 'no chords'}`);
  }

  play(): void {
    if (!this.ctx || !this.song || this.stems.size === 0) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.createAndStartSources(this.playbackOffset);
    this.isPlayingState = true;
    this.isPausedState = false;

    // Start Tone.Transport alongside stems
    const transport = Tone.getTransport();
    transport.seconds = this.playbackOffset;
    transport.start();

    // Notify voices
    for (const voice of this.voices.values()) {
      voice.onTransportStart();
    }

    this.scheduleUpdate();
    console.log('[SongPresetEngine] Play from', this.playbackOffset.toFixed(1) + 's');
  }

  pause(): void {
    if (!this.isPlayingState || this.isPausedState) return;

    this.playbackOffset = this.getCurrentTime();
    this.stopSources();

    this.isPausedState = true;
    this.cancelUpdate();

    Tone.getTransport().pause();

    for (const voice of this.voices.values()) {
      voice.onTransportPause();
    }

    console.log('[SongPresetEngine] Paused at', this.playbackOffset.toFixed(1) + 's');
  }

  resume(): void {
    if (!this.isPausedState) return;
    this.play();
  }

  restart(): void {
    this.playbackOffset = this.loopStart;
    this.resetPendingChord();
    for (const voice of this.voices.values()) {
      voice.onTransportStop();
    }
    if (this.melodicVoice) {
      this.melodicVoice.setReferenceTime(this.loopStart);
    }
    if (this.isPlayingState) {
      this.stopSources();
      Tone.getTransport().stop();
      this.play();
    }
  }

  stopPlayback(): void {
    if (!this.isPlayingState) return;
    this.stopSources();
    this.cancelUpdate();
    this.isPlayingState = false;
    this.isPausedState = false;
    this.playbackOffset = 0;
    this.resetPendingChord();

    Tone.getTransport().stop();
    Tone.getTransport().cancel();

    for (const voice of this.voices.values()) {
      voice.onTransportStop();
    }

    console.log('[SongPresetEngine] Stopped');
  }

  private resetPendingChord(): void {
    this.pendingChord = null;
    this.pendingChordBeat = 0;
    this.lastAppliedChordName = '';
  }

  setLoopEnabled(enabled: boolean): void {
    this.loopEnabled = enabled;
  }

  setLoopRegion(start: number, end: number): void {
    this.loopStart = clamp(start, 0, this.duration);
    this.loopEnd = clamp(end, 0, this.duration);
    if (this.loopEnd <= this.loopStart) {
      this.loopEnd = this.duration;
    }
  }

  /** Receive positions for all detected colors from the screen. */
  setAllPositions(positions: Map<ColorRole, VoicePosition>): void {
    this.positions = positions;
  }

  setCalibration(cal: SongCalibration): void {
    this.calibration = cal;
  }

  clearCalibration(): void {
    this.calibration = null;
  }

  getCalibration(): SongCalibration | null {
    return this.calibration;
  }

  setMuted(muted: boolean): void {
    if (this.masterGainNode && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGainNode.gain.setTargetAtTime(muted ? 0 : 0.8, now, 0.05);
    }
  }

  setAccompanimentVolume(vol: number): void {
    this.accompVolume = clamp(vol, 0, 1);
    if (this.generatedBus) {
      this.generatedBus.gain.value = this.accompVolume;
    }
  }

  setStemVolume(vol: number): void {
    this.stemVolume = clamp(vol, 0, 1);
    if (this.stemBus) {
      this.stemBus.gain.value = this.stemVolume;
    }
  }

  setChordOffset(offset: number): void {
    this.chordOffset = offset;
  }

  getChordOffset(): number {
    return this.chordOffset;
  }

  setBpmAdjust(delta: number): void {
    this.bpmAdjust = delta;
    if (!this.song) return;
    const effectiveBpm = this.song.bpm + delta;

    // Update Tone.Transport BPM
    Tone.getTransport().bpm.value = effectiveBpm;

    for (const [role, voice] of this.voices) {
      if (role === 'green' && 'setBpm' in voice) {
        (voice as MelodicVoice).setBpm(effectiveBpm);
      }
      if (role === 'yellow' && 'setBpm' in voice) {
        (voice as ArpeggioVoice).setBpm(effectiveBpm);
      }
      if (role === 'orange' && 'setBpm' in voice) {
        (voice as BassSynthVoice).setBpm(effectiveBpm);
      }
    }
  }

  getBpmAdjust(): number {
    return this.bpmAdjust;
  }

  // ---- Continuous Backing API ----

  setContinuousBackingEnabled(enabled: boolean): void {
    this.continuousBackingEnabled = enabled;
    if (this.stemMixerVoice) {
      this.stemMixerVoice.setContinuousBacking(enabled, this.continuousBackingLevel);
    }
  }

  getContinuousBackingEnabled(): boolean {
    return this.continuousBackingEnabled;
  }

  setContinuousBackingLevel(level: number): void {
    this.continuousBackingLevel = clamp(level, 0, 1);
    if (this.stemMixerVoice) {
      this.stemMixerVoice.setContinuousBacking(this.continuousBackingEnabled, this.continuousBackingLevel);
    }
  }

  getContinuousBackingLevel(): number {
    return this.continuousBackingLevel;
  }

  // ---- Voice instrument presets ----

  setVoicePreset(role: ColorRole, preset: string): void {
    this.voicePresets.set(role, preset);
    // Only forward to the live voice if the role is currently in
    // parameter mode — instrument-mode voices use a different preset
    // catalog (the instrument palette) and would reject this key.
    if (this.batonModes.get(role) !== 'instrument') {
      this.voices.get(role)?.setPreset(preset);
    }
  }

  getVoicePreset(role: ColorRole): string {
    return this.voicePresets.get(role) ?? '';
  }

  // ---- Per-baton mode + instrument ----

  /**
   * Switch a baton between parameter mode and instrument mode.
   *
   * Blue (stem mixer) is rejected — it has no equivalent instrument
   * behaviour.  If a song is already loaded, the existing voice for the
   * role is disposed and replaced in place; if no song is loaded, the
   * new mode takes effect on the next buildVoices() call (after
   * loadSong).
   */
  setBatonMode(role: ColorRole, mode: BatonMode): void {
    if (role === 'blue') return;
    if (this.batonModes.get(role) === mode) return;
    this.batonModes.set(role, mode);
    this.swapVoice(role);
  }

  getBatonMode(role: ColorRole): BatonMode {
    return this.batonModes.get(role) ?? 'parameter';
  }

  /**
   * Set the instrument-palette key for a baton.  Takes effect
   * immediately if the role is currently in instrument mode; otherwise
   * it's stored and applied the next time the mode flips to instrument.
   */
  setBatonInstrument(role: ColorRole, instrumentKey: string): void {
    if (role === 'blue') return;
    if (!INSTRUMENT_PALETTE_BY_KEY[instrumentKey]) return;
    this.batonInstruments.set(role, instrumentKey);
    const currentMode = this.batonModes.get(role);
    if (currentMode === 'instrument') {
      const voice = this.voices.get(role);
      if (voice instanceof InstrumentVoice) {
        voice.setPreset(instrumentKey);
      }
    } else if (currentMode === 'harmonizer' && role === 'green') {
      // HarmonyVoice consumes the same batonInstruments map; swap its
      // active player to match without rebuilding the voice.
      const voice = this.voices.get(role);
      if (voice instanceof HarmonyVoice) {
        voice.setPreset(instrumentKey);
      }
    } else if (currentMode === 'walk') {
      // WalkVoice shares the instrument palette with instrument and
      // harmonizer modes; swap its player without rebuilding the voice.
      const voice = this.voices.get(role);
      if (voice instanceof WalkVoice) {
        voice.setPreset(instrumentKey);
      }
    }
  }

  getBatonInstrument(role: ColorRole): string {
    return this.batonInstruments.get(role) ?? DEFAULT_INSTRUMENT_KEY;
  }

  /**
   * Bulk-apply baton assignments — used at session start when restoring
   * from the profile.  Each entry is applied via setBatonMode /
   * setBatonInstrument so any active voices swap correctly.
   */
  applyBatonAssignments(
    assignments: Partial<Record<ColorRole, BatonAssignment>>,
  ): void {
    for (const [role, assignment] of Object.entries(assignments)) {
      if (!assignment) continue;
      if (role === 'blue') continue;
      const r = role as ColorRole;
      this.batonInstruments.set(r, assignment.instrumentKey);
      // Set mode last so the swap (if any) picks up the new instrument.
      this.setBatonMode(r, assignment.mode);
    }
  }

  // ---- Sidechain ducking (called by voices) ----

  triggerSidechain(): void {
    if (!this.sidechainGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.sidechainGain.gain.cancelScheduledValues(now);
    this.sidechainGain.gain.setValueAtTime(SIDECHAIN_DEPTH, now);
    this.sidechainGain.gain.setTargetAtTime(1.0, now + 0.05, SIDECHAIN_RECOVERY);
  }

  // ---- Tap chord mark ----

  tapChordMark(): void {
    const t = this.getCurrentTime();
    this.tappedChordTimes.push(t);
    console.log(`[SongPresetEngine] Chord tap at ${t.toFixed(3)}s (${this.tappedChordTimes.length} marks)`);
  }

  getTappedChordTimes(): number[] {
    return [...this.tappedChordTimes];
  }

  clearTappedChordTimes(): void {
    this.tappedChordTimes = [];
  }

  getCurrentTime(): number {
    if (!this.ctx || !this.isPlayingState || this.isPausedState) {
      return this.playbackOffset;
    }
    const elapsed = this.ctx.currentTime - this.playbackStartTime;
    return this.playbackOffset + elapsed;
  }

  getStatus(): SongPresetStatus {
    const currentTime = this.getCurrentTime();
    const beats = this.song?.beats;
    let currentBeatIndex = -1;
    if (beats && beats.length > 0) {
      let lo = 0, hi = beats.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        if (beats[mid] <= currentTime) {
          currentBeatIndex = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
    }

    return {
      isPlaying: this.isPlayingState,
      isPaused: this.isPausedState,
      currentTime,
      duration: this.duration,
      loopEnabled: this.loopEnabled,
      loopStart: this.loopStart,
      loopEnd: this.loopEnd,
      stemsLoaded: this.stemsLoaded,
      stemsTotal: this.stemsTotal,
      loadingComplete: this.stemsLoaded === this.stemsTotal && this.stemsTotal > 0,
      stemVolumes: this.stemMixerVoice?.getStemVolumes() ?? {},
      filterHz: this.stemMixerVoice?.getFilterHz() ?? 0,
      reverbWet: this.currentReverbWet,
      distance: this.currentDistance,
      stemMixerZone: this.stemMixerVoice?.getZone() ?? null,
      activeColors: [...this.activeRoles],
      currentChordName: this.currentChord?.name ?? null,
      accompVolume: this.accompVolume,
      stemVolume: this.stemVolume,
      chordOffset: this.chordOffset,
      bpmAdjust: this.bpmAdjust,
      effectiveBpm: (this.song?.bpm ?? 67) + this.bpmAdjust,
      currentBeatIndex,
      totalBeats: beats?.length ?? 0,
      hasAnalysis: !!(beats && beats.length > 0),
      continuousBackingEnabled: this.continuousBackingEnabled,
      continuousBackingLevel: this.continuousBackingLevel,
      voicePresets: Object.fromEntries(this.voicePresets),
      batonModes: Object.fromEntries(this.batonModes),
      batonInstruments: Object.fromEntries(this.batonInstruments),
      beatSnap: this.beatSnap,
      currentChordRoot: this.currentChord?.root ?? null,
    };
  }

  getSong(): SongConfig | null {
    return this.song;
  }

  isLoaded(): boolean {
    return this.stemsLoaded === this.stemsTotal && this.stemsTotal > 0;
  }

  dispose(): void {
    this.stopPlayback();
    this.disposeAudio();
    console.log('[SongPresetEngine] Disposed');
  }

  // ---- Audio graph construction ----

  private buildRouting(): void {
    const ctx = this.ctx!;

    // Master output gain → shared studio MasterChain → destination.
    this.masterGainNode = ctx.createGain();
    this.masterGainNode.gain.value = 0.8;
    this.masterChain = new MasterChain(ctx);
    this.masterGainNode.connect(this.masterChain.input);

    // Dry mix (stems + generated voices merge here)
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;
    this.dryGain.connect(this.masterGainNode);

    // Stem submix: stemBus → sidechainGain → dryGain
    this.stemBus = ctx.createGain();
    this.stemBus.gain.value = this.stemVolume;
    this.sidechainGain = ctx.createGain();
    this.sidechainGain.gain.value = 1;
    this.stemBus.connect(this.sidechainGain);
    this.sidechainGain.connect(this.dryGain);

    // Generated voice submix
    this.generatedBus = ctx.createGain();
    this.generatedBus.gain.value = this.accompVolume;
    this.generatedBus.connect(this.dryGain);

    // Shared Tone.Reverb — single instance avoids distortion from multiple reverbs
    this.reverb = new Tone.Reverb({ decay: 3, wet: 1 });
    this.reverbWetGain = ctx.createGain();
    this.reverbWetGain.gain.value = 1;
    // Tone.Reverb → raw GainNode (Tone accepts AudioNode as connect destination)
    this.reverb.connect(this.reverbWetGain);
    this.reverbWetGain.connect(this.masterGainNode);

    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0;
    // raw GainNode → Tone.Reverb via Tone.connect bridge
    Tone.connect(this.reverbSend, this.reverb);

    // Send both submixes to reverb
    this.stemBus.connect(this.reverbSend);
    this.generatedBus.connect(this.reverbSend);
  }

  private buildVoices(): void {
    if (!this.ctx || !this.song) return;

    // Build StemGainRef map — stem gainNodes are raw Web Audio, connected into Tone graph
    const stemRefs = new Map<string, StemGainRef>();
    for (const [id, stem] of this.stems) {
      stemRefs.set(id, {
        id,
        gainNode: stem.gainNode,
        currentGain: 0,
        targetGain: 0,
      });
    }

    // Blue: Stem Mixer (not mode-switchable)
    const stemMixer = new StemMixerVoice(this.ctx!, stemRefs, this.song.stemMixer);
    stemMixer.setContinuousBacking(this.continuousBackingEnabled, this.continuousBackingLevel);
    stemMixer.connect(this.stemBus!);
    this.stemMixerVoice = stemMixer;
    this.voices.set('blue', stemMixer);

    // Only create generated voices if we have a chord progression.
    // Each generative role's voice is chosen by the per-baton mode
    // (parameter or instrument) — see createVoiceForRole.
    if (this.song.chordProgression && this.song.chordProgression.length > 0) {
      for (const role of ['red', 'green', 'yellow', 'orange'] as const) {
        const voice = this.createVoiceForRole(role);
        if (voice) {
          this.voices.set(role, voice);
        }
      }
    }
  }

  /**
   * Construct (or rebuild) the voice for a single generative role
   * according to its current mode + assignment.
   *
   * Connection to generatedBus, sidechain wiring, beat-timestamp
   * injection, and stem-bass-gain callback are all applied here so
   * callers (buildVoices / swapVoice) don't need to know the per-role
   * differences.
   */
  private createVoiceForRole(role: ColorRole): ToneVoiceBase | null {
    if (!this.ctx || !this.song) return null;
    if (role === 'blue') return null;

    const mode = this.batonModes.get(role) ?? 'parameter';
    let voice: ToneVoiceBase;
    if (mode === 'instrument') {
      voice = this.createInstrumentVoice(role);
    } else if (mode === 'harmonizer' && role === 'green') {
      voice = this.createHarmonyVoice();
    } else if (mode === 'walk') {
      voice = this.createWalkVoice(role);
    } else {
      voice = this.createParameterVoice(role);
    }

    voice.connect(this.generatedBus!);
    return voice;
  }

  private createHarmonyVoice(): HarmonyVoice {
    const voice = new HarmonyVoice(this.ctx!);
    voice.onNoteTrigger = () => this.triggerSidechain();
    voice.setHarmony(this.song?.harmony ?? []);
    // Use the green baton's currently-selected instrument as the harmoniser's
    // sound source. Same persistence map as instrument mode, so toggling
    // between Instr and Harm preserves the instrument choice.
    const instrumentKey =
      this.batonInstruments.get('green') ?? DEFAULT_INSTRUMENT_KEY;
    voice.setPreset(instrumentKey);
    return voice;
  }

  private createInstrumentVoice(role: ColorRole): InstrumentVoice {
    const instrumentKey =
      this.batonInstruments.get(role) ?? DEFAULT_INSTRUMENT_KEY;
    const voice = new InstrumentVoice(this.ctx!, instrumentKey);
    // Instrument-mode notes feed the same sidechain ducking as the
    // parameter-mode voices that trigger discrete notes (pad, melody).
    voice.onNoteTrigger = () => this.triggerSidechain();
    // Hand the voice the song's beat grid + apply the current beat-snap
    // toggle.  The grid stays live for the voice's lifetime; toggling
    // beatSnap on/off doesn't need to re-supply the timestamps.
    if (this.song?.beats && this.song.beats.length > 0) {
      voice.setBeatTimestamps(this.song.beats);
    }
    voice.setBeatSnap(this.beatSnap);
    return voice;
  }

  /**
   * Build a WalkVoice for the given role using the per-baton instrument
   * map. Walk uses the same `batonInstruments` storage as instrument and
   * harmonizer modes, so toggling between them preserves the user's
   * instrument choice. The song's beat grid is wired in immediately
   * since walk triggers only on beat arrival.
   *
   * WalkVoice is inherently beat-locked and has no setBeatSnap method —
   * the engine's beatSnap flag is irrelevant here (setBeatSnap iterates
   * voices and skips anything that isn't an InstrumentVoice).
   */
  private createWalkVoice(role: ColorRole): WalkVoice {
    const instrumentKey =
      this.batonInstruments.get(role) ?? DEFAULT_INSTRUMENT_KEY;
    const voice = new WalkVoice(this.ctx!, instrumentKey);
    voice.onNoteTrigger = () => this.triggerSidechain();
    if (this.song?.beats && this.song.beats.length > 0) {
      voice.setBeatTimestamps(this.song.beats);
    }
    voice.setTriggerThreshold(this.stillnessThreshold);
    return voice;
  }

  /**
   * Build the role's parameter-mode voice with all the role-specific
   * wiring (sidechain hooks, beat timestamps, stem-bass callback).
   */
  private createParameterVoice(role: ColorRole): ToneVoiceBase {
    const ctx = this.ctx!;
    const song = this.song!;
    const sidechainTrigger = () => this.triggerSidechain();

    switch (role) {
      case 'red': {
        const padVoice = new ChordPadVoice(ctx);
        padVoice.setPreset(this.voicePresets.get('red') ?? 'rhodesEP');
        padVoice.onNoteTrigger = sidechainTrigger;
        return padVoice;
      }
      case 'green': {
        const melodyVoice = new MelodicVoice(ctx, song.bpm);
        melodyVoice.setPreset(this.voicePresets.get('green') ?? 'clarinet');
        melodyVoice.onNoteTrigger = sidechainTrigger;
        if (song.beats && song.beats.length > 0) {
          melodyVoice.setBeatTimestamps(song.beats);
        }
        // Track the live melodic voice reference used by restart logic
        this.melodicVoice = melodyVoice;
        return melodyVoice;
      }
      case 'yellow': {
        const arpVoice = new ArpeggioVoice(ctx, song.bpm);
        arpVoice.setPreset(this.voicePresets.get('yellow') ?? 'nylonGuitar');
        return arpVoice;
      }
      case 'orange': {
        const bassVoice = new BassSynthVoice(ctx, song.bpm);
        bassVoice.setPreset(this.voicePresets.get('orange') ?? 'upright');
        bassVoice.setStemBassGainCallback(
          () => this.stemMixerVoice?.getStemGain('bass') ?? 0,
        );
        return bassVoice;
      }
      default:
        // Blue is filtered out by the caller — but keep TypeScript happy.
        throw new Error(`[SongPresetEngine] No parameter voice for role: ${role}`);
    }
  }

  /**
   * Swap the voice for a single role (called when mode changes
   * mid-session).  Disposes the existing voice, then constructs and
   * connects its replacement.  If there's no audio context yet (song
   * not loaded), the new mode is just stored and applied later by
   * buildVoices().
   */
  private swapVoice(role: ColorRole): void {
    if (!this.ctx) return;
    if (role === 'blue') return;

    const old = this.voices.get(role);
    if (old) {
      // Clear the melodicVoice reference if we're disposing it — the
      // createParameterVoice('green') path will re-set it if green
      // returns to parameter mode.
      if (old === this.melodicVoice) {
        this.melodicVoice = null;
      }
      old.disconnect();
      old.dispose();
      this.voices.delete(role);
    }

    // No chord progression → no generative voices at all.
    if (!this.song?.chordProgression || this.song.chordProgression.length === 0) {
      return;
    }

    const next = this.createVoiceForRole(role);
    if (next) {
      this.voices.set(role, next);
    }
  }

  // ---- Source lifecycle (raw Web Audio for stems) ----

  private createAndStartSources(offsetSeconds: number): void {
    if (!this.ctx) return;

    const startTime = this.ctx.currentTime + 0.05;
    this.playbackStartTime = startTime;

    for (const stem of this.stems.values()) {
      const source = this.ctx.createBufferSource();
      source.buffer = stem.buffer;
      source.connect(stem.gainNode);

      source.onended = () => {
        if (stem.sourceNode === source) {
          stem.sourceNode = null;
        }
      };

      stem.sourceNode = source;
      source.start(startTime, offsetSeconds);
    }
  }

  private stopSources(): void {
    for (const stem of this.stems.values()) {
      if (stem.sourceNode) {
        try { stem.sourceNode.stop(); } catch { /* Already stopped */ }
        stem.sourceNode.disconnect();
        stem.sourceNode = null;
      }
    }
  }

  // ---- Per-frame update ----

  private scheduleUpdate(): void {
    if (!this.isPlayingState || this.isPausedState) return;
    this.animFrameId = requestAnimationFrame(() => {
      this.update();
      this.scheduleUpdate();
    });
  }

  private cancelUpdate(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private update(): void {
    if (!this.song || !this.ctx) return;

    // Check for end of song / loop
    const currentTime = this.getCurrentTime();
    // Stash so processFaceLandmarks (called from screen layer, no
    // playback-time arg) can compute beat-snap targets.
    this.lastUpdateTime = currentTime;
    // Flush any pending head-bop whose target beat has now arrived.
    if (this.headBopPending && currentTime >= this.headBopPending.targetTime) {
      this.headBopKit?.play(this.headBopPending.drum, this.headBopPending.velocity);
      this.headBopPending = null;
    }
    const effectiveEnd = this.loopEnd > 0 ? this.loopEnd : this.duration;

    if (currentTime >= effectiveEnd) {
      if (this.loopEnabled) {
        this.stopSources();
        this.playbackOffset = this.loopStart;
        this.createAndStartSources(this.loopStart);
        // Reset Transport position
        Tone.getTransport().seconds = this.loopStart;
        // Reset melody quantizer reference
        if (this.melodicVoice) {
          this.melodicVoice.setReferenceTime(this.loopStart);
        }
        this.lastDownbeatIndex = -1;
        this.resetPendingChord();
        for (const voice of this.voices.values()) {
          voice.onTransportStop();
          voice.onTransportStart();
        }
      } else {
        this.stopPlayback();
        return;
      }
    }

    // Compute velocity and update stillness gates for each color role
    // (must run BEFORE updateActiveRoles so the gate's isMuted flag is current)
    this.updateVelocities(Date.now());

    // Determine active colors (first 2 found and not gated, in priority order)
    this.updateActiveRoles();

    // Look up current chord — quantise to the beat NEAREST the chord's
    // analysis-listed change time (mapped back into playback time with
    // chordOffset), not the next beat after the current frame.  Using
    // the chord's own change time means a chord change slightly before
    // a beat snaps forward to that beat, and a chord change slightly
    // after a beat applies immediately rather than waiting an entire
    // beat for the *next* one — closing the "lands slightly off the
    // beat" issue from Session 5.
    if (this.song.chordProgression && this.song.chordProgression.length > 0) {
      const chordTime = currentTime - this.chordOffset;
      const candidateChord = getChordAtTime(this.song.chordProgression, chordTime);

      if (candidateChord && candidateChord.name !== this.lastAppliedChordName) {
        // candidateChord.time is in analysis-space; shift back into
        // playback-space the same way chordTime was shifted.
        const chordEventPlaybackTime = candidateChord.time + this.chordOffset;
        const nearestBeat = this.getNearestBeatTime(chordEventPlaybackTime);
        const bpm = this.song.bpm > 0 ? this.song.bpm : 0;
        const beatDurationMs = bpm > 0 ? (60 / bpm) * 1000 : 500;
        const beatDurationSec = beatDurationMs / 1000;

        if (nearestBeat !== null && nearestBeat > currentTime && nearestBeat - currentTime <= beatDurationSec) {
          // Nearest beat is still in the future and within a beat away
          // — defer until that beat so the chord lands on it.
          this.pendingChord = candidateChord;
          this.pendingChordBeat = nearestBeat;
        } else {
          // No beat data, or next beat too far away — apply immediately
          // to prevent perceptible drift / silent fallback.
          this.currentChord = candidateChord;
          this.lastAppliedChordName = candidateChord.name;
          this.pendingChord = null;
        }
      }

      // Apply a pending chord once playback crosses its target beat
      if (this.pendingChord !== null && currentTime >= this.pendingChordBeat) {
        this.currentChord = this.pendingChord;
        this.lastAppliedChordName = this.pendingChord.name;
        this.pendingChord = null;
      }
    }

    // Update all voices
    for (const [role, voice] of this.voices) {
      const pos = this.positions.get(role);

      let x = pos?.x ?? 0.5;
      let y = pos?.y ?? 0.5;
      const found = pos?.found ?? false;

      if (this.calibration && this.calibration[role] && found) {
        const cal = this.calibration[role];
        x = applyCalibration(x, cal.minX, cal.maxX);
        y = applyCalibration(y, cal.minY, cal.maxY);
      }

      const vel = this.velocityState.get(role)?.smoothVel ?? 0;

      voice.setActive(this.activeRoles.includes(role));
      voice.setPosition(x, y);
      voice.setVelocity(vel);
      voice.updateFade();
      voice.update(currentTime, this.currentChord, vel);
    }

    // Update reverb (distance between the 2 active objects)
    this.updateReverb();

    // Beat pulse on downbeats
    this.updateBeatPulse(currentTime);
  }

  private updateActiveRoles(): void {
    const found: ColorRole[] = [];
    for (const role of ROLE_PRIORITY) {
      const pos = this.positions.get(role);
      const roleState = this.velocityState.get(role);
      if (pos?.found && !roleState?.isMuted) {
        found.push(role);
        if (found.length >= 2) break;
      }
    }
    this.activeRoles = found;
  }

  private updateVelocities(nowMs: number): void {
    for (const role of ROLE_PRIORITY) {
      const pos = this.positions.get(role);
      let state = this.velocityState.get(role);

      if (!state) {
        state = {
          prevX: pos?.x ?? 0.5,
          prevY: pos?.y ?? 0.5,
          smoothVel: 0,
          stillSince: null,
          motionSince: null,
          // Start muted so a baton entering frame for the first time must
          // demonstrate motion (or zero onset-debounce) before producing
          // sound — otherwise a brand-new tracked centroid sounds a note
          // on the first frame, which sounds like a pop on pick-up.
          isMuted: true,
        };
        this.velocityState.set(role, state);
      }

      if (pos?.found) {
        const dx = pos.x - state.prevX;
        const dy = pos.y - state.prevY;
        const rawVel = Math.sqrt(dx * dx + dy * dy);
        // Normalize: ~0.02 per frame at moderate speed → map to 0-1
        const normalizedVel = clamp(rawVel * 15, 0, 1);
        state.smoothVel = lerp(state.smoothVel, normalizedVel, 0.15);
        state.prevX = pos.x;
        state.prevY = pos.y;
      } else {
        // Decay velocity when object not found
        state.smoothVel = lerp(state.smoothVel, 0, 0.3);
      }

      // Stillness gate: mute roles whose smoothed velocity has been below
      // threshold for the full hysteresis window.  On the un-mute side,
      // require `onsetDebounceMs` of sustained motion above threshold
      // before activating — this debounces the pick-up centroid spike so
      // setting a baton down and picking it back up doesn't spray notes.
      if (state.smoothVel < this.stillnessThreshold) {
        state.motionSince = null;
        if (state.stillSince === null) {
          state.stillSince = nowMs;
        } else if (nowMs - state.stillSince >= this.stillnessHysteresisMs) {
          state.isMuted = true;
        }
      } else {
        state.stillSince = null;
        if (this.onsetDebounceMs <= 0) {
          state.isMuted = false;
        } else if (state.motionSince === null) {
          state.motionSince = nowMs;
        } else if (nowMs - state.motionSince >= this.onsetDebounceMs) {
          state.isMuted = false;
        }
      }
    }
  }

  // ---- Stillness gate tuning (called by DebugPanel / facilitator UI) ----

  /**
   * Set the smoothed-velocity threshold below which a baton is treated
   * as still.  Lower values pick up smaller intentional movements but
   * also pick up more environmental noise / tremor.
   */
  setStillnessThreshold(value: number): void {
    this.stillnessThreshold = clamp(value, 0, 1);
    // Walk voices snapshot the threshold at construction; forward live
    // changes so facilitator tweaks mid-session apply without needing to
    // toggle the baton mode.
    for (const voice of this.voices.values()) {
      if (voice instanceof WalkVoice) {
        voice.setTriggerThreshold(this.stillnessThreshold);
      }
    }
  }

  /**
   * Set how long (ms) a baton must remain below the still threshold
   * before its voice is gated off.
   */
  setStillnessHysteresisMs(ms: number): void {
    this.stillnessHysteresisMs = Math.max(0, ms);
  }

  /**
   * Set how long (ms) sustained motion above threshold is required
   * before a gated baton un-mutes.  Set to 0 to disable onset
   * debouncing (un-mute on the first motion frame).
   */
  setOnsetDebounceMs(ms: number): void {
    this.onsetDebounceMs = Math.max(0, ms);
  }

  getStillnessThreshold(): number { return this.stillnessThreshold; }
  getStillnessHysteresisMs(): number { return this.stillnessHysteresisMs; }
  getOnsetDebounceMs(): number { return this.onsetDebounceMs; }

  // ---- Beat Bopping (Change ID 7) ----

  /**
   * Toggle beat-snap mode for all instrument-mode voices.  Cheap to
   * call every frame — voices only react to the change.  No effect on
   * parameter-mode voices (which already produce beat-locked output by
   * their own internal logic) or on walk-mode voices (walk is
   * intrinsically beat-locked — every walk note fires only on beat
   * arrival).
   */
  setBeatSnap(enabled: boolean): void {
    if (this.beatSnap === enabled) return;
    this.beatSnap = enabled;
    for (const voice of this.voices.values()) {
      if (voice instanceof InstrumentVoice) {
        voice.setBeatSnap(enabled);
      }
    }
  }

  isBeatSnap(): boolean {
    return this.beatSnap;
  }

  // ---- Head Bopping (Change ID 6) ----

  /**
   * Enable or disable the head-bop drum channel.  When enabled and
   * the screen layer is calling processFaceLandmarks, each detected
   * downward-then-upward head bop fires a drum hit (kick / snare /
   * kick+crash depending on beat position in the bar).  Bop amplitude
   * scales velocity.  Beat-snapped if beatSnap is on.
   */
  setHeadBopEnabled(enabled: boolean): void {
    this.headBopEnabled = enabled;
    if (!enabled) {
      this.headBopPending = null;
      this.headBopDetector.reset();
    } else if (!this.headBopKit) {
      this.headBopKit = new HeadBopKit();
    }
  }

  isHeadBopEnabled(): boolean {
    return this.headBopEnabled;
  }

  /**
   * Tune the head-bop sensitivity.  Lower minDownExcursion catches
   * subtler bops at the cost of accepting more involuntary motion.
   */
  setHeadBopSensitivity(minDownExcursion: number, cooldownMs: number): void {
    this.headBopDetector.setConfig(minDownExcursion, cooldownMs);
  }

  /**
   * Feed face landmarks from the screen layer.  Pulled out of update()
   * so the engine doesn't need to know how face tracking is wired in
   * the host screen — SongPresetScreen owns its own FaceDetector and
   * pushes results here on each frame.
   *
   * Idempotent / cheap: returns early if head-bop is disabled or if
   * landmarks are missing.  The Y value comes from a single landmark
   * (nose tip by default) which is more stable than averaging a region.
   */
  processFaceLandmarks(landmarks: FaceLandmarks | null, timestampMs: number): void {
    if (!this.headBopEnabled || !landmarks) return;
    const lm = landmarks.landmarks[this.headBopLandmarkIndex];
    if (!lm) return;

    if (this.headBopDetector.step(lm.y, timestampMs)) {
      this.triggerHeadBop();
    }
  }

  /**
   * Fire a head-bop drum event.  Picks the drum based on which beat
   * of the bar the bop hits (downbeat → kick + crash; backbeat →
   * snare; other → kick), and scales velocity from the bop's descent
   * amplitude (clamped to a sensible max).
   *
   * Honours the beat-snap toggle: when on, the drum is deferred to
   * the next beat in the song's beat grid; when off, plays
   * immediately and uses the current playback time to pick the drum.
   */
  private triggerHeadBop(): void {
    if (!this.headBopKit) {
      this.headBopKit = new HeadBopKit();
    }

    const amplitude = this.headBopDetector.getLastBopAmplitude();
    const velocity = clamp(amplitude / this.HEADBOP_AMPLITUDE_FOR_FULL_VELOCITY, 0, 1);

    const beats = this.song?.beats;
    const downbeats = this.song?.downbeats;

    if (this.beatSnap && beats && beats.length > 0) {
      const targetTime = nextBeatAfter(beats, this.lastUpdateTime);
      const drum = pickHeadBopDrum(targetTime, beats, downbeats);
      this.headBopPending = { targetTime, drum, velocity };
    } else {
      // No beat snap — pick from the current playback time, fire now.
      const drum = pickHeadBopDrum(this.lastUpdateTime, beats, downbeats);
      this.headBopKit.play(drum, velocity);
    }
  }

  /**
   * Return the beat timestamp closest to `targetTime` — either before
   * or after.  Used for chord-quantisation against the chord's actual
   * change time rather than the moment we detected the change.
   *
   * Null when the song has no beat data.
   */
  private getNearestBeatTime(targetTime: number): number | null {
    return findNearestBeat(this.song?.beats, targetTime);
  }

  private updateReverb(): void {
    if (!this.reverbSend || !this.dryGain) return;

    if (this.activeRoles.length >= 2) {
      const p1 = this.positions.get(this.activeRoles[0]);
      const p2 = this.positions.get(this.activeRoles[1]);
      if (p1?.found && p2?.found) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const normDist = clamp(dist / Math.SQRT2, 0, 1);

        this.currentDistance = normDist;
        const targetWet = clamp(1 - normDist, 0, 0.85);
        this.currentReverbWet = lerp(this.currentReverbWet, targetWet, REVERB_LERP);
      } else {
        this.currentReverbWet = lerp(this.currentReverbWet, 0, REVERB_LERP);
        this.currentDistance = 1;
      }
    } else {
      this.currentReverbWet = lerp(this.currentReverbWet, 0, REVERB_LERP);
      this.currentDistance = 1;
    }

    this.reverbSend.gain.value = this.currentReverbWet;
    this.dryGain.gain.value = 1 - this.currentReverbWet * 0.5;
  }

  private updateBeatPulse(currentTime: number): void {
    const downbeats = this.song?.downbeats;
    if (!downbeats || downbeats.length === 0 || !this.masterGainNode) return;

    // Find current downbeat index
    let dbIndex = -1;
    let lo = 0, hi = downbeats.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (downbeats[mid] <= currentTime) {
        dbIndex = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    if (dbIndex !== this.lastDownbeatIndex && dbIndex >= 0) {
      this.lastDownbeatIndex = dbIndex;
      // Subtle volume bump on downbeat
      const now = this.ctx!.currentTime;
      const bumpGain = 0.8 * Math.pow(10, BEAT_PULSE_DB / 20);
      this.masterGainNode.gain.cancelScheduledValues(now);
      this.masterGainNode.gain.setValueAtTime(bumpGain, now);
      this.masterGainNode.gain.setTargetAtTime(0.8, now + BEAT_PULSE_MS / 1000, 0.02);
    }
  }

  // ---- Cleanup ----

  private disposeAudio(): void {
    this.cancelUpdate();

    // Dispose voices
    for (const voice of this.voices.values()) {
      voice.dispose();
    }
    this.voices.clear();
    this.stemMixerVoice = null;
    this.melodicVoice = null;

    // Tear down the head-bop kit — lazy-built, so may be null if the
    // user never enabled head bopping this session.
    this.headBopKit?.dispose();
    this.headBopKit = null;

    // Stop and disconnect stems
    for (const stem of this.stems.values()) {
      if (stem.sourceNode) {
        try { stem.sourceNode.stop(); } catch { /* noop */ }
        stem.sourceNode.disconnect();
      }
      stem.gainNode.disconnect();
    }
    this.stems.clear();

    // Disconnect raw GainNodes; dispose Tone.Reverb (singleton-safe)
    this.reverbSend?.disconnect();
    this.reverb?.dispose();
    this.reverbWetGain?.disconnect();
    this.sidechainGain?.disconnect();
    this.stemBus?.disconnect();
    this.generatedBus?.disconnect();
    this.dryGain?.disconnect();
    this.masterGainNode?.disconnect();
    this.masterChain?.dispose();

    this.reverbSend = null;
    this.reverb = null;
    this.reverbWetGain = null;
    this.sidechainGain = null;
    this.stemBus = null;
    this.generatedBus = null;
    this.dryGain = null;
    this.masterGainNode = null;
    this.masterChain = null;

    // Stop Transport but don't dispose it (singleton)
    Tone.getTransport().stop();
    Tone.getTransport().cancel();

    this.stemsLoaded = 0;
    this.stemsTotal = 0;
    this.duration = 0;
    this.playbackOffset = 0;
    this.currentChord = null;
    this.resetPendingChord();
    this.activeRoles = [];
    this.velocityState.clear();
    this.lastDownbeatIndex = -1;
  }
}
