/**
 * SurfaceKeyboardEngine — minimal sampled audio for the standalone Surface
 * Keyboard mode. No song, no chord lock, no beat grid: each tube is a fixed
 * pentatonic key that sounds the instant it is pressed.
 *
 * Reuses the existing voice layer (`SurfacePressVoice` → `SamplerPlayer`) and
 * the shared `MasterChain` — no new synthesis, and the UI never touches Tone
 * directly (it calls this engine). One sampled voice per tube, pitched by the
 * tube's left→right index via `pentatonicMidiForTube`.
 */

import * as Tone from 'tone';
import { MasterChain } from '../audio/MasterChain';
import { SurfacePressVoice } from './voices/SurfacePressVoice';
import { pentatonicMidiForTube } from './surfaceKeyboardScale';
import { createNoteEvent, type NoteEvent } from '../mapping/events';

export interface SurfaceKeyboardKey {
  id: string;
  instrumentKey: string;
}

export class SurfaceKeyboardEngine {
  private ctx: AudioContext | null = null;
  private masterChain: MasterChain | null = null;
  private voices = new Map<string, SurfacePressVoice>();
  private heldMidi = new Map<string, number>();
  /** Tube id order (left→right) → index → pentatonic pitch. */
  private order: string[] = [];
  private baseMidi = 60; // C4

  /** Mirror of note on/off as typed events (facilitator visuals / future MIDI). */
  onKeyNote?: (event: NoteEvent) => void;

  /** Start (or resume) audio. Must be called from a user gesture. Idempotent. */
  async start(): Promise<void> {
    await Tone.start();
    if (!this.ctx) {
      this.ctx = Tone.getContext().rawContext as AudioContext;
      this.masterChain = new MasterChain(this.ctx);
    } else if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  isReady(): boolean {
    return this.ctx !== null;
  }

  setBaseMidi(midi: number): void {
    this.baseMidi = midi;
  }

  /**
   * Build/replace the per-tube sampled voices in left→right order. Disposes
   * existing voices first (instrument may have changed). No-op until start().
   */
  setKeys(keys: SurfaceKeyboardKey[]): void {
    if (!this.ctx || !this.masterChain) return;
    for (const v of this.voices.values()) {
      v.disconnect();
      v.dispose();
    }
    this.voices.clear();
    this.heldMidi.clear();
    this.order = keys.map((k) => k.id);
    for (const k of keys) {
      const voice = new SurfacePressVoice(this.ctx, k.instrumentKey);
      voice.connect(this.masterChain.input);
      this.voices.set(k.id, voice);
    }
  }

  /** Note-on for a tube press (pitched by the tube's index). */
  press(keyId: string, velocity = 0.8): void {
    const voice = this.voices.get(keyId);
    if (!voice) return;
    const index = this.order.indexOf(keyId);
    const midi = pentatonicMidiForTube(index < 0 ? 0 : index, this.baseMidi);
    voice.press(midi, velocity);
    this.heldMidi.set(keyId, midi);
    this.onKeyNote?.(createNoteEvent('noteOn', midi, velocity, performance.now()));
  }

  /** Note-off for a tube release. Mirrors only when a note was actually held. */
  release(keyId: string): void {
    const voice = this.voices.get(keyId);
    if (!voice) return;
    const held = this.heldMidi.get(keyId);
    if (held === undefined) return;
    voice.release();
    this.heldMidi.delete(keyId);
    this.onKeyNote?.(createNoteEvent('noteOff', held, 0, performance.now()));
  }

  /** MIDI note a tube id would play (for UI labels). */
  midiForKey(keyId: string): number {
    const index = this.order.indexOf(keyId);
    return pentatonicMidiForTube(index < 0 ? 0 : index, this.baseMidi);
  }

  dispose(): void {
    for (const v of this.voices.values()) {
      v.disconnect();
      v.dispose();
    }
    this.voices.clear();
    this.heldMidi.clear();
    this.masterChain?.dispose();
    this.masterChain = null;
    this.ctx = null;
  }
}
