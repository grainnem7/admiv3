/**
 * MIDI out from the board: every note the board plays, as MIDI, at the moment it sounds.
 *
 * ADMI is the brain; the sound can live anywhere: a synth, a DAW (Ableton Live through a
 * loopMIDI port), a hardware instrument. "Sound from" says where the sound comes from:
 * ADMI's own engine, Ableton, or both at once. It is stored as the two flags the board
 * already had (midiEnabled, midiKeepSound), so older saves load unchanged.
 *
 * Channels: one per part (melody 1, bass 2, chords 3, drums 10 in General MIDI), or one
 * fixed channel per colour, so two melody colours can have two instruments. The band and
 * the Extra notes always have their own channels (band chords 11, band bass 12, Extra
 * notes 13) so they can be mixed apart; every drum hit stays on 10, so one Drum Rack plays
 * them all. Channel 16 carries the Volume counter as CC 7.
 *
 * Timing: a note is scheduled in audio-context time; Web MIDI takes a performance.now()
 * timestamp, so each message is converted and handed to the port ahead of time. The port
 * then sends it at that moment, the same way the audio engine does: no extra lag from
 * the frame loop.
 *
 * Releasing: Chrome cannot take back a message already queued for later
 * (MIDIOutput.clear() is not implemented) and Ableton's instruments do not reliably
 * honour CC 123. So the sender remembers every note whose Note Off is still to come and,
 * on a release, sends each one its own Note Off, then CC 123 and CC 120, and does it all
 * once more a moment later for the notes that were queued and have only just begun.
 */

import { MIDIManager } from './MIDIManager';
import { DEFAULT_CHANNEL_ASSIGNMENT } from './types';
import { KIT_GM_NOTE } from './gmDrums';
import { audioTimeToPerformanceMs, type AudibleClockSource } from '../songs/audibleTime';
import type { FiredNote } from '../songs/BoardSequencerEngine';
import type { ColourChannel } from '../tracking/boardColours';

export type MidiSends = 'player' | 'all';
/** Where the sound comes from: ADMI's own engine, the MIDI port (Ableton), or both. */
export type SoundFrom = 'admi' | 'ableton' | 'both';
/** One channel per part, or one fixed channel per colour. */
export type MidiChannelMode = 'part' | 'colour';

export interface BoardMidiOptions {
  enabled: boolean;
  sends: MidiSends;
  /** 0 to 1: how hard the notes arrive; 1 = the board's own velocity. */
  velocityScale?: number;
  channelMode?: MidiChannelMode;
  /** Per colour mode: each colour's fixed channel. */
  colourChannels?: ReadonlyMap<string, number>;
  /** How much earlier than its moment a message is sent, in ms (see clampLeadMs). */
  leadMs?: number;
  /** Each loop's melody, bass and chords on its own channel (4 to 9), for a fader per loop. */
  loopChannels?: boolean;
  /** Shape: each melody and chord note sends its swell as CC 2 (see swellEvents). */
  shape?: boolean;
}

/** The MIDI channel for each part (1 based, as musicians count them). */
export const ROLE_CHANNEL: Record<'melody' | 'bass' | 'chord' | 'drums', number> = {
  melody: DEFAULT_CHANNEL_ASSIGNMENT.melody,
  bass: DEFAULT_CHANNEL_ASSIGNMENT.bass,
  chord: DEFAULT_CHANNEL_ASSIGNMENT.chord,
  drums: DEFAULT_CHANNEL_ASSIGNMENT.drums,
};
/** The band's chords and pad, and the ending's final chord. */
export const BAND_PAD_CHANNEL = 11;
/** The band's bass, and the final chord's bass note. */
export const BAND_BASS_CHANNEL = 12;
/** The Extra notes (the fill, from Magenta or the rules), when pitched. */
export const EXTRA_NOTES_CHANNEL = 13;
/** The whole instrument: the Volume counter as CC 7. */
export const VOLUME_CHANNEL = 16;
/**
 * One channel per colour, grouped by job: each Ableton track has a fixed job, so it only
 * needs that job's sounds, and fresh colours each session always land on a track that has
 * them. Melody colours take 1, 14 and 15 in turn; bass 2; chords 3. Never 4 to 9 (the
 * loops' own channels) or 16 (the whole instrument), so it works with loop faders on or off.
 */
export const COLOUR_JOB_CHANNELS: Record<'melody' | 'bass' | 'chord', readonly number[]> = {
  melody: [1, 14, 15],
  bass: [2],
  chord: [3],
};
/** Loops 1 to 6 on their own channels (loop 7 and after share channel 9). */
export const LOOP_CHANNELS: readonly number[] = [4, 5, 6, 7, 8, 9];

/** A loop slot's channel (0 based slot). */
export function loopChannel(slot: number): number {
  return LOOP_CHANNELS[Math.max(0, Math.min(LOOP_CHANNELS.length - 1, Math.floor(slot)))];
}

/** The loop slot a cell's layer belongs to ('slot2' launched, 'bank2' a pad), or null for the player's board. */
export function loopSlotOf(layer: string | undefined): number | null {
  const m = layer ? /^(slot|bank)(\d+)$/.exec(layer) : null;
  return m ? Number(m[2]) : null;
}

/**
 * The most "Send early by" can be. Notes are scheduled at most 100 ms ahead and the
 * scheduler looks every 25 ms, so a note can be handed over as little as about 75 ms
 * before it sounds; 40 ms stays well inside that.
 */
export const MAX_MIDI_LEAD_MS = 40;
/** The second release follows the first by more than the look ahead, so queued notes have begun. */
export const RELEASE_REPEAT_MS = 120;
/** How often a fade is sent as CC 11. */
export const EXPRESSION_STEP_SEC = 0.05;

export interface MidiEvent {
  data: number[];
  /** When to send, in performance.now() milliseconds. */
  atMs: number;
}

/** A note as the engine logs it: what is needed to say it in MIDI. */
export type MidiNoteLike = Pick<FiredNote, 'role' | 'origin' | 'audioTime' | 'durSec' | 'velocity' | 'midi' | 'midis' | 'drum'> & {
  colour?: string;
  loopSlot?: number;
};

/** A note sent whose Note Off is still to come. */
export interface HeldNote {
  channel: number;
  pitch: number;
  offAtMs: number;
}

const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;
const CONTROL_CHANGE = 0xb0;
const CC_VOLUME = 7;
const CC_EXPRESSION = 11;
const CC_ALL_SOUND_OFF = 120;
const CC_ALL_NOTES_OFF = 123;
/** A drum hit is a trigger: its note off follows quickly whatever the board's length. */
const DRUM_OFF_MS = 60;
/** The shortest a note off waits, so a very short note still registers. */
const MIN_NOTE_MS = 30;
/**
 * Shape (sound design pass): a player never holds a note at one level. Each melody or chord
 * note sends a swell on CC 2, which the template maps to a Utility named Shape (−6 to 0 dB)
 * after the instrument: a held note starts a little under, grows to full by about two
 * fifths of its length and eases back at the end; a short note simply starts near full.
 * CC 2 rests at full, so without the mapping nothing changes.
 */
export const SHAPE_CC = 2;
/** A note at least this long swells. */
export const SWELL_MIN_SEC = 0.6;
export const SHAPE_REST = 127;

/** The swell for one note on a channel: where it starts, its peak, and where it eases to. */
export function swellEvents(channel: number, onMs: number, offMs: number): MidiEvent[] {
  const ch = (channel - 1) & 0x0f;
  const len = offMs - onMs;
  if (len < SWELL_MIN_SEC * 1000) return [{ data: [CONTROL_CHANGE | ch, SHAPE_CC, 118], atMs: onMs }];
  return [
    { data: [CONTROL_CHANGE | ch, SHAPE_CC, 72], atMs: onMs },
    { data: [CONTROL_CHANGE | ch, SHAPE_CC, 100], atMs: onMs + 0.2 * len },
    { data: [CONTROL_CHANGE | ch, SHAPE_CC, SHAPE_REST], atMs: onMs + 0.4 * len },
    { data: [CONTROL_CHANGE | ch, SHAPE_CC, 108], atMs: onMs + 0.85 * len },
  ];
}

/** A pitched extra note's least MIDI velocity, as a fraction of 127. */
export const FILL_MIDI_FLOOR = 0.38;
/**
 * Note offs are sent this far ahead of when they are due; until then they wait (see
 * BoardMidiSender). Shorter than the engine's look ahead (notes are handed over at least
 * about 75 ms before they sound), so by the time an off goes out, every note that could
 * restrike its pitch before it has already been seen.
 */
export const OFF_SEND_AHEAD_MS = 50;
/** How often the waiting note offs are looked at between notes. */
export const OFF_FLUSH_EVERY_MS = 20;
/** Two hits of the same drum closer than this are one hit. */
export const DRUM_FLAM_MS = 15;
/** The test note: a C an octave above middle C on the melody channel. */
const TEST_NOTE = 72;
const TEST_NOTE_MS = 250;

// ---- Sound from ----

/** The choice the two stored flags describe. */
export function configToSoundFrom(c: { midiEnabled: boolean; midiKeepSound: boolean }): SoundFrom {
  if (!c.midiEnabled) return 'admi';
  return c.midiKeepSound ? 'both' : 'ableton';
}

/** The two stored flags for a choice. */
export function soundFromToConfig(choice: SoundFrom): { midiEnabled: boolean; midiKeepSound: boolean } {
  if (choice === 'ableton') return { midiEnabled: true, midiKeepSound: false };
  if (choice === 'both') return { midiEnabled: true, midiKeepSound: true };
  return { midiEnabled: false, midiKeepSound: true };
}

/** What actually sounds: ADMI's own engine, the MIDI port, and whether that is a fallback. */
export interface SoundRoute {
  internal: boolean;
  midi: boolean;
  /** Ableton or Both was chosen, but ADMI is playing on its own (the port is missing, or not yet switched back). */
  fellBack: boolean;
}

/**
 * The fallback rule. A show can never go silent because of Ableton: if the port is not
 * there, ADMI's own sound plays, whatever was chosen. `holdOnAdmi` keeps it there after
 * the port comes back, until someone presses "switch to it", so the sound never jumps
 * twice in a piece.
 */
export function effectiveSound(
  cfg: { midiEnabled: boolean; midiKeepSound: boolean; midiDeviceId: string },
  portConnected: boolean,
  holdOnAdmi = false,
): SoundRoute {
  const choice = configToSoundFrom(cfg);
  if (choice === 'admi') return { internal: true, midi: false, fellBack: false };
  if (!portConnected || cfg.midiDeviceId === '' || holdOnAdmi) return { internal: true, midi: false, fellBack: true };
  return { internal: choice === 'both', midi: true, fellBack: false };
}

/** In Ableton mode everything the board plays is sent; in Both, the player's choice stands. */
export function sendsFor(choice: SoundFrom, sends: MidiSends): MidiSends {
  return choice === 'ableton' ? 'all' : sends;
}

/** Whether a note's origin is one the player chose to send. */
export function sentBy(origin: FiredNote['origin'], sends: MidiSends): boolean {
  if (sends === 'all') return true;
  return origin === undefined || origin === 'placed' || origin === 'phrase';
}

// ---- Channels ----

function isChannel(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 16;
}

/** The parts that can have a channel of their own in per colour mode. */
export function hasColourChannel(role: string): boolean {
  return role === 'melody' || role === 'bass' || role === 'chord';
}

/**
 * The channel a note goes out on, or null for a role that makes no sound. Drums are
 * always 10; the band and the Extra notes always their own; otherwise the part's channel,
 * or the colour's own in per colour mode.
 */
export function channelFor(
  note: { role: string; origin?: FiredNote['origin']; colour?: string; loopSlot?: number },
  opts: Pick<BoardMidiOptions, 'channelMode' | 'colourChannels' | 'loopChannels'> = {},
): number | null {
  const role = note.role;
  if (role !== 'melody' && role !== 'bass' && role !== 'chord' && role !== 'drums') return null;
  if (role === 'drums') return ROLE_CHANNEL.drums;
  // The big finish's hit sounds on the parts' own tracks too, so every instrument is in it.
  if (note.origin === 'band' && note.colour?.startsWith('ending:')) return ROLE_CHANNEL[role];
  if (note.origin === 'band') return role === 'bass' ? BAND_BASS_CHANNEL : BAND_PAD_CHANNEL;
  if (note.origin === 'fill') return EXTRA_NOTES_CHANNEL;
  // A loop's melody, bass and chords on the loop's own channel, for its own fader.
  if (opts.loopChannels && note.loopSlot !== undefined) return loopChannel(note.loopSlot);
  if (opts.channelMode === 'colour' && note.colour !== undefined) {
    const own = opts.colourChannels?.get(note.colour);
    if (isChannel(own)) return own;
  }
  return ROLE_CHANNEL[role];
}

/**
 * Each sounding colour's channel in per colour mode: by its job and its place among that
 * job's colours in the colour list. A colour beyond its job's channels shares the last one.
 * A colour's stored `midiChannel` (from before channels went by job) is not read.
 */
export function colourChannelMap(channels: readonly ColourChannel[]): Map<string, number> {
  const map = new Map<string, number>();
  const taken = { melody: 0, bass: 0, chord: 0 };
  for (const c of channels) {
    if (c.role !== 'melody' && c.role !== 'bass' && c.role !== 'chord') continue;
    const pool = COLOUR_JOB_CHANNELS[c.role];
    map.set(c.id, pool[Math.min(taken[c.role], pool.length - 1)]);
    taken[c.role] += 1;
  }
  return map;
}

/** Channels two or more sounding colours share, with those colours' ids. */
export function sharedColourChannels(channels: readonly ColourChannel[]): Map<number, string[]> {
  const by = new Map<number, string[]>();
  for (const [id, ch] of colourChannelMap(channels)) by.set(ch, [...(by.get(ch) ?? []), id]);
  for (const [ch, ids] of by) if (ids.length < 2) by.delete(ch);
  return by;
}

/** Every channel the board may be sounding on: the parts, the band, the Extra notes, the colours' and the loops'. */
export function channelsInUse(colourChannels?: ReadonlyMap<string, number>, loopChannels = false): number[] {
  const set = new Set<number>([
    ROLE_CHANNEL.melody, ROLE_CHANNEL.bass, ROLE_CHANNEL.chord, ROLE_CHANNEL.drums,
    BAND_PAD_CHANNEL, BAND_BASS_CHANNEL, EXTRA_NOTES_CHANNEL,
  ]);
  for (const ch of colourChannels?.values() ?? []) if (isChannel(ch)) set.add(ch);
  if (loopChannels) for (const ch of LOOP_CHANNELS) set.add(ch);
  return [...set].sort((a, b) => a - b);
}

/** One thing Ableton can learn in MIDI Map Mode: a controller on one channel. */
export interface MappingTarget {
  channel: number;
  cc: number;
  /** Where the control is left after mapping (the value ADMI wants now); see sendForMapping. */
  value?: number;
  /** What it is for, in the words of the template's track names. */
  what: string;
}

const PART_NAMES: Record<number, string> = {
  [ROLE_CHANNEL.melody]: 'Melody',
  [ROLE_CHANNEL.bass]: 'Bass',
  [ROLE_CHANNEL.chord]: 'Chords',
  [ROLE_CHANNEL.drums]: 'Drums',
  [BAND_PAD_CHANNEL]: 'Band chords',
  [BAND_BASS_CHANNEL]: 'Band bass',
  [EXTRA_NOTES_CHANNEL]: 'Extra notes',
  14: 'Melody 2',
  15: 'Melody 3',
};

/**
 * Everything to map in the Ableton template, in order: Expression (CC 11) on each channel
 * in use, one at a time (Ableton learns from the last message it hears, so they can't
 * all arrive at once), then Volume (CC 7) on channel 16 for the Master.
 */
export function mappingTargets(colourChannels?: ReadonlyMap<string, number>, loopChannels = false): MappingTarget[] {
  const loopName = (channel: number): string | null => {
    const i = loopChannels ? LOOP_CHANNELS.indexOf(channel) : -1;
    return i < 0 ? null : i === LOOP_CHANNELS.length - 1 ? `Loop ${i + 1} and after` : `Loop ${i + 1}`;
  };
  // One per colour: every colour track, so tracks 14 and 15 are mapped once even if fewer
  // melody colours exist today (fresh colours next session may need them).
  const allColourTracks = colourChannels ? new Map(Object.values(COLOUR_JOB_CHANNELS).flat().map((ch) => [`track${ch}`, ch])) : undefined;
  const out: MappingTarget[] = channelsInUse(allColourTracks ?? colourChannels, loopChannels).map((channel) => ({
    channel, cc: 11, what: `${loopName(channel) ?? PART_NAMES[channel] ?? 'Colour'} (ch ${channel}): Utility Gain`,
  }));
  out.push({ channel: VOLUME_CHANNEL, cc: 7, what: `Volume (ch ${VOLUME_CHANNEL}): Main track volume` });
  return out;
}

// ---- Timing ----

/** "Send early by", made safe: 0 to MAX_MIDI_LEAD_MS whole milliseconds. */
export function clampLeadMs(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(MAX_MIDI_LEAD_MS, Math.round(v)));
}

/** When a message goes: its moment less the lead, but never before now. */
export function sendAtMs(atMs: number, nowMs: number, leadMs: number | undefined): number {
  return Math.max(nowMs, atMs - clampLeadMs(leadMs));
}

// ---- Messages ----

/** The MIDI messages for one note the board played. */
export function midiEventsFor(
  note: MidiNoteLike, opts: BoardMidiOptions, toMs: (audioTime: number) => number,
): MidiEvent[] {
  if (!opts.enabled || !sentBy(note.origin, opts.sends)) return [];
  const channel = channelFor(note, opts);
  if (channel === null) return [];
  const ch = (channel - 1) & 0x0f;
  // A pitched extra note is soft in ADMI's own mix by its gain, but a sampled instrument
  // hears velocity, and 0.15 of 127 is a note nobody hears (sound design pass): extra notes
  // go out between about 48 and 127, their own level then set by the Extra notes fader.
  const raw = note.velocity ?? 0.7;
  const shaped = note.origin === 'fill' && note.drum === undefined ? FILL_MIDI_FLOOR + (1 - FILL_MIDI_FLOOR) * raw : raw;
  const vel = Math.max(1, Math.min(127, Math.round(shaped * (opts.velocityScale ?? 1) * 127)));
  const onMs = toMs(note.audioTime);
  const out: MidiEvent[] = [];
  if (note.role === 'drums') {
    if (!note.drum) return [];
    const pitches = note.drum === 'kickCrash' ? [KIT_GM_NOTE.kick, KIT_GM_NOTE.crash] : [KIT_GM_NOTE[note.drum]];
    for (const p of pitches) {
      out.push({ data: [NOTE_ON | ch, p, vel], atMs: onMs });
      out.push({ data: [NOTE_OFF | ch, p, 0], atMs: onMs + DRUM_OFF_MS });
    }
    return out;
  }
  const pitches = note.midis ?? (note.midi !== undefined ? [note.midi] : []);
  const offMs = onMs + Math.max(MIN_NOTE_MS, note.durSec * 1000);
  // The swell goes first, so the note starts at its shape (the player's and the loops'
  // melody and chords; the band, the extra notes and the bass keep their own level).
  const swells = opts.shape === true && (note.role === 'melody' || note.role === 'chord')
    && note.origin !== 'band' && note.origin !== 'fill' && pitches.length > 0;
  if (swells) out.push(...swellEvents(channel, onMs - 1, offMs));
  for (const p of pitches) {
    const n = Math.max(0, Math.min(127, Math.round(p)));
    out.push({ data: [NOTE_ON | ch, n, vel], atMs: onMs });
    out.push({ data: [NOTE_OFF | ch, n, 0], atMs: offMs });
  }
  return out;
}

/** A gain (0 to 1) as a controller value (0 to 127). */
export function gainToCc(gain: number): number {
  if (!Number.isFinite(gain)) return 0;
  return Math.max(0, Math.min(127, Math.round(gain * 127)));
}

/** One controller value on each of the channels. */
export function controlEvents(channels: readonly number[], cc: number, value: number, atMs: number): MidiEvent[] {
  const v = Math.max(0, Math.min(127, Math.round(value)));
  return channels.map((channel) => ({ data: [CONTROL_CHANGE | ((channel - 1) & 0x0f), cc, v], atMs }));
}

/** CC 11 (Expression): the ending's fade and Mute, on every channel in use. */
export function expressionEvents(channels: readonly number[], value: number, atMs: number): MidiEvent[] {
  return controlEvents(channels, CC_EXPRESSION, value, atMs);
}

/** CC 7 on channel 16: the Volume counter, mapped in Ableton to the Master volume. */
export function volumeEvent(level: number, atMs: number): MidiEvent {
  return controlEvents([VOLUME_CHANNEL], CC_VOLUME, gainToCc(level), atMs)[0];
}

/** Remember the notes a batch starts, and forget the ones that have ended by now. */
export function trackHeld(held: Map<string, HeldNote>, events: readonly MidiEvent[], nowMs: number): void {
  for (const [key, h] of held) if (h.offAtMs <= nowMs) held.delete(key);
  for (const ev of events) {
    if ((ev.data[0] & 0xf0) !== NOTE_OFF) continue;
    const channel = (ev.data[0] & 0x0f) + 1;
    const pitch = ev.data[1];
    const key = `${channel}:${pitch}`;
    const was = held.get(key);
    if (!was || was.offAtMs < ev.atMs) held.set(key, { channel, pitch, offAtMs: ev.atMs });
  }
}

/** Release: a Note Off for each held note, then CC 123 and CC 120 on each channel. */
export function releaseEvents(held: readonly HeldNote[], channels: readonly number[], atMs: number): MidiEvent[] {
  const out: MidiEvent[] = held.map((h) => ({ data: [NOTE_OFF | ((h.channel - 1) & 0x0f), h.pitch, 0], atMs }));
  out.push(...controlEvents(channels, CC_ALL_NOTES_OFF, 0, atMs));
  out.push(...controlEvents(channels, CC_ALL_SOUND_OFF, 0, atMs));
  return out;
}

/** Panic: the same release on all 16 channels. */
export function panicEvents(held: readonly HeldNote[], atMs: number): MidiEvent[] {
  return releaseEvents(held, Array.from({ length: 16 }, (_, i) => i + 1), atMs);
}

/** "All notes off" on every channel the board uses (CC 123 only). */
export function allNotesOffEvents(atMs: number, channels: readonly number[] = channelsInUse()): MidiEvent[] {
  return controlEvents(channels, CC_ALL_NOTES_OFF, 0, atMs);
}

/** The test note: one note on a channel (a snare on the drums, a low note on the basses). */
export function testNoteEvents(atMs: number, channel: number = ROLE_CHANNEL.melody): MidiEvent[] {
  const ch = (channel - 1) & 0x0f;
  const pitch = channel === ROLE_CHANNEL.drums ? KIT_GM_NOTE.snare
    : channel === ROLE_CHANNEL.bass || channel === BAND_BASS_CHANNEL ? TEST_NOTE - 24 : TEST_NOTE;
  return [
    { data: [NOTE_ON | ch, pitch, 100], atMs },
    { data: [NOTE_OFF | ch, pitch, 0], atMs: atMs + TEST_NOTE_MS },
  ];
}

/** The channels the test note visits in turn, so a missing Ableton track is heard as a gap. */
export const TEST_CHANNELS: readonly number[] = [
  ROLE_CHANNEL.melody, ROLE_CHANNEL.bass, ROLE_CHANNEL.chord, ROLE_CHANNEL.drums,
  BAND_PAD_CHANNEL, BAND_BASS_CHANNEL, EXTRA_NOTES_CHANNEL,
];
/** Time between the test notes on each channel. */
export const TEST_GAP_MS = 600;

/** One test note on each channel in turn, TEST_GAP_MS apart, the first at `atMs`. */
export function testSequenceEvents(atMs: number, channels: readonly number[] = TEST_CHANNELS, gapMs = TEST_GAP_MS): MidiEvent[] {
  return channels.flatMap((ch, i) => testNoteEvents(atMs + i * gapMs, ch));
}

/** Sends the board's notes to the chosen MIDI output, while it is connected. */
/** CC 30: the Rack chain (see abletonSounds CHAIN_CC; kept here so this file needs nothing from there). */
const CHAIN_SELECT_CC = 30;

export class BoardMidiSender {
  private readonly held = new Map<string, HeldNote>();
  /**
   * Note offs that are not yet due, by channel and pitch. A note off queued at once could
   * not be taken back: when the same note was struck again before it, the old note off
   * arrived later and cut the new note short (the bass and the held chords' common tones,
   * sound design pass). So an off waits here until shortly before it is due, and a note
   * struck again ends the old one a moment before its own start instead.
   */
  private readonly pendingOffs = new Map<string, { ev: MidiEvent; leadMs?: number }>();
  /** The note ons recently sent for each channel and pitch (a few), so a note sent later but timed earlier never runs into one. */
  private readonly recentOns = new Map<string, number[]>();
  /** Swell points already sent: a chord tune sends each of its notes apart, and one swell is enough. */
  private readonly sentShape = new Set<string>();
  private offTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly ctx: AudibleClockSource) {}

  /** Send the waiting note offs due within the next moment (with their own times). */
  private flushOffs(nowMs: number): void {
    for (const [key, p] of this.pendingOffs) {
      if (p.ev.atMs - (p.leadMs ?? 0) <= nowMs + OFF_SEND_AHEAD_MS) {
        this.emit([p.ev], nowMs, p.leadMs);
        this.pendingOffs.delete(key);
      }
    }
    if (this.pendingOffs.size === 0 && this.offTimer !== null) { clearInterval(this.offTimer); this.offTimer = null; }
  }

  /** On a release: every waiting note off goes out now, at its own time, so no note queued ahead is left without one. */
  private sendPendingOffs(channels?: readonly number[]): void {
    const now = performance.now();
    for (const [key, p] of this.pendingOffs) {
      if (channels && !channels.includes((p.ev.data[0] & 0x0f) + 1)) continue;
      this.emit([p.ev], now, p.leadMs);
      this.pendingOffs.delete(key);
    }
  }

  private emit(events: readonly MidiEvent[], nowMs: number, leadMs?: number): void {
    const out = MIDIManager.getConnectedSelectedOutput();
    if (!out) return;
    for (const ev of events) {
      try {
        out.send(ev.data, sendAtMs(ev.atMs, nowMs, leadMs));
      } catch (err) {
        console.warn('[BoardMidi] could not send:', err);
      }
    }
  }

  private toMs(audioTime: number, nowMs: number): number {
    return audioTimeToPerformanceMs(this.ctx, audioTime, nowMs);
  }

  send(note: MidiNoteLike, muted: boolean, opts: BoardMidiOptions): void {
    if (!opts.enabled || muted) return;
    const now = performance.now();
    const all = midiEventsFor(note, opts, (t) => this.toMs(t, now));
    if (all.length === 0) return;
    const events = all.filter((ev) => {
      if ((ev.data[0] & 0xf0) !== CONTROL_CHANGE || ev.data[1] !== SHAPE_CC) return true;
      const key = `${ev.data[0] & 0x0f}|${Math.round(ev.atMs)}|${ev.data[2]}`;
      if (this.sentShape.has(key)) return false;
      if (this.sentShape.size > 512) this.sentShape.clear();
      this.sentShape.add(key);
      return true;
    });
    trackHeld(this.held, events, now);
    const keyOf = (ev: MidiEvent): string => `${(ev.data[0] & 0x0f) + 1}:${ev.data[1]}`;
    const isOff = (ev: MidiEvent): boolean => (ev.data[0] & 0xf0) === NOTE_OFF;
    const isOn = (ev: MidiEvent): boolean => (ev.data[0] & 0xf0) === NOTE_ON && (ev.data[2] ?? 0) > 0;
    // The same drum hit twice within a few ms (the groove's hat and an extra ghost hat on
    // the same sixteenth) is one hit, a flam otherwise (sound design pass).
    if (note.drum !== undefined && events.some((ev) => isOn(ev) && (this.recentOns.get(keyOf(ev)) ?? []).some((t) => Math.abs(t - ev.atMs) < DRUM_FLAM_MS))) return;
    for (const ev of events) {
      if (!isOn(ev)) continue;
      const waiting = this.pendingOffs.get(keyOf(ev));
      if (!waiting) continue;
      // The same note again: the old one ends a moment before the new strike, or at its own
      // time if that comes first, and never later.
      this.emit([{ data: waiting.ev.data, atMs: Math.min(waiting.ev.atMs, ev.atMs - 1) }], now, waiting.leadMs);
      this.pendingOffs.delete(keyOf(ev));
    }
    this.emit(events.filter((ev) => !isOff(ev)), now, opts.leadMs);
    const onAt = new Map<string, number>();
    for (const ev of events) if (isOn(ev)) onAt.set(keyOf(ev), ev.atMs);
    for (const ev of events) {
      if (!isOff(ev)) continue;
      const key = keyOf(ev);
      // A strike of the same pitch already sent, timed after this note starts and before it
      // ends (a note handed over later but timed earlier): this one ends just before it.
      const start = onAt.get(key);
      const later = start === undefined ? undefined
        : (this.recentOns.get(key) ?? []).filter((t) => t > start && t < ev.atMs).sort((a, b) => a - b)[0];
      const off = later !== undefined ? { ...ev, atMs: later - 1 } : ev;
      this.pendingOffs.set(key, { ev: off, leadMs: opts.leadMs });
    }
    for (const [key, at] of onAt) this.recentOns.set(key, [...(this.recentOns.get(key) ?? []), at].slice(-8));
    if (this.recentOns.size > 256) for (const [key, list] of this.recentOns) if (Math.max(...list) < now - 2000) this.recentOns.delete(key);
    this.flushOffs(now);
    if (this.pendingOffs.size > 0 && this.offTimer === null) {
      this.offTimer = setInterval(() => this.flushOffs(performance.now()), OFF_FLUSH_EVERY_MS);
    }
  }

  /** A controller value on each channel, at an audio time (default: now). */
  expression(value: number, channels: readonly number[], audioTime?: number): void {
    const now = performance.now();
    this.emit(expressionEvents(channels, value, audioTime === undefined ? now : this.toMs(audioTime, now)), now);
  }

  volume(level: number): void {
    const now = performance.now();
    this.emit([volumeEvent(level, now)], now);
  }

  /**
   * For mapping in Ableton: one controller on one channel, so Ableton (in MIDI Map Mode)
   * learns it. Expression ends at 0: a Utility's Gain reaches +35 dB at the top of a fresh
   * mapping, so it stays silent until the mapping's maximum is set to 0 dB and Play sends
   * 127. Volume ends at the Volume setting.
   */
  sendForMapping(target: MappingTarget, level = 1): void {
    const now = performance.now();
    const end = target.value ?? (target.cc === 7 ? gainToCc(level) : 0);
    this.emit([
      ...controlEvents([target.channel], target.cc, 64, now),
      ...controlEvents([target.channel], target.cc, end, now + 150),
    ], now);
  }

  /**
   * Controller values at an audio time: a loop's instrument switching on a pass boundary.
   * Where the chain changes, a note on that channel still waiting for its note off ends a
   * moment before the switch, so it is never left sounding on the old instrument (its note
   * off would go to the new one).
   */
  sendControlsAt(list: readonly { channel: number; cc: number; value: number }[], audioTime: number): void {
    if (list.length === 0) return;
    const now = performance.now();
    const at = Math.max(now, this.toMs(audioTime, now));
    const switching = new Set(list.filter((c) => c.cc === CHAIN_SELECT_CC).map((c) => c.channel));
    for (const [key, p] of this.pendingOffs) {
      const channel = (p.ev.data[0] & 0x0f) + 1;
      if (!switching.has(channel) || p.ev.atMs < at - 1) continue;
      this.emit([{ data: p.ev.data, atMs: at - 1 }], now, p.leadMs);
      this.pendingOffs.delete(key);
    }
    this.emit(list.flatMap((c) => controlEvents([c.channel], c.cc, c.value, at)), now);
  }

  /** Controller values on their channels, now (Phase 2: chains and macros). */
  sendControls(list: readonly { channel: number; cc: number; value: number }[]): void {
    if (list.length === 0) return;
    const now = performance.now();
    this.emit(list.flatMap((c) => controlEvents([c.channel], c.cc, c.value, now)), now);
  }

  /** The test note at an audio time, so it lands with ADMI's click; then one on each channel in turn. */
  testNote(audioTime: number, leadMs?: number, channels: readonly number[] = TEST_CHANNELS): void {
    const now = performance.now();
    const events = testSequenceEvents(this.toMs(audioTime, now), channels);
    trackHeld(this.held, events, now);
    this.emit(events, now, leadMs);
  }

  /** Only these channels' notes: a loop that has stopped, without touching the rest. */
  releaseChannels(channels: readonly number[]): void {
    this.sendPendingOffs(channels);
    const held: HeldNote[] = [];
    for (const [key, h] of this.held) {
      if (!channels.includes(h.channel)) continue;
      held.push(h);
      this.held.delete(key);
    }
    this.emit(releaseEvents(held, channels, performance.now()), performance.now());
    setTimeout(() => this.emit(releaseEvents(held, channels, performance.now()), performance.now()), RELEASE_REPEAT_MS);
  }

  /** Every note still sounding or queued: released now, and again a moment later. */
  releaseAll(channels: readonly number[]): void {
    this.releaseWith((held, at) => releaseEvents(held, channels, at));
  }

  /** Panic: the release on all 16 channels. */
  panic(): void {
    this.releaseWith(panicEvents);
  }

  /** Kept for the callers that only want silence on the board's channels. */
  allNotesOff(): void {
    this.releaseAll(channelsInUse());
  }

  private releaseWith(make: (held: HeldNote[], atMs: number) => MidiEvent[]): void {
    this.sendPendingOffs();
    const held = [...this.held.values()];
    this.held.clear();
    this.emit(make(held, performance.now()), performance.now());
    // Notes queued ahead start after the first release; this catches them. It runs even
    // if the engine has gone, because Stop disposes the engine at once.
    setTimeout(() => this.emit(make(held, performance.now()), performance.now()), RELEASE_REPEAT_MS);
  }
}
