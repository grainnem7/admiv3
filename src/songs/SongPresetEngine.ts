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
import { ArpeggioVoice } from './voices/ArpeggioVoice';
import { BassSynthVoice } from './voices/BassSynthVoice';
import { loadSongAnalysis } from './analysisLoader';

// ============================================
// Types
// ============================================

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
}

// ============================================
// Utility
// ============================================

function applyCalibration(raw: number, min: number, max: number): number {
  if (max <= min) return 0.5;
  return clamp((raw - min) / (max - min), 0, 1);
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

  // Reverb state
  private currentReverbWet = 0;
  private currentDistance = 1;

  // Volume controls
  private accompVolume = 1.0;
  private stemVolume = 1.0;

  // Continuous backing
  private continuousBackingEnabled = true;
  private continuousBackingLevel = 0.4;

  // Voice instrument presets (persist across song loads)
  private voicePresets: Map<ColorRole, string> = new Map([
    ['red',    'rhodesEP'],     // was 'warmPad'
    ['green',  'clarinet'],     // was 'bell'
    ['yellow', 'nylonGuitar'],  // was 'sparkle'
    ['orange', 'upright'],      // was 'sub'
  ]);

  // Velocity tracking
  private velocityState: Map<ColorRole, VelocityState> = new Map();

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

    // Load all stems (raw AudioBufferSourceNode for simplicity)
    const loadPromises = stemIds.map(async (stemId) => {
      const url = song.stems[stemId];
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx!.decodeAudioData(arrayBuffer);

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

      this.stemsLoaded++;
      this.onLoadProgress?.(this.stemsLoaded, this.stemsTotal);
    });

    await Promise.all(loadPromises);

    // Load AI analysis data if available
    if (song.analysisUrl) {
      try {
        const analysis = await loadSongAnalysis(song.analysisUrl);
        song.chordProgression = analysis.chordProgression;
        song.beats = analysis.beats;
        song.downbeats = analysis.downbeats;
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

    Tone.getTransport().stop();
    Tone.getTransport().cancel();

    for (const voice of this.voices.values()) {
      voice.onTransportStop();
    }

    console.log('[SongPresetEngine] Stopped');
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
    this.voices.get(role)?.setPreset(preset);
  }

  getVoicePreset(role: ColorRole): string {
    return this.voicePresets.get(role) ?? '';
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

    // Master output gain → destination (no compressor/limiter — avoids distortion)
    this.masterGainNode = ctx.createGain();
    this.masterGainNode.gain.value = 0.8;
    this.masterGainNode.connect(ctx.destination);

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

    // Blue: Stem Mixer
    const stemMixer = new StemMixerVoice(this.ctx!, stemRefs, this.song.stemMixer);
    stemMixer.setContinuousBacking(this.continuousBackingEnabled, this.continuousBackingLevel);
    stemMixer.connect(this.stemBus!);
    this.stemMixerVoice = stemMixer;
    this.voices.set('blue', stemMixer);

    // Only create generated voices if we have a chord progression
    if (this.song.chordProgression && this.song.chordProgression.length > 0) {
      const sidechainTrigger = () => this.triggerSidechain();

      // Red: Chord Pad
      const padVoice = new ChordPadVoice(this.ctx!);
      padVoice.setPreset(this.voicePresets.get('red') ?? 'rhodesEP');
      padVoice.onNoteTrigger = sidechainTrigger;
      padVoice.connect(this.generatedBus!);
      this.voices.set('red', padVoice);

      // Green: Melodic Notes
      const melodyVoice = new MelodicVoice(this.ctx!, this.song.bpm);
      melodyVoice.setPreset(this.voicePresets.get('green') ?? 'clarinet');
      melodyVoice.onNoteTrigger = sidechainTrigger;
      if (this.song.beats && this.song.beats.length > 0) {
        melodyVoice.setBeatTimestamps(this.song.beats);
      }
      melodyVoice.connect(this.generatedBus!);
      this.melodicVoice = melodyVoice;
      this.voices.set('green', melodyVoice);

      // Yellow: Arpeggio
      const arpVoice = new ArpeggioVoice(this.ctx!, this.song.bpm);
      arpVoice.setPreset(this.voicePresets.get('yellow') ?? 'nylonGuitar');
      arpVoice.connect(this.generatedBus!);
      this.voices.set('yellow', arpVoice);

      // Orange: Bass Synth
      const bassVoice = new BassSynthVoice(this.ctx!, this.song.bpm);
      bassVoice.setPreset(this.voicePresets.get('orange') ?? 'upright');
      bassVoice.connect(this.generatedBus!);
      bassVoice.setStemBassGainCallback(() => this.stemMixerVoice?.getStemGain('bass') ?? 0);
      this.voices.set('orange', bassVoice);
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
        for (const voice of this.voices.values()) {
          voice.onTransportStop();
          voice.onTransportStart();
        }
      } else {
        this.stopPlayback();
        return;
      }
    }

    // Determine active colors (first 2 found, in priority order)
    this.updateActiveRoles();

    // Look up current chord
    if (this.song.chordProgression && this.song.chordProgression.length > 0) {
      const chordTime = currentTime - this.chordOffset;
      this.currentChord = getChordAtTime(this.song.chordProgression, chordTime);
    }

    // Compute velocity for each color role
    this.updateVelocities();

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
      if (pos?.found) {
        found.push(role);
        if (found.length >= 2) break;
      }
    }
    this.activeRoles = found;
  }

  private updateVelocities(): void {
    for (const role of ROLE_PRIORITY) {
      const pos = this.positions.get(role);
      let state = this.velocityState.get(role);

      if (!state) {
        state = { prevX: pos?.x ?? 0.5, prevY: pos?.y ?? 0.5, smoothVel: 0 };
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
    }
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

    this.reverbSend = null;
    this.reverb = null;
    this.reverbWetGain = null;
    this.sidechainGain = null;
    this.stemBus = null;
    this.generatedBus = null;
    this.dryGain = null;
    this.masterGainNode = null;

    // Stop Transport but don't dispose it (singleton)
    Tone.getTransport().stop();
    Tone.getTransport().cancel();

    this.stemsLoaded = 0;
    this.stemsTotal = 0;
    this.duration = 0;
    this.playbackOffset = 0;
    this.currentChord = null;
    this.activeRoles = [];
    this.velocityState.clear();
    this.lastDownbeatIndex = -1;
  }
}
