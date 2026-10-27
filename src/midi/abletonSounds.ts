/**
 * ADMI's sound choices, carried over to Ableton (Phase 2).
 *
 * Each Ableton track holds an Instrument Rack whose chains are ADMI's sounds, one per sound.
 * CC 30 on the track's channel picks the chain (the middle of that chain's equal share of
 * 0–127; the drums' kit rack keeps index × 8), so a colour card's sound,
 * the World, a scene's World and Evolve's instrument changes all switch Ableton's sound
 * too. Every chain is already loaded, so a switch is instant and safe mid-piece.
 *
 * The sound shaping goes as CCs the template maps to Rack macros: Loud 24, Bright 25,
 * Space 26 on each colour's channel; Energy 21, Space 22 and Groove 23 on channel 16; and
 * the Tone, Reverb and Delay counters as 25, 26 and 27 on every sounding channel.
 *
 * Everything here is pure: what should be sent, never the sending.
 */

import { evolveVoicesFor, type NamedVoice } from '../audio/evolve/evolve';
import type { LayeredVoiceSpec, SoundWorldChoice } from '../audio/worlds/soundWorlds';
import { synthLayerOf, worldOf } from '../audio/worlds/soundWorlds';
import { BRIGHT, ENERGY, LOUD, SPACE_ALL, SPACE_SEND, stepCc } from '../audio/soundSteps';
import type { ColourChannel } from '../tracking/boardColours';
import { soundsFor } from '../ui/screens/boardSequencer/soundCatalogue';
import {
  BAND_BASS_CHANNEL, BAND_PAD_CHANNEL, channelFor, colourChannelPool, EXTRA_NOTES_CHANNEL, gainToCc, hasColourChannel,
  LOOP_CHANNELS, ROLE_CHANNEL, VOLUME_CHANNEL, type MappingTarget, type MidiChannelMode, type MidiEvent,
} from './boardMidi';

/** The controller that picks a Rack chain. */
export const CHAIN_CC = 30;
export const CC_LOUD = 24;
export const CC_BRIGHT = 25;
export const CC_SPACE = 26;
export const CC_ECHO = 27;
export const CC_ENERGY = 21;
export const CC_SPACE_ALL = 22;
export const CC_GROOVE = 23;

export interface AbletonChain {
  index: number;
  /** The chain's name in the Rack, exactly. */
  name: string;
  /** ADMI's instrument keys this chain stands for. */
  keys: readonly string[];
}

/** The chain list: the same on every track, in this order. */
export const ABLETON_CHAINS: readonly AbletonChain[] = [
  { index: 0, name: 'World: Warm', keys: [] },
  { index: 1, name: 'World: Lo-fi', keys: [] },
  { index: 2, name: 'World: Ambient', keys: [] },
  { index: 3, name: 'World: Electronic', keys: [] },
  { index: 4, name: 'Piano', keys: ['piano'] },
  { index: 5, name: 'Electric piano', keys: ['electricPiano'] },
  { index: 6, name: 'Harp', keys: ['harp'] },
  { index: 7, name: 'Organ', keys: ['organ'] },
  { index: 8, name: 'Clarinet', keys: ['clarinet'] },
  { index: 9, name: 'French horn', keys: ['frenchHorn'] },
  { index: 10, name: 'Cello', keys: ['cello'] },
  { index: 11, name: 'Nylon guitar', keys: ['guitarNylon'] },
  { index: 12, name: 'Electric bass', keys: ['bassElectric'] },
  { index: 13, name: 'Choir pad', keys: ['pad', 'padChoir'] },
  { index: 14, name: 'Electric piano chords', keys: ['chord'] },
  { index: 15, name: 'Bells', keys: [] },
  // Added after the first 16 (2026-10-27), so an older rack only gains chains at the end.
  { index: 16, name: 'Violin', keys: ['violin'] },
  { index: 17, name: 'Upright bass', keys: ['contrabass'] },
  { index: 18, name: 'Tuba', keys: ['tuba'] },
  { index: 19, name: 'Flute', keys: ['flute'] },
  { index: 20, name: 'Saxophone', keys: ['saxophone'] },
  { index: 21, name: 'Trumpet', keys: ['trumpet'] },
  { index: 22, name: 'Trombone', keys: ['trombone'] },
  { index: 23, name: 'Bassoon', keys: ['bassoon'] },
  { index: 24, name: 'Xylophone', keys: ['xylophone'] },
  { index: 25, name: 'Acoustic guitar', keys: ['guitarAcoustic'] },
  { index: 26, name: 'Electric guitar', keys: ['guitarElectric'] },
  { index: 27, name: 'Synth pluck', keys: [] },
  { index: 28, name: 'Synth keys', keys: [] },
  { index: 29, name: 'Soft synth pad', keys: [] },
  { index: 30, name: 'Wide synth chords', keys: [] },
  { index: 31, name: 'Sub bass', keys: [] },
  { index: 32, name: 'Synth bass', keys: [] },
];

const WORLD_CHAIN: Record<string, number> = { warm: 0, lofi: 1, ambient: 2, electronic: 3 };
const ELECTRIC_PIANO = 5;
const ELECTRIC_BASS = 12;
const BELLS = 15;

/**
 * CC 30's value for a chain on a channel. Racks share 0–127 equally between their chains
 * (Ableton's Distribute Ranges Equally), so ADMI sends the middle of the chain's share: it
 * lands inside however Ableton rounds the edges. The drums' kit rack keeps its four zones
 * of 8 (index × 8).
 */
export function chainCcValue(index: number, channel: number): number {
  const i = Math.round(index);
  if (channel === ROLE_CHANNEL.drums) return Math.max(0, Math.min(127, i * 8));
  return Math.max(0, Math.min(127, Math.floor(((i + 0.5) * 128) / ABLETON_CHAINS.length)));
}

/** The chain's expected range after Distribute Ranges Equally, for the checklist. */
export function chainRange(index: number): [number, number] {
  const n = ABLETON_CHAINS.length;
  return [Math.round((index * 128) / n), Math.round(((index + 1) * 128) / n) - 1];
}

/** The chain an ADMI instrument key stands for, or null. */
export function chainForKey(key: string): number | null {
  const found = ABLETON_CHAINS.find((c) => c.keys.includes(key));
  return found ? found.index : null;
}

/** The World's chain (0 to 3); "My picks" has none of its own, so Warm stands in. */
export function worldChain(choice: SoundWorldChoice): number {
  return WORLD_CHAIN[choice] ?? 0;
}

/**
 * The chain for a colour: its own instrument when it has one, else the World's chain for
 * its part, else (My picks) Electric piano, or Electric bass for a bass. Drums: the World's
 * kit. A colour that plays no notes: null.
 */
export function chainFor(ch: Pick<ColourChannel, 'role' | 'instrument'>, choice: SoundWorldChoice): number | null {
  if (ch.role === 'drums') return worldChain(choice);
  if (!hasColourChannel(ch.role)) return null;
  if (ch.instrument) {
    const synth = synthLayerOf(ch.instrument);
    const own = synth ? SYNTH_CHAIN[synth] ?? BELLS : chainForKey(ch.instrument);
    if (own !== null) return own;
  }
  if (worldOf(choice)) return worldChain(choice);
  return ch.role === 'bass' ? ELECTRIC_BASS : ELECTRIC_PIANO;
}

const SYNTH_CHAIN: Record<string, number> = {
  bell: BELLS, pluck: 27, keys: 28, pad: 29, supersaw: 30, sub: 31, sawBass: 32,
};

const WORLD_CHAINS: readonly number[] = [0, 1, 2, 3];

/** What a part's track must hold: the World chains, its default, every sound its job offers and every Evolve voice for it. */
function partChains(role: 'melody' | 'chord' | 'bass'): ReadonlySet<number> {
  const out = new Set<number>([...WORLD_CHAINS, role === 'bass' ? ELECTRIC_BASS : ELECTRIC_PIANO]);
  for (const o of soundsFor(role)) {
    const chain = chainFor({ role, instrument: o.key }, 'none');
    if (chain !== null) out.add(chain);
  }
  for (const v of evolveVoicesFor(role)) out.add(chainForVoice(v));
  return out;
}

let partSets: Record<'melody' | 'chord' | 'bass', ReadonlySet<number>> | null = null;
const ALL_CHAINS: ReadonlySet<number> = new Set(ABLETON_CHAINS.map((c) => c.index));
const WORLD_ONLY: ReadonlySet<number> = new Set(WORLD_CHAINS);

/**
 * The chains a track's rack holds as real instruments; the rest are placeholders. Melody,
 * Chords and Bass hold what their job can reach; the band, Extra notes, the drums and the
 * loops only follow the World. In per-colour mode a colour's track can play any job, so it
 * holds everything; so does any channel not named here, to be safe.
 */
export function filledChains(channel: number, opts: { channelMode: MidiChannelMode; loopChannels?: boolean }): ReadonlySet<number> {
  const followers = [ROLE_CHANNEL.drums, BAND_PAD_CHANNEL, BAND_BASS_CHANNEL, EXTRA_NOTES_CHANNEL, ...(opts.loopChannels ? LOOP_CHANNELS : [])];
  if (opts.channelMode === 'colour') {
    if (colourChannelPool(opts.loopChannels).includes(channel)) return ALL_CHAINS;
    return followers.includes(channel) ? WORLD_ONLY : ALL_CHAINS;
  }
  partSets ??= { melody: partChains('melody'), chord: partChains('chord'), bass: partChains('bass') };
  if (channel === ROLE_CHANNEL.melody) return partSets.melody;
  if (channel === ROLE_CHANNEL.chord) return partSets.chord;
  if (channel === ROLE_CHANNEL.bass) return partSets.bass;
  return followers.includes(channel) ? WORLD_ONLY : ALL_CHAINS;
}

/**
 * The chain a colour's track is sent to: its own (or Evolve's) when that track holds it,
 * else the World's chain, so a pick the track doesn't hold (an older choice kept through a
 * job change) plays the World's sound, never a placeholder.
 */
export function chainOnChannel(
  ch: Pick<ColourChannel, 'role' | 'instrument'>, channel: number, world: SoundWorldChoice,
  opts: { channelMode: MidiChannelMode; loopChannels?: boolean }, evolved: NamedVoice | null = null,
): number | null {
  const chain = evolved ? chainForVoice(evolved) : chainFor(ch, world);
  if (chain === null) return null;
  return filledChains(channel, opts).has(chain) ? chain : worldChain(world);
}

/** The nearest chain to an Evolve instrument: by its sample first, then by its synth layer. */
export function chainForVoice(voice: NamedVoice | LayeredVoiceSpec | string): number {
  const spec: LayeredVoiceSpec | string = typeof voice === 'object' && 'spec' in voice ? voice.spec : voice;
  if (typeof spec === 'string') return chainForKey(spec) ?? BELLS;
  if (spec.sample) {
    const bySample = chainForKey(spec.sample);
    if (bySample !== null) return bySample;
  }
  if (spec.synth) return SYNTH_CHAIN[spec.synth] ?? BELLS;
  return BELLS;
}

/** One controller value to send. */
export interface AbletonControl {
  channel: number;
  cc: number;
  value: number;
}

export interface AbletonPlanInput {
  channels: readonly ColourChannel[];
  world: SoundWorldChoice;
  channelMode: MidiChannelMode;
  colourChannels?: ReadonlyMap<string, number>;
  /** Evolve's instrument for this scene, per colour (null or absent = its own sound). */
  evolveVoices?: ReadonlyMap<string, NamedVoice | null>;
  energy: number;
  space: number;
  swing: number;
  /** Loops on their own channels: those follow the World too. */
  loopChannels?: boolean;
}

export interface AbletonPlan {
  /** Every controller value Ableton should have now, by `${channel}:${cc}`. */
  controls: Map<string, AbletonControl>;
  /** Colours that share a channel with an earlier colour (one per part): colour id → the colour it follows. */
  shares: Map<string, { channel: number; withId: string }>;
  /** The chain on each channel, for the screen. */
  chains: Map<number, number>;
}

export const controlKey = (channel: number, cc: number): string => `${channel}:${cc}`;

/** The groove as one value: Straight 0, Swung about 85, Lazy 127 (swing 0 to 0.5). */
export function grooveCc(swing: number): number {
  return Math.max(0, Math.min(127, Math.round((swing / 0.5) * 127)));
}

/**
 * Everything Ableton should be told about ADMI's sound right now. Pure, so the engine sends
 * only the values that changed, and the screen can show and resend the same plan.
 */
export function abletonPlan(input: AbletonPlanInput): AbletonPlan {
  const controls = new Map<string, AbletonControl>();
  const shares = new Map<string, { channel: number; withId: string }>();
  const chains = new Map<number, number>();
  const set = (channel: number, cc: number, value: number): void => {
    controls.set(controlKey(channel, cc), { channel, cc, value: Math.max(0, Math.min(127, Math.round(value))) });
  };
  const world = worldOf(input.world);
  const opts = { channelMode: input.channelMode, colourChannels: input.colourChannels };
  const owner = new Map<number, string>();
  for (const ch of input.channels) {
    if (!hasColourChannel(ch.role)) continue;
    const channel = channelFor({ role: ch.role, origin: 'placed', colour: ch.id }, opts);
    if (channel === null) continue;
    const first = owner.get(channel);
    if (first !== undefined) {
      shares.set(ch.id, { channel, withId: first });
      continue;
    }
    owner.set(channel, ch.id);
    const evolved = input.evolveVoices?.get(ch.id) ?? null;
    const chain = chainOnChannel(ch, channel, input.world, { channelMode: input.channelMode, loopChannels: input.loopChannels }, evolved);
    if (chain === null) continue;
    chains.set(channel, chain);
    set(channel, CHAIN_CC, chainCcValue(chain, channel));
    set(channel, CC_LOUD, stepCc(LOUD, ch.volume ?? 1));
    set(channel, CC_BRIGHT, stepCc(BRIGHT, ch.tone ?? 1));
    set(channel, CC_SPACE, stepCc(SPACE_SEND, ch.reverbSend ?? world?.reverbSend ?? 0.18));
  }
  // The band, the Extra notes and the drums follow the World. They have no card, so their
  // Bright and Space rest at open and the World's reverb: the Tone and Reverb counters move
  // them, and this is where they come back to when the counter is lifted.
  const w = worldChain(input.world);
  const followers = [ROLE_CHANNEL.drums, BAND_PAD_CHANNEL, BAND_BASS_CHANNEL, EXTRA_NOTES_CHANNEL, ...(input.loopChannels ? LOOP_CHANNELS : [])];
  for (const channel of followers) {
    chains.set(channel, w);
    set(channel, CHAIN_CC, chainCcValue(w, channel));
    set(channel, CC_BRIGHT, 127);
    set(channel, CC_SPACE, stepCc(SPACE_SEND, world?.reverbSend ?? 0.18));
  }
  set(VOLUME_CHANNEL, CC_ENERGY, stepCc(ENERGY, input.energy));
  set(VOLUME_CHANNEL, CC_SPACE_ALL, stepCc(SPACE_ALL, input.space));
  set(VOLUME_CHANNEL, CC_GROOVE, grooveCc(input.swing));
  return { controls, shares, chains };
}

/** The control counters (Tone, Reverb, Delay) as CC 25, 26, 27 on every sounding channel. */
export function counterControls(
  sounding: readonly number[], values: { tone?: number; reverb?: number; delay?: number },
): AbletonControl[] {
  const out: AbletonControl[] = [];
  const add = (cc: number, v: number | undefined): void => {
    if (v === undefined) return;
    for (const channel of sounding) out.push({ channel, cc, value: gainToCc(v) });
  };
  add(CC_BRIGHT, values.tone);
  add(CC_SPACE, values.reverb);
  add(CC_ECHO, values.delay);
  return out;
}

/** Only the values that differ from what was last sent (all of them when `full`). */
export function changedControls(
  plan: ReadonlyMap<string, AbletonControl>, sent: ReadonlyMap<string, number>, full = false,
): AbletonControl[] {
  const out: AbletonControl[] = [];
  for (const [key, c] of plan) if (full || sent.get(key) !== c.value) out.push(c);
  return out;
}

/** The chain's name as the screen shows it: "Harp (chain 7)", counting from 1. */
export function chainLabel(index: number): string {
  const c = ABLETON_CHAINS[index];
  return c ? `${c.name} (chain ${index + 1})` : `chain ${index + 1}`;
}

const TRACK_NAMES: Record<number, string> = {
  [ROLE_CHANNEL.drums]: 'Drums', [BAND_PAD_CHANNEL]: 'Band chords', [BAND_BASS_CHANNEL]: 'Band bass', [EXTRA_NOTES_CHANNEL]: 'Extra notes',
};

/**
 * Phase 2's things to map in the template, in order: on each channel its Rack's Chain
 * selector (CC 30), then on each colour's channel Loud, Bright and Space (CC 24 to 26),
 * on the other channels Bright and Space for the counters, then on channel 16 Space (to Return A), Energy and Groove. Each is left at the value
 * ADMI wants now, so mapping never jumps the sound.
 */
export function abletonMappingTargets(plan: AbletonPlan, names: ReadonlyMap<number, string> = new Map()): MappingTarget[] {
  const nameOf = (ch: number): string => names.get(ch) ?? TRACK_NAMES[ch] ?? (LOOP_CHANNELS.includes(ch) ? `Loop ${LOOP_CHANNELS.indexOf(ch) + 1}` : 'Colour');
  const value = (ch: number, cc: number): number | undefined => plan.controls.get(controlKey(ch, cc))?.value;
  const out: MappingTarget[] = [];
  const chainChannels = [...plan.chains.keys()].sort((a, b) => a - b);
  for (const ch of chainChannels) out.push({ channel: ch, cc: CHAIN_CC, value: value(ch, CHAIN_CC), what: `${nameOf(ch)} (ch ${ch}): Rack Chain selector` });
  const macro: [number, string][] = [[CC_LOUD, 'Loud (a Utility Gain)'], [CC_BRIGHT, 'Bright (a filter)'], [CC_SPACE, 'Space (Send A)']];
  const counters: [number, string][] = [[CC_BRIGHT, 'Bright (a filter), for the Tone counter'], [CC_SPACE, 'Space (Send A), for the Reverb counter']];
  for (const ch of chainChannels) {
    const list = value(ch, CC_LOUD) !== undefined ? macro : counters;
    for (const [cc, what] of list) {
      if (value(ch, cc) === undefined) continue;
      out.push({ channel: ch, cc, value: value(ch, cc), what: `${nameOf(ch)} (ch ${ch}): ${what}` });
    }
  }
  out.push({ channel: VOLUME_CHANNEL, cc: CC_SPACE_ALL, value: value(VOLUME_CHANNEL, CC_SPACE_ALL), what: 'Space (ch 16): Return A level' });
  out.push({ channel: VOLUME_CHANNEL, cc: CC_ENERGY, value: value(VOLUME_CHANNEL, CC_ENERGY), what: 'Energy (ch 16): optional macro' });
  out.push({ channel: VOLUME_CHANNEL, cc: CC_GROOVE, value: value(VOLUME_CHANNEL, CC_GROOVE), what: 'Groove (ch 16): optional' });
  return out;
}

/**
 * ▶ Hear in Ableton: the colour's chain chosen on its channel (when given, as the CC 30
 * value), then the phrase's notes there, each with its Note Off.
 */
export function previewEvents(
  channel: number, chainCc: number | null, notes: readonly { midi: number; atMs: number; durMs: number }[],
): MidiEvent[] {
  const ch = (channel - 1) & 0x0f;
  const out: MidiEvent[] = [];
  if (chainCc !== null) out.push({ data: [0xb0 | ch, CHAIN_CC, chainCc], atMs: 0 });
  for (const n of notes) {
    out.push({ data: [0x90 | ch, n.midi, 100], atMs: n.atMs });
    out.push({ data: [0x80 | ch, n.midi, 0], atMs: n.atMs + n.durMs });
  }
  return out;
}
