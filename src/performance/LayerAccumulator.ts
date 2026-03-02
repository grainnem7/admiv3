/**
 * Layer Accumulator - Creates persistent sound layers that accumulate and fade
 *
 * For the "Between Us" performance, this allows gesture-derived sounds to
 * persist through looping or accumulation, enabling traces of past interaction
 * to remain audible even as participants change or withdraw.
 */

import * as Tone from 'tone';
import { clamp } from '../utils/math';

export interface SoundLayer {
  id: string;
  /** The Tone.js player or synth for this layer */
  source: Tone.ToneAudioNode;
  /** Gain node for fade control */
  gainNode: Tone.Gain;
  /** When this layer was created */
  createdAt: number;
  /** Current gain value (0-1) */
  currentGain: number;
  /** Whether this layer is fading out */
  isFading: boolean;
  /** Source frequency/pitch info for visualization */
  frequency: number;
  /** Velocity/intensity */
  velocity: number;
}

export interface LayerAccumulatorConfig {
  /** Maximum number of simultaneous layers */
  maxLayers: number;
  /** Time in seconds for layers to fade out */
  fadeTime: number;
  /** Minimum gain before layer is removed */
  minGain: number;
  /** Master output gain */
  masterGain: number;
  /** Whether to automatically start fading old layers */
  autoFade: boolean;
  /** Time in seconds before auto-fade starts */
  autoFadeDelay: number;
  /** Reverb wet/dry mix (0-1) */
  reverbMix: number;
  /** Delay wet/dry mix (0-1) */
  delayMix: number;
}

const DEFAULT_CONFIG: LayerAccumulatorConfig = {
  maxLayers: 12,
  fadeTime: 10,
  minGain: 0.01,
  masterGain: 0.75,
  autoFade: true,
  autoFadeDelay: 5,
  reverbMix: 0.2,   // Less reverb for clearer sound
  delayMix: 0.1,    // Less delay for more direct response
};

export type LayerChangeCallback = (layers: SoundLayer[]) => void;

/** Extended layer type for rich multi-voice layers */
interface LayerWithExtras extends SoundLayer {
  extraSynths?: Tone.ToneAudioNode[];
  extraGains?: Tone.Gain[];
  filter?: Tone.Filter;
}

export class LayerAccumulator {
  private config: LayerAccumulatorConfig;
  private layers: Map<string, SoundLayer> = new Map();
  private masterGain: Tone.Gain;
  private reverb: Tone.Reverb;
  private delay: Tone.FeedbackDelay;
  private reverbGain: Tone.Gain;
  private delayGain: Tone.Gain;
  private dryGain: Tone.Gain;
  private fadeInterval: ReturnType<typeof setInterval> | null = null;
  private layerChangeCallbacks: Set<LayerChangeCallback> = new Set();
  private isInitialized: boolean = false;

  constructor(config: Partial<LayerAccumulatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Create audio nodes (will be connected on initialize)
    this.masterGain = new Tone.Gain(this.config.masterGain);
    this.reverb = new Tone.Reverb({ decay: 2.5, wet: 1, preDelay: 0.02 });
    this.delay = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.25, wet: 1 });
    this.reverbGain = new Tone.Gain(this.config.reverbMix);
    this.delayGain = new Tone.Gain(this.config.delayMix);
    this.dryGain = new Tone.Gain(1 - this.config.reverbMix - this.config.delayMix);
  }

  /**
   * Initialize the accumulator and connect to audio output
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Wait for reverb to generate impulse response
    await this.reverb.generate();

    // Connect effects chain
    // Dry path: masterGain -> dryGain -> destination
    // Reverb path: masterGain -> reverb -> reverbGain -> destination
    // Delay path: masterGain -> delay -> delayGain -> destination

    this.masterGain.connect(this.dryGain);
    this.masterGain.connect(this.reverb);
    this.masterGain.connect(this.delay);

    this.dryGain.toDestination();
    this.reverb.connect(this.reverbGain);
    this.reverbGain.toDestination();
    this.delay.connect(this.delayGain);
    this.delayGain.toDestination();

    // Start fade management interval
    this.startFadeManagement();

    this.isInitialized = true;
  }

  /**
   * Add a new sound layer based on gesture input
   */
  addLayer(
    frequency: number,
    velocity: number,
    waveform: OscillatorType = 'sine'
  ): string {
    // Remove oldest layer if at max
    if (this.layers.size >= this.config.maxLayers) {
      this.removeOldestLayer();
    }

    const id = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Create synth for this layer
    const synth = new Tone.Synth({
      oscillator: { type: waveform },
      envelope: {
        attack: 0.1,
        decay: 0.2,
        sustain: 0.8,
        release: this.config.fadeTime,
      },
    });

    // Create gain node for this layer
    const gainNode = new Tone.Gain(velocity);

    // Connect: synth -> layer gain -> master gain
    synth.connect(gainNode);
    gainNode.connect(this.masterGain);

    // Start the note
    synth.triggerAttack(frequency);

    const layer: SoundLayer = {
      id,
      source: synth,
      gainNode,
      createdAt: Date.now(),
      currentGain: velocity,
      isFading: false,
      frequency,
      velocity,
    };

    this.layers.set(id, layer);
    this.notifyLayerChange();

    // Schedule auto-fade if enabled
    if (this.config.autoFade) {
      setTimeout(() => {
        this.startLayerFade(id);
      }, this.config.autoFadeDelay * 1000);
    }

    return id;
  }

  /**
   * Play a quick staccato note - for fast/percussive gestures
   * Short attack, short decay, no sustain - punchy and immediate
   */
  playStaccato(
    frequency: number,
    velocity: number,
    waveform: OscillatorType = 'triangle'
  ): void {
    // Create a quick percussive synth
    const synth = new Tone.Synth({
      oscillator: { type: waveform },
      envelope: {
        attack: 0.005,   // Near-instant attack
        decay: 0.15,     // Quick decay
        sustain: 0,      // No sustain
        release: 0.1,    // Quick release
      },
    });

    const gainNode = new Tone.Gain(velocity * 0.7);
    synth.connect(gainNode);
    gainNode.connect(this.masterGain);

    // Trigger attack and release
    synth.triggerAttackRelease(frequency, 0.12);

    // Clean up after note finishes
    setTimeout(() => {
      synth.dispose();
      gainNode.dispose();
    }, 400);
  }

  /**
   * Add a sustained layer that plays while gesture is present
   * Returns a controller to update/stop the layer
   * Creates an expansive, expressive sound with many voices and harmonics
   */
  addSustainedLayer(
    frequency: number,
    velocity: number,
    _waveform: OscillatorType = 'sine'
  ): SustainedLayerController {
    const id = `sustained_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // === MAIN FOUNDATION VOICES ===
    // Core sine - the fundamental - FAST attack for responsiveness
    const mainSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.8, release: 1.0 },
    });

    // Warm triangle layer - slightly slower
    const warmSynth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.1, decay: 0.3, sustain: 0.6, release: 1.2 },
    });

    // === WIDE STEREO CHORUS (wider detuning) ===
    const chorusSynth1 = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.15, decay: 0.2, sustain: 0.5, release: 1.0 },
    });

    const chorusSynth2 = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.15, decay: 0.2, sustain: 0.5, release: 1.0 },
    });

    // === HARMONIC OVERTONES ===
    // Fifth above (3:2 ratio) - adds richness
    const fifthSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.2, decay: 0.3, sustain: 0.4, release: 1.2 },
    });

    // Octave above - shimmer
    const octaveSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.25, decay: 0.4, sustain: 0.3, release: 1.5 },
    });

    // === SUB BASS ===
    const subSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.08, decay: 0.2, sustain: 0.7, release: 0.8 },
    });

    // === MIXER SETUP ===
    const voiceMixer = new Tone.Gain(1);
    const mainGain = new Tone.Gain(0.35);
    const warmGain = new Tone.Gain(0.25);
    const chorus1Gain = new Tone.Gain(0.18);
    const chorus2Gain = new Tone.Gain(0.18);
    const fifthGain = new Tone.Gain(0.12);
    const octaveGain = new Tone.Gain(0.08);
    const subGain = new Tone.Gain(0.25);

    // Connect all voices
    mainSynth.connect(mainGain);
    warmSynth.connect(warmGain);
    chorusSynth1.connect(chorus1Gain);
    chorusSynth2.connect(chorus2Gain);
    fifthSynth.connect(fifthGain);
    octaveSynth.connect(octaveGain);
    subSynth.connect(subGain);

    mainGain.connect(voiceMixer);
    warmGain.connect(voiceMixer);
    chorus1Gain.connect(voiceMixer);
    chorus2Gain.connect(voiceMixer);
    fifthGain.connect(voiceMixer);
    octaveGain.connect(voiceMixer);
    subGain.connect(voiceMixer);

    // === SIGNAL PROCESSING ===
    // Gentle low-pass for warmth
    const filter = new Tone.Filter({
      frequency: 3500,
      type: 'lowpass',
      rolloff: -12,
    });

    // Main output gain
    const gainNode = new Tone.Gain(velocity * 0.8);

    // Connect: mixer -> filter -> gain -> master
    voiceMixer.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    // === START ALL VOICES ===
    const wideDetune = 8; // cents - wider for more movement
    const narrowDetune = 3; // cents

    mainSynth.triggerAttack(frequency);
    warmSynth.triggerAttack(frequency * Math.pow(2, narrowDetune / 1200));
    chorusSynth1.triggerAttack(frequency * Math.pow(2, wideDetune / 1200));   // +8 cents
    chorusSynth2.triggerAttack(frequency * Math.pow(2, -wideDetune / 1200));  // -8 cents
    fifthSynth.triggerAttack(frequency * 1.5);  // Perfect fifth
    octaveSynth.triggerAttack(frequency * 2);   // Octave above
    subSynth.triggerAttack(frequency / 2);      // Octave below

    // Store all synths for cleanup
    const allSynths = [mainSynth, warmSynth, chorusSynth1, chorusSynth2, fifthSynth, octaveSynth, subSynth];
    const allGains = [mainGain, warmGain, chorus1Gain, chorus2Gain, fifthGain, octaveGain, subGain, voiceMixer];

    const layer: SoundLayer = {
      id,
      source: mainSynth,
      gainNode,
      createdAt: Date.now(),
      currentGain: velocity,
      isFading: false,
      frequency,
      velocity,
    };

    (layer as LayerWithExtras).extraSynths = allSynths.slice(1);
    (layer as LayerWithExtras).extraGains = allGains;
    (layer as LayerWithExtras).filter = filter;

    this.layers.set(id, layer);
    this.notifyLayerChange();

    return {
      id,
      updatePitch: (newFreq: number) => this.updateLayerPitchRich(id, newFreq),
      updateVelocity: (newVel: number) => this.updateLayerVelocity(id, newVel),
      updateFilter: (cutoff: number) => this.updateLayerFilter(id, cutoff),
      updateExpression: (expression: number) => this.updateLayerExpression(id, expression),
      release: () => this.releaseLayerRich(id),
      fadeAndRemove: () => this.startLayerFade(id),
    };
  }

  /**
   * Update pitch for rich layered synth
   */
  private updateLayerPitchRich(layerId: string, frequency: number): void {
    const layer = this.layers.get(layerId) as LayerWithExtras | undefined;
    if (!layer) return;

    const wideDetune = 8;
    const narrowDetune = 3;
    const rampTime = 0.05; // Fast response for direct control

    // Update main synth
    if (layer.source instanceof Tone.Synth) {
      layer.source.frequency.rampTo(frequency, rampTime);
    }

    // Update extra synths: warm, chorus1, chorus2, fifth, octave, sub
    if (layer.extraSynths) {
      const [warm, chorus1, chorus2, fifth, octave, sub] = layer.extraSynths;
      if (warm instanceof Tone.Synth) {
        warm.frequency.rampTo(frequency * Math.pow(2, narrowDetune / 1200), rampTime);
      }
      if (chorus1 instanceof Tone.Synth) {
        chorus1.frequency.rampTo(frequency * Math.pow(2, wideDetune / 1200), rampTime);
      }
      if (chorus2 instanceof Tone.Synth) {
        chorus2.frequency.rampTo(frequency * Math.pow(2, -wideDetune / 1200), rampTime);
      }
      if (fifth instanceof Tone.Synth) {
        fifth.frequency.rampTo(frequency * 1.5, rampTime);
      }
      if (octave instanceof Tone.Synth) {
        octave.frequency.rampTo(frequency * 2, rampTime);
      }
      if (sub instanceof Tone.Synth) {
        sub.frequency.rampTo(frequency / 2, rampTime);
      }
    }

    layer.frequency = frequency;
    this.notifyLayerChange();
  }

  /**
   * Update filter cutoff for rich layered synth
   * cutoff: 0-1, maps to 200Hz - 8000Hz
   */
  private updateLayerFilter(layerId: string, cutoff: number): void {
    const layer = this.layers.get(layerId) as LayerWithExtras | undefined;
    if (!layer || !layer.filter) return;

    // Map 0-1 to frequency range with exponential curve for natural feel
    const minFreq = 300;
    const maxFreq = 10000;
    const freq = minFreq * Math.pow(maxFreq / minFreq, clamp(cutoff, 0, 1));

    layer.filter.frequency.rampTo(freq, 0.03); // Fast filter response
  }

  /**
   * Update expression for rich layered synth
   * Affects harmonic balance and dynamics
   * expression: 0-1, where higher = brighter, more harmonics
   */
  private updateLayerExpression(layerId: string, expression: number): void {
    const layer = this.layers.get(layerId) as LayerWithExtras | undefined;
    if (!layer) return;

    const expr = clamp(expression, 0, 1);

    // Adjust harmonic levels based on expression
    // Higher expression = more harmonics (fifth, octave more prominent)
    if (layer.extraGains && layer.extraGains.length >= 7) {
      const [_main, _warm, _chorus1, _chorus2, fifthGain, octaveGain] = layer.extraGains;

      // Fifth and octave become more prominent with expression - faster response
      if (fifthGain) fifthGain.gain.rampTo(0.1 + expr * 0.2, 0.04);
      if (octaveGain) octaveGain.gain.rampTo(0.06 + expr * 0.15, 0.04);
    }

    // Also adjust filter based on expression - wider range, faster response
    if (layer.filter) {
      const baseFreq = 2000;
      const exprFreq = baseFreq + expr * 6000;  // More dramatic filter sweep
      layer.filter.frequency.rampTo(exprFreq, 0.04);
    }
  }

  /**
   * Release rich layered synth
   */
  private releaseLayerRich(layerId: string): void {
    const layer = this.layers.get(layerId) as LayerWithExtras | undefined;
    if (!layer) return;

    // Release main synth
    if (layer.source instanceof Tone.Synth) {
      layer.source.triggerRelease();
    }

    // Release extra synths
    if (layer.extraSynths) {
      layer.extraSynths.forEach((synth) => {
        if (synth instanceof Tone.Synth) {
          synth.triggerRelease();
        }
      });
    }

    // Remove after release time
    setTimeout(() => {
      this.removeLayerRich(layerId);
    }, 2000);
  }

  /**
   * Remove rich layered synth and cleanup
   */
  private removeLayerRich(layerId: string): void {
    const layer = this.layers.get(layerId) as LayerWithExtras | undefined;
    if (!layer) return;

    // Dispose main synth
    if (layer.source instanceof Tone.Synth) {
      layer.source.dispose();
    }

    // Dispose extra synths
    if (layer.extraSynths) {
      layer.extraSynths.forEach((synth) => synth.dispose());
    }

    // Dispose extra gains
    if (layer.extraGains) {
      layer.extraGains.forEach((gain) => gain.dispose());
    }

    // Dispose filter
    if (layer.filter) {
      layer.filter.dispose();
    }

    layer.gainNode.dispose();
    this.layers.delete(layerId);
    this.notifyLayerChange();
  }

  /**
   * Update the pitch of an existing layer
   */
  updateLayerPitch(layerId: string, frequency: number): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;

    if (layer.source instanceof Tone.Synth) {
      layer.source.frequency.rampTo(frequency, 0.05);
    }
    layer.frequency = frequency;
    this.notifyLayerChange();
  }

  /**
   * Update the velocity/gain of an existing layer
   */
  updateLayerVelocity(layerId: string, velocity: number): void {
    const layer = this.layers.get(layerId);
    if (!layer || layer.isFading) return;

    const gain = clamp(velocity, 0, 1);
    layer.gainNode.gain.rampTo(gain, 0.05);
    layer.currentGain = gain;
    layer.velocity = velocity;
    this.notifyLayerChange();
  }

  /**
   * Release a sustained layer (starts natural release envelope)
   */
  releaseLayer(layerId: string): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;

    if (layer.source instanceof Tone.Synth) {
      layer.source.triggerRelease();
    }

    // Remove after release time
    setTimeout(() => {
      this.removeLayer(layerId);
    }, 500);
  }

  /**
   * Start fading out a layer
   */
  startLayerFade(layerId: string): void {
    const layer = this.layers.get(layerId);
    if (!layer || layer.isFading) return;

    layer.isFading = true;
    layer.gainNode.gain.rampTo(0, this.config.fadeTime);

    // Remove after fade completes
    setTimeout(() => {
      this.removeLayer(layerId);
    }, this.config.fadeTime * 1000);

    this.notifyLayerChange();
  }

  /**
   * Remove a layer immediately
   */
  removeLayer(layerId: string): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;

    // Stop and disconnect
    if (layer.source instanceof Tone.Synth) {
      layer.source.triggerRelease();
      setTimeout(() => {
        layer.source.dispose();
        layer.gainNode.dispose();
      }, 100);
    } else {
      layer.source.dispose();
      layer.gainNode.dispose();
    }

    this.layers.delete(layerId);
    this.notifyLayerChange();
  }

  /**
   * Remove the oldest layer
   */
  private removeOldestLayer(): void {
    let oldest: SoundLayer | null = null;
    let oldestTime = Infinity;

    for (const layer of this.layers.values()) {
      if (layer.createdAt < oldestTime) {
        oldestTime = layer.createdAt;
        oldest = layer;
      }
    }

    if (oldest) {
      this.startLayerFade(oldest.id);
    }
  }

  /**
   * Start the fade management interval
   */
  private startFadeManagement(): void {
    // Update every 100ms to check for layers below min gain
    this.fadeInterval = setInterval(() => {
      for (const layer of this.layers.values()) {
        if (layer.isFading && layer.gainNode.gain.value < this.config.minGain) {
          this.removeLayer(layer.id);
        }
      }
    }, 100);
  }

  /**
   * Subscribe to layer changes
   */
  onLayerChange(callback: LayerChangeCallback): () => void {
    this.layerChangeCallbacks.add(callback);
    return () => this.layerChangeCallbacks.delete(callback);
  }

  /**
   * Notify all listeners of layer changes
   */
  private notifyLayerChange(): void {
    const layerArray = Array.from(this.layers.values());
    this.layerChangeCallbacks.forEach(cb => cb(layerArray));
  }

  /**
   * Get current layers for visualization
   */
  getLayers(): SoundLayer[] {
    return Array.from(this.layers.values());
  }

  /**
   * Get active layer count
   */
  getLayerCount(): number {
    return this.layers.size;
  }

  /**
   * Set master gain
   */
  setMasterGain(gain: number): void {
    this.config.masterGain = clamp(gain, 0, 1);
    this.masterGain.gain.rampTo(this.config.masterGain, 0.1);
  }

  /**
   * Set effect mix levels
   */
  setEffectMix(reverb: number, delay: number): void {
    this.config.reverbMix = clamp(reverb, 0, 1);
    this.config.delayMix = clamp(delay, 0, 1);

    this.reverbGain.gain.rampTo(this.config.reverbMix, 0.1);
    this.delayGain.gain.rampTo(this.config.delayMix, 0.1);
    this.dryGain.gain.rampTo(
      Math.max(0, 1 - this.config.reverbMix - this.config.delayMix),
      0.1
    );
  }

  /**
   * Set fade time for layers
   */
  setFadeTime(seconds: number): void {
    this.config.fadeTime = Math.max(0.5, seconds);
  }

  /**
   * Set auto-fade delay
   */
  setAutoFadeDelay(seconds: number): void {
    this.config.autoFadeDelay = Math.max(0.5, seconds);
  }

  /**
   * Clear all layers
   */
  clearAll(): void {
    for (const layerId of this.layers.keys()) {
      this.startLayerFade(layerId);
    }
  }

  /**
   * Stop all layers immediately
   */
  stopAll(): void {
    for (const layerId of this.layers.keys()) {
      this.removeLayer(layerId);
    }
  }

  /**
   * Mute/unmute output
   */
  setMuted(muted: boolean): void {
    this.masterGain.gain.rampTo(muted ? 0 : this.config.masterGain, 0.1);
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }

    this.stopAll();

    this.masterGain.dispose();
    this.reverb.dispose();
    this.delay.dispose();
    this.reverbGain.dispose();
    this.delayGain.dispose();
    this.dryGain.dispose();

    this.layerChangeCallbacks.clear();
    this.isInitialized = false;
  }
}

/**
 * Controller for sustained layers
 */
export interface SustainedLayerController {
  id: string;
  updatePitch: (frequency: number) => void;
  updateVelocity: (velocity: number) => void;
  /** Update filter cutoff (0-1, maps to frequency range) */
  updateFilter: (cutoff: number) => void;
  /** Update expression/dynamics (0-1, affects multiple parameters) */
  updateExpression: (expression: number) => void;
  release: () => void;
  fadeAndRemove: () => void;
}

// Singleton instance
let accumulatorInstance: LayerAccumulator | null = null;

export function getLayerAccumulator(): LayerAccumulator {
  if (!accumulatorInstance) {
    accumulatorInstance = new LayerAccumulator();
  }
  return accumulatorInstance;
}
