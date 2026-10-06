/**
 * MIDI out from the board: every note the board plays, as MIDI, at the moment it sounds.
 *
 * ADMI is the controller; the sound can live anywhere — a synth, a DAW, a hardware
 * instrument. Each part has its own channel (melody 1, bass 2, chords 3, drums 10 in
 * General MIDI) so the receiving end can give each its own instrument. What is sent is
 * the player's choice: their own notes only (placed counters and the phrases they start),
 * or everything the board plays, fill and band included.
 *
 * Timing: a note is scheduled in audio-context time; Web MIDI takes a performance.now()
 * timestamp, so each message is converted and handed to the port ahead of time. The port
 * then sends it at that moment, the same way the audio engine does — no extra lag from
 * the frame loop.
 */

import { MIDIManager } from './MIDIManager';
import { DEFAULT_CHANNEL_ASSIGNMENT } from './types';
import { KIT_GM_NOTE } from './gmDrums';
import { audioTimeToPerformanceMs, type AudibleClockSource } from '../songs/audibleTime';
import type { FiredNote } from '../songs/BoardSequencerEngine';

export type MidiSends = 'player' | 'all';

export interface BoardMidiOptions {
  enabled: boolean;
  sends: MidiSends;
  /** 0–1: how hard the notes arrive; 1 = the board's own velocity. */
  velocityScale?: number;
}

/** The MIDI channel for each part (1-based, as musicians count them). */
export const ROLE_CHANNEL: Record<'melody' | 'bass' | 'chord' | 'drums', number> = {
  melody: DEFAULT_CHANNEL_ASSIGNMENT.melody,
  bass: DEFAULT_CHANNEL_ASSIGNMENT.bass,
  chord: DEFAULT_CHANNEL_ASSIGNMENT.chord,
  drums: DEFAULT_CHANNEL_ASSIGNMENT.drums,
};

export interface MidiEvent {
  data: number[];
  /** When to send, in performance.now() milliseconds. */
  atMs: number;
}

/** A note as the engine logs it: what is needed to say it in MIDI. */
export type MidiNoteLike = Pick<FiredNote, 'role' | 'origin' | 'audioTime' | 'durSec' | 'velocity' | 'midi' | 'midis' | 'drum'>;

const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;
const CONTROL_CHANGE = 0xb0;
const CC_ALL_NOTES_OFF = 123;
/** A drum hit is a trigger: its note off follows quickly whatever the board's length. */
const DRUM_OFF_MS = 60;
/** The shortest a note off waits, so a very short note still registers. */
const MIN_NOTE_MS = 30;

/** Whether a note's origin is one the player chose to send. */
export function sentBy(origin: FiredNote['origin'], sends: MidiSends): boolean {
  if (sends === 'all') return true;
  return origin === undefined || origin === 'placed' || origin === 'phrase';
}

/** The MIDI messages for one note the board played. */
export function midiEventsFor(
  note: MidiNoteLike, opts: BoardMidiOptions, toMs: (audioTime: number) => number,
): MidiEvent[] {
  if (!opts.enabled || !sentBy(note.origin, opts.sends)) return [];
  const role = note.role;
  if (role !== 'melody' && role !== 'bass' && role !== 'chord' && role !== 'drums') return [];
  const ch = (ROLE_CHANNEL[role] - 1) & 0x0f;
  const vel = Math.max(1, Math.min(127, Math.round((note.velocity ?? 0.7) * (opts.velocityScale ?? 1) * 127)));
  const onMs = toMs(note.audioTime);
  const out: MidiEvent[] = [];
  if (role === 'drums') {
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
  for (const p of pitches) {
    const n = Math.max(0, Math.min(127, Math.round(p)));
    out.push({ data: [NOTE_ON | ch, n, vel], atMs: onMs });
    out.push({ data: [NOTE_OFF | ch, n, 0], atMs: offMs });
  }
  return out;
}

/** "All notes off" on every channel the board uses, for Stop and Mute. */
export function allNotesOffEvents(atMs: number): MidiEvent[] {
  return [...new Set(Object.values(ROLE_CHANNEL))].map((channel) => ({
    data: [CONTROL_CHANGE | ((channel - 1) & 0x0f), CC_ALL_NOTES_OFF, 0], atMs,
  }));
}

/** Sends the board's notes to the MIDI output the player chose (see MIDIManager). */
export class BoardMidiSender {
  constructor(private readonly ctx: AudibleClockSource) {}

  send(note: MidiNoteLike, muted: boolean, opts: BoardMidiOptions): void {
    if (!opts.enabled || muted) return;
    const out = MIDIManager.getSelectedOutput();
    if (!out) return;
    const now = performance.now();
    for (const ev of midiEventsFor(note, opts, (t) => audioTimeToPerformanceMs(this.ctx, t, now))) {
      try {
        out.send(ev.data, Math.max(now, ev.atMs));
      } catch (err) {
        console.warn('[BoardMidi] could not send:', err);
      }
    }
  }

  allNotesOff(): void {
    const out = MIDIManager.getSelectedOutput();
    if (!out) return;
    for (const ev of allNotesOffEvents(performance.now())) {
      try {
        out.send(ev.data);
      } catch {
        /* the port has gone: nothing to silence */
      }
    }
  }
}
