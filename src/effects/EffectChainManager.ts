/**
 * Effect Chain Manager
 *
 * Manages effect presets and applies them to the SoundEngine.
 * Handles dynamic effect chain creation and switching.
 */

import * as Tone from 'tone';
import type {
  EffectChainPreset,
  EffectConfig,
  PresetChangeCallback,
  FilterConfig,
  DelayConfig,
  ReverbConfig,
  ChorusConfig,
  DistortionConfig,
  BitcrusherConfig,
  PhaserConfig,
  TremoloConfig,
  CompressorConfig,
} from './types';
import { EFFECT_PRESETS, DEFAULT_PRESET_ID, getPresetById } from './presets';

/** Effect instance wrapper */
interface EffectInstance {
  type: string;
  node: Tone.ToneAudioNode;
}

export class EffectChainManager {
  private currentPreset: EffectChainPreset | null = null;
  private effectInstances: EffectInstance[] = [];
  private inputNode: Tone.Gain | null = null;
  private outputNode: Tone.Gain | null = null;
  private masterGain: Tone.Gain | null = null;
  private isInitialized = false;
  private subscribers: Set<PresetChangeCallback> = new Set();

  /**
   * Initialize the effect chain manager.
   * Should be called after Tone.start().
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Create input/output nodes
    this.inputNode = new Tone.Gain(1);
    this.outputNode = new Tone.Gain(1);
    this.masterGain = new Tone.Gain(1).toDestination();
    this.outputNode.connect(this.masterGain);

    // Apply default preset
    await this.applyPreset(DEFAULT_PRESET_ID);

    this.isInitialized = true;
    console.log('[EffectChainManager] Initialized with preset:', this.currentPreset?.name);
  }

  /**
   * Get the input node for connecting synths.
   */
  getInput(): Tone.Gain | null {
    return this.inputNode;
  }

  /**
   * Get the output node (before master gain).
   */
  getOutput(): Tone.Gain | null {
    return this.outputNode;
  }

  /**
   * Apply a preset by ID.
   */
  async applyPreset(presetId: string): Promise<boolean> {
    const preset = getPresetById(presetId);
    if (!preset) {
      console.warn(`[EffectChainManager] Preset not found: ${presetId}`);
      return false;
    }

    return this.applyPresetConfig(preset);
  }

  /**
   * Apply a preset configuration.
   */
  async applyPresetConfig(preset: EffectChainPreset): Promise<boolean> {
    if (!this.inputNode || !this.outputNode) {
      console.warn('[EffectChainManager] Not initialized');
      return false;
    }

    try {
      // Disconnect existing chain
      this.disconnectChain();

      // Create new effect instances
      this.effectInstances = [];
      for (const effectConfig of preset.effects) {
        const instance = await this.createEffect(effectConfig);
        if (instance) {
          this.effectInstances.push(instance);
        }
      }

      // Connect the chain: input → effects → output
      this.connectChain();

      // Apply master gain
      if (this.masterGain) {
        this.masterGain.gain.value = Tone.dbToGain(preset.masterGain);
      }

      this.currentPreset = preset;

      // Notify subscribers
      this.notifySubscribers(preset);

      console.log(`[EffectChainManager] Applied preset: ${preset.name}`);
      return true;
    } catch (error) {
      console.error('[EffectChainManager] Error applying preset:', error);
      return false;
    }
  }

  /**
   * Create an effect instance from config.
   */
  private async createEffect(config: EffectConfig): Promise<EffectInstance | null> {
    try {
      switch (config.type) {
        case 'filter':
          return this.createFilter(config.config);
        case 'delay':
          return this.createDelay(config.config);
        case 'reverb':
          return await this.createReverb(config.config);
        case 'chorus':
          return this.createChorus(config.config);
        case 'distortion':
          return this.createDistortion(config.config);
        case 'bitcrusher':
          return this.createBitcrusher(config.config);
        case 'phaser':
          return this.createPhaser(config.config);
        case 'tremolo':
          return this.createTremolo(config.config);
        case 'compressor':
          return this.createCompressor(config.config);
        default:
          console.warn(`[EffectChainManager] Unknown effect type: ${(config as EffectConfig).type}`);
          return null;
      }
    } catch (error) {
      console.error(`[EffectChainManager] Error creating effect ${config.type}:`, error);
      return null;
    }
  }

  private createFilter(config: FilterConfig): EffectInstance {
    const filter = new Tone.Filter({
      type: config.type,
      frequency: config.frequency,
      Q: config.Q,
      rolloff: config.rolloff,
    });
    return { type: 'filter', node: filter };
  }

  private createDelay(config: DelayConfig): EffectInstance {
    const delay = new Tone.FeedbackDelay({
      delayTime: config.delayTime,
      feedback: config.feedback,
      wet: config.wet,
    });
    return { type: 'delay', node: delay };
  }

  private async createReverb(config: ReverbConfig): Promise<EffectInstance> {
    const reverb = new Tone.Reverb({
      decay: config.decay,
      wet: config.wet,
      preDelay: config.preDelay,
    });
    await reverb.generate();
    return { type: 'reverb', node: reverb };
  }

  private createChorus(config: ChorusConfig): EffectInstance {
    const chorus = new Tone.Chorus({
      frequency: config.frequency,
      delayTime: config.delayTime,
      depth: config.depth,
      wet: config.wet,
    }).start();
    return { type: 'chorus', node: chorus };
  }

  private createDistortion(config: DistortionConfig): EffectInstance {
    const distortion = new Tone.Distortion({
      distortion: config.distortion,
      wet: config.wet,
    });
    return { type: 'distortion', node: distortion };
  }

  private createBitcrusher(config: BitcrusherConfig): EffectInstance {
    const bitcrusher = new Tone.BitCrusher(config.bits);
    bitcrusher.wet.value = config.wet;
    return { type: 'bitcrusher', node: bitcrusher };
  }

  private createPhaser(config: PhaserConfig): EffectInstance {
    const phaser = new Tone.Phaser({
      frequency: config.frequency,
      octaves: config.octaves,
      baseFrequency: config.baseFrequency,
      wet: config.wet,
    });
    return { type: 'phaser', node: phaser };
  }

  private createTremolo(config: TremoloConfig): EffectInstance {
    const tremolo = new Tone.Tremolo({
      frequency: config.frequency,
      depth: config.depth,
      wet: config.wet,
    }).start();
    return { type: 'tremolo', node: tremolo };
  }

  private createCompressor(config: CompressorConfig): EffectInstance {
    const compressor = new Tone.Compressor({
      threshold: config.threshold,
      ratio: config.ratio,
      attack: config.attack,
      release: config.release,
    });
    return { type: 'compressor', node: compressor };
  }

  /**
   * Disconnect all effects in the chain.
   */
  private disconnectChain(): void {
    // Disconnect input
    this.inputNode?.disconnect();

    // Disconnect and dispose all effects
    for (const instance of this.effectInstances) {
      try {
        instance.node.disconnect();
        instance.node.dispose();
      } catch {
        // Ignore disconnect errors
      }
    }

    this.effectInstances = [];
  }

  /**
   * Connect the effect chain.
   */
  private connectChain(): void {
    if (!this.inputNode || !this.outputNode) return;

    if (this.effectInstances.length === 0) {
      // No effects, connect input directly to output
      this.inputNode.connect(this.outputNode);
      return;
    }

    // Connect input to first effect
    this.inputNode.connect(this.effectInstances[0].node);

    // Connect effects in series
    for (let i = 0; i < this.effectInstances.length - 1; i++) {
      this.effectInstances[i].node.connect(this.effectInstances[i + 1].node);
    }

    // Connect last effect to output
    this.effectInstances[this.effectInstances.length - 1].node.connect(this.outputNode);
  }

  /**
   * Get the current preset.
   */
  getCurrentPreset(): EffectChainPreset | null {
    return this.currentPreset;
  }

  /**
   * Get all available presets.
   */
  getAvailablePresets(): EffectChainPreset[] {
    return EFFECT_PRESETS;
  }

  /**
   * Subscribe to preset changes.
   */
  onPresetChange(callback: PresetChangeCallback): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Notify subscribers of preset change.
   */
  private notifySubscribers(preset: EffectChainPreset): void {
    for (const callback of this.subscribers) {
      try {
        callback(preset);
      } catch (error) {
        console.error('[EffectChainManager] Error in subscriber:', error);
      }
    }
  }

  /**
   * Update a single effect parameter in real-time.
   */
  updateEffectParam(effectType: string, param: string, value: number): void {
    const instance = this.effectInstances.find((e) => e.type === effectType);
    if (!instance) return;

    try {
      // Use Tone.js param access
      const node = instance.node as unknown as Record<string, unknown>;
      if (param in node) {
        const paramObj = node[param];
        if (paramObj && typeof paramObj === 'object' && 'value' in paramObj) {
          (paramObj as { value: number }).value = value;
        }
      }
    } catch (error) {
      console.error(`[EffectChainManager] Error updating ${effectType}.${param}:`, error);
    }
  }

  /**
   * Set master volume (in dB).
   */
  setMasterGain(db: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = Tone.dbToGain(db);
    }
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    this.disconnectChain();
    this.inputNode?.dispose();
    this.outputNode?.dispose();
    this.masterGain?.dispose();
    this.inputNode = null;
    this.outputNode = null;
    this.masterGain = null;
    this.currentPreset = null;
    this.isInitialized = false;
  }
}

// Singleton instance
let managerInstance: EffectChainManager | null = null;

export function getEffectChainManager(): EffectChainManager {
  if (!managerInstance) {
    managerInstance = new EffectChainManager();
  }
  return managerInstance;
}
