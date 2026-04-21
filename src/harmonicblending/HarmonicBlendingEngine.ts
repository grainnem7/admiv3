/**
 * HarmonicBlendingEngine - Two-voice harmonic blending with color tracking
 *
 * Each tracked color object controls an independent voice with three looping
 * audio sources. Horizontal position crossfades between zones (binary-target
 * + lerp at 0.1, matching the Harmonizer). Vertical position controls a
 * lowpass filter. Distance between objects controls shared reverb wet/dry.
 *
 * Supports both sample-based (Tone.Player) and oscillator-based (Tone.Oscillator)
 * sources. Default is Set 1 (Funky Blues CDN samples). Set 0 is oscillator fallback.
 *
 * Audio chain per voice:
 *   sourceLeft  ──┐
 *   sourceCenter──┼── GainNodes (crossfade) ── BiquadFilter (Y) ──┐
 *   sourceRight ──┘                                                │
 *                                                                  ├── dryGain ────────┐
 *                                                                  │                    ├── masterGain ── destination
 *                                                                  └── reverbSend ── reverb ┘
 */

import * as Tone from 'tone';

// ============================================
// Types
// ============================================

export interface VoicePosition {
  x: number;   // 0-1 normalised horizontal
  y: number;   // 0-1 normalised vertical
  found: boolean;
}

export interface HarmonicBlendingCalibration {
  voice1: { minX: number; maxX: number; minY: number; maxY: number };
  voice2: { minX: number; maxX: number; minY: number; maxY: number };
}

export interface BlendingStatus {
  voice1Zone: 'left' | 'center' | 'right' | null;
  voice2Zone: 'left' | 'center' | 'right' | null;
  voice1FilterHz: number;
  voice2FilterHz: number;
  reverbWet: number;
  distance: number;
  loadingState: 'idle' | 'loading' | 'ready' | 'error';
}

export interface SampleSetDef {
  id: string;
  name: string;
  /** URLs for voice samples. null = oscillator fallback. Both voices use same URLs when shared. */
  urls: { left: string; center: string; right: string } | null;
}

// ============================================
// A single audio source — either a Player or an Oscillator
// ============================================

interface AudioSource {
  node: Tone.Player | Tone.Oscillator;
  gain: Tone.Gain;
  tremolo?: Tone.Tremolo;
  kind: 'player' | 'oscillator';
}

interface VoiceState {
  sources: [AudioSource, AudioSource, AudioSource]; // left, center, right
  filter: Tone.BiquadFilter;
  voiceGain: Tone.Gain;
  volLeft: number;
  volCenter: number;
  volRight: number;
  filterCutoff: number;
  voiceLevel: number; // 0-1 for smooth fade in/out on detection
}

// ============================================
// Constants
// ============================================

const LEFT_THRESHOLD = 0.30;
const RIGHT_THRESHOLD = 0.70;

const CROSSFADE_LERP = 0.1;
const FILTER_LERP = 0.08;
const REVERB_LERP = 0.05;
const VOICE_FADE_LERP = 0.06;

const FILTER_MIN_HZ = 200;
const FILTER_MAX_HZ = 8000;

/** Harmonizer Set 4 — funky blues groove loops (p5.js editor CDN) */
const HARMONIZER_SET4_URLS = {
  left:   'https://assets.editor.p5js.org/67516d6e468028a27ad0eb67/8f8dc791-6eb3-4feb-8147-db748607db44.mp3',
  center: 'https://assets.editor.p5js.org/67516d6e468028a27ad0eb67/3ca0d0de-7ebf-48e1-9be6-c642e6c03998.mp3',
  right:  'https://assets.editor.p5js.org/67516d6e468028a27ad0eb67/a0efd7ec-d653-4164-bf64-a66f566f11bc.mp3',
};

const SAMPLE_SETS: SampleSetDef[] = [
  {
    id: 'oscillator-fallback',
    name: 'Oscillator Fallback',
    urls: null,
  },
  {
    id: 'funky-blues',
    name: 'Funky Blues (Harmonizer Set 4)',
    urls: HARMONIZER_SET4_URLS,
  },
];

/** Voice 1 oscillator fallback: C major triad, octave 4 */
const VOICE1_OSC = [
  { freq: 261.63, type: 'sine' as OscillatorType, tremolo: true },    // C4
  { freq: 329.63, type: 'triangle' as OscillatorType, tremolo: false }, // E4
  { freq: 392.00, type: 'sine' as OscillatorType, tremolo: false },    // G4
] as const;

/** Voice 2 oscillator fallback: C major triad, octave 3 */
const VOICE2_OSC = [
  { freq: 130.81, type: 'sawtooth' as OscillatorType, tremolo: false }, // C3
  { freq: 164.81, type: 'square' as OscillatorType, tremolo: false },   // E3
  { freq: 196.00, type: 'sawtooth' as OscillatorType, tremolo: false }, // G3
] as const;

// ============================================
// Utility
// ============================================

function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function logFreq(norm: number, minHz: number, maxHz: number): number {
  const minLog = Math.log(minHz);
  const maxLog = Math.log(maxHz);
  return Math.exp(minLog + norm * (maxLog - minLog));
}

function applyCalibration(raw: number, min: number, max: number): number {
  if (max <= min) return 0.5;
  return clamp((raw - min) / (max - min), 0, 1);
}

// ============================================
// Engine
// ============================================

export class HarmonicBlendingEngine {
  private isInitialized = false;
  private isPlaying = false;
  private isMuted = false;
  private loadingState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';

  private voice1: VoiceState | null = null;
  private voice2: VoiceState | null = null;

  // Shared routing
  private reverbNode: Tone.Reverb | null = null;
  private reverbSend: Tone.Gain | null = null;
  private dryGain: Tone.Gain | null = null;
  private masterGain: Tone.Gain | null = null;

  private currentReverbWet = 0;
  private currentDistance = 1;
  private animFrameId: number | null = null;

  private calibration: HarmonicBlendingCalibration | null = null;
  private activeSampleSetId = 'funky-blues'; // default to real samples

  private pos1: VoicePosition = { x: 0.5, y: 0.5, found: false };
  private pos2: VoicePosition = { x: 0.5, y: 0.5, found: false };

  // ---- Public API ----

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    await Tone.start();

    this.masterGain = new Tone.Gain(0.8).toDestination();

    this.reverbNode = new Tone.Reverb({ decay: 3, preDelay: 0.05 });
    await this.reverbNode.generate();
    this.reverbNode.wet.value = 1; // fully wet; we mix via send gain

    this.reverbSend = new Tone.Gain(0);
    this.reverbSend.connect(this.reverbNode);
    this.reverbNode.connect(this.masterGain);

    this.dryGain = new Tone.Gain(1);
    this.dryGain.connect(this.masterGain);

    // Build voices for the active set
    await this.buildVoicesForActiveSet();

    this.isInitialized = true;
    console.log('[HarmonicBlendingEngine] Initialized');
  }

  start(): void {
    if (!this.isInitialized || this.isPlaying) return;
    if (this.loadingState === 'loading') return; // wait for samples

    this.startVoice(this.voice1);
    this.startVoice(this.voice2);

    this.isPlaying = true;
    this.scheduleUpdate();
    console.log('[HarmonicBlendingEngine] Started');
  }

  stop(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.masterGain) {
      this.masterGain.gain.rampTo(0, 0.3);
      setTimeout(() => {
        this.stopVoice(this.voice1);
        this.stopVoice(this.voice2);
        if (this.masterGain) this.masterGain.gain.value = 0.8;
      }, 350);
    }
    console.log('[HarmonicBlendingEngine] Stopped');
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain) {
      this.masterGain.gain.rampTo(muted ? 0 : 0.8, 0.2);
    }
  }

  getMuted(): boolean {
    return this.isMuted;
  }

  setPositions(voice1Pos: VoicePosition, voice2Pos: VoicePosition): void {
    this.pos1 = voice1Pos;
    this.pos2 = voice2Pos;
  }

  setCalibration(cal: HarmonicBlendingCalibration): void {
    this.calibration = cal;
    console.log('[HarmonicBlendingEngine] Calibration set:', cal);
  }

  clearCalibration(): void {
    this.calibration = null;
  }

  getCalibration(): HarmonicBlendingCalibration | null {
    return this.calibration;
  }

  getStatus(): BlendingStatus {
    return {
      voice1Zone: this.voice1 ? this.getZone(this.voice1) : null,
      voice2Zone: this.voice2 ? this.getZone(this.voice2) : null,
      voice1FilterHz: this.voice1?.filterCutoff ?? 0,
      voice2FilterHz: this.voice2?.filterCutoff ?? 0,
      reverbWet: this.currentReverbWet,
      distance: this.currentDistance,
      loadingState: this.loadingState,
    };
  }

  getSampleSets(): SampleSetDef[] {
    return SAMPLE_SETS;
  }

  getActiveSampleSetId(): string {
    return this.activeSampleSetId;
  }

  /**
   * Switch sample set. Tears down current voices and rebuilds with new sources.
   * If currently playing, restarts playback automatically.
   */
  async setActiveSampleSet(id: string): Promise<void> {
    if (id === this.activeSampleSetId && this.voice1) return;
    this.activeSampleSetId = id;

    if (!this.isInitialized) return;

    const wasPlaying = this.isPlaying;
    if (wasPlaying) {
      // Stop without the full fade — we're rebuilding
      this.isPlaying = false;
      if (this.animFrameId !== null) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }
      this.stopVoice(this.voice1);
      this.stopVoice(this.voice2);
    }

    this.teardownVoices();
    await this.buildVoicesForActiveSet();

    if (wasPlaying) {
      this.start();
    }

    console.log('[HarmonicBlendingEngine] Switched to set:', id);
  }

  isActive(): boolean {
    return this.isPlaying;
  }

  dispose(): void {
    this.stop();
    this.teardownVoices();
    this.reverbNode?.dispose();
    this.reverbSend?.dispose();
    this.dryGain?.dispose();
    this.masterGain?.dispose();
    this.reverbNode = null;
    this.reverbSend = null;
    this.dryGain = null;
    this.masterGain = null;
    this.isInitialized = false;
    console.log('[HarmonicBlendingEngine] Disposed');
  }

  // ---- Voice construction ----

  private async buildVoicesForActiveSet(): Promise<void> {
    const set = SAMPLE_SETS.find((s) => s.id === this.activeSampleSetId);
    if (!set) {
      console.warn('[HarmonicBlendingEngine] Set not found:', this.activeSampleSetId);
      return;
    }

    if (set.urls) {
      // Sample-based voices
      this.loadingState = 'loading';
      try {
        const [v1, v2] = await Promise.all([
          this.buildSampleVoice(set.urls),
          this.buildSampleVoice(set.urls), // both voices use same URLs
        ]);
        this.voice1 = v1;
        this.voice2 = v2;
        this.loadingState = 'ready';
        console.log('[HarmonicBlendingEngine] Samples loaded');
      } catch (err) {
        console.error('[HarmonicBlendingEngine] Sample load failed, falling back to oscillators:', err);
        this.loadingState = 'error';
        // Fall back to oscillators
        this.voice1 = this.buildOscillatorVoice(VOICE1_OSC);
        this.voice2 = this.buildOscillatorVoice(VOICE2_OSC);
      }
    } else {
      // Oscillator fallback
      this.voice1 = this.buildOscillatorVoice(VOICE1_OSC);
      this.voice2 = this.buildOscillatorVoice(VOICE2_OSC);
      this.loadingState = 'ready';
    }
  }

  private async buildSampleVoice(
    urls: { left: string; center: string; right: string },
  ): Promise<VoiceState> {
    const filter = new Tone.BiquadFilter({
      type: 'lowpass',
      frequency: FILTER_MAX_HZ,
      Q: 0.7,
    });

    const voiceGain = new Tone.Gain(0);
    filter.connect(voiceGain);
    voiceGain.connect(this.dryGain!);
    voiceGain.connect(this.reverbSend!);

    const urlList = [urls.left, urls.center, urls.right];

    // Pre-load audio buffers with CORS support, then create Players from buffers
    const buffers = await Promise.all(
      urlList.map(async (url) => {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP ${response.status} loading ${url}`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await Tone.getContext().rawContext.decodeAudioData(arrayBuffer);
        return new Tone.ToneAudioBuffer(audioBuffer);
      }),
    );

    const players = buffers.map((buffer) => {
      return new Tone.Player({
        url: buffer,
        loop: true,
        volume: -6,
      });
    });

    // Wait for all players to be ready
    await Promise.all(players.map((p) => p.loaded));

    console.log('[HarmonicBlendingEngine] All 3 sample buffers loaded and decoded');

    const sources = players.map((player) => {
      const gain = new Tone.Gain(0);
      player.connect(gain);
      gain.connect(filter);
      return { node: player, gain, kind: 'player' as const };
    }) as [AudioSource, AudioSource, AudioSource];

    return {
      sources,
      filter,
      voiceGain,
      volLeft: 0,
      volCenter: 0,
      volRight: 0,
      filterCutoff: FILTER_MAX_HZ,
      voiceLevel: 0,
    };
  }

  private buildOscillatorVoice(
    defs: readonly { freq: number; type: OscillatorType; tremolo: boolean }[],
  ): VoiceState {
    const filter = new Tone.BiquadFilter({
      type: 'lowpass',
      frequency: FILTER_MAX_HZ,
      Q: 0.7,
    });

    const voiceGain = new Tone.Gain(0);
    filter.connect(voiceGain);
    voiceGain.connect(this.dryGain!);
    voiceGain.connect(this.reverbSend!);

    const sources = defs.map((cfg) => {
      const gain = new Tone.Gain(0);
      gain.connect(filter);

      const oscillator = new Tone.Oscillator({
        frequency: cfg.freq,
        type: cfg.type,
        volume: -10,
      });

      let tremolo: Tone.Tremolo | undefined;
      if (cfg.tremolo) {
        tremolo = new Tone.Tremolo({ frequency: 4, depth: 0.6 }).start();
        oscillator.connect(tremolo);
        tremolo.connect(gain);
      } else {
        oscillator.connect(gain);
      }

      return { node: oscillator, gain, tremolo, kind: 'oscillator' as const } as AudioSource;
    }) as [AudioSource, AudioSource, AudioSource];

    return {
      sources,
      filter,
      voiceGain,
      volLeft: 0,
      volCenter: 0,
      volRight: 0,
      filterCutoff: FILTER_MAX_HZ,
      voiceLevel: 0,
    };
  }

  // ---- Voice lifecycle ----

  private startVoice(voice: VoiceState | null): void {
    if (!voice) return;
    for (const src of voice.sources) {
      if (src.kind === 'player') {
        const player = src.node as Tone.Player;
        if (player.state !== 'started' && player.loaded) {
          player.start();
        }
      } else {
        const osc = src.node as Tone.Oscillator;
        if (osc.state !== 'started') {
          osc.start();
        }
      }
    }
  }

  private stopVoice(voice: VoiceState | null): void {
    if (!voice) return;
    for (const src of voice.sources) {
      if (src.kind === 'player') {
        const player = src.node as Tone.Player;
        if (player.state === 'started') player.stop();
      } else {
        const osc = src.node as Tone.Oscillator;
        if (osc.state === 'started') osc.stop();
      }
    }
  }

  private teardownVoices(): void {
    this.disposeVoice(this.voice1);
    this.disposeVoice(this.voice2);
    this.voice1 = null;
    this.voice2 = null;
  }

  private disposeVoice(voice: VoiceState | null): void {
    if (!voice) return;
    for (const src of voice.sources) {
      src.node.dispose();
      src.gain.dispose();
      src.tremolo?.dispose();
    }
    voice.filter.dispose();
    voice.voiceGain.dispose();
  }

  // ---- Per-frame update ----

  private getZone(voice: VoiceState): 'left' | 'center' | 'right' | null {
    if (voice.voiceLevel < 0.01) return null;
    if (voice.volLeft > voice.volCenter && voice.volLeft > voice.volRight) return 'left';
    if (voice.volRight > voice.volCenter && voice.volRight > voice.volLeft) return 'right';
    return 'center';
  }

  private scheduleUpdate(): void {
    if (!this.isPlaying) return;
    this.animFrameId = requestAnimationFrame(() => {
      this.update();
      this.scheduleUpdate();
    });
  }

  private update(): void {
    if (!this.voice1 || !this.voice2) return;

    let p1x = this.pos1.x;
    let p1y = this.pos1.y;
    let p2x = this.pos2.x;
    let p2y = this.pos2.y;

    if (this.calibration) {
      const c1 = this.calibration.voice1;
      const c2 = this.calibration.voice2;
      p1x = applyCalibration(this.pos1.x, c1.minX, c1.maxX);
      p1y = applyCalibration(this.pos1.y, c1.minY, c1.maxY);
      p2x = applyCalibration(this.pos2.x, c2.minX, c2.maxX);
      p2y = applyCalibration(this.pos2.y, c2.minY, c2.maxY);
    }

    this.updateVoice(this.voice1, p1x, p1y, this.pos1.found);
    this.updateVoice(this.voice2, p2x, p2y, this.pos2.found);
    this.updateReverb();
  }

  private updateVoice(voice: VoiceState, x: number, y: number, found: boolean): void {
    const targetLevel = found ? 1 : 0;
    voice.voiceLevel = lerp(voice.voiceLevel, targetLevel, VOICE_FADE_LERP);
    voice.voiceGain.gain.value = voice.voiceLevel;

    if (!found) return;

    // Binary-target zone crossfade (matching Harmonizer exactly)
    let targetLeft = 0;
    let targetCenter = 0;
    let targetRight = 0;

    if (x < LEFT_THRESHOLD) {
      targetLeft = 1;
    } else if (x > RIGHT_THRESHOLD) {
      targetRight = 1;
    } else {
      targetCenter = 1;
    }

    voice.volLeft = lerp(voice.volLeft, targetLeft, CROSSFADE_LERP);
    voice.volCenter = lerp(voice.volCenter, targetCenter, CROSSFADE_LERP);
    voice.volRight = lerp(voice.volRight, targetRight, CROSSFADE_LERP);

    voice.sources[0].gain.gain.value = voice.volLeft;
    voice.sources[1].gain.gain.value = voice.volCenter;
    voice.sources[2].gain.gain.value = voice.volRight;

    // Filter: Y → lowpass cutoff (top = bright, bottom = warm)
    const filterNorm = 1 - y;
    const targetHz = logFreq(filterNorm, FILTER_MIN_HZ, FILTER_MAX_HZ);
    voice.filterCutoff = lerp(voice.filterCutoff, targetHz, FILTER_LERP);
    voice.filter.frequency.value = voice.filterCutoff;
  }

  private updateReverb(): void {
    if (!this.reverbSend || !this.dryGain) return;

    if (this.pos1.found && this.pos2.found) {
      const dx = this.pos1.x - this.pos2.x;
      const dy = this.pos1.y - this.pos2.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const normDist = clamp(dist / Math.SQRT2, 0, 1);

      this.currentDistance = normDist;
      const targetWet = clamp(1 - normDist, 0, 0.85);
      this.currentReverbWet = lerp(this.currentReverbWet, targetWet, REVERB_LERP);
    } else {
      this.currentReverbWet = lerp(this.currentReverbWet, 0, REVERB_LERP);
      this.currentDistance = 1;
    }

    this.reverbSend.gain.value = this.currentReverbWet;
    this.dryGain.gain.value = 1 - this.currentReverbWet * 0.5;
  }
}

// Singleton
let instance: HarmonicBlendingEngine | null = null;

export function getHarmonicBlendingEngine(): HarmonicBlendingEngine {
  if (!instance) {
    instance = new HarmonicBlendingEngine();
  }
  return instance;
}
