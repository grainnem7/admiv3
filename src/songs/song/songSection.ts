/**
 * A section of a recorded song inside a Board Sequencer piece (spec 2026-11-06, song
 * sections): Elvis's voice for a verse, the board following the record's own beats.
 *
 * A song's map is its beats (seconds into the recording, every one) and its chords. Bar n
 * starts at beat 4n (the songs' analysis has four beats to every bar). A section is whole
 * bars, from one bar to another, with each stem at its own level. Pure.
 */

import type { ChordEntry } from '../voices/chordLookup';

export type StemName = 'vocals' | 'drums' | 'bass' | 'other';
export const STEM_NAMES: readonly StemName[] = ['vocals', 'drums', 'bass', 'other'];
export type StemLevels = Record<StemName, number>;

export const BEATS_PER_BAR = 4;

/** A scene's section of a song: which song, from which bar to which (the end bar not included), and the stems' levels. */
export interface SongSectionSpec {
  songId: string;
  fromBar: number;
  toBar: number;
  levels: StemLevels;
}

/** A song's beats and chords, as the engine follows them. */
export interface SongMap {
  /** Every beat, in seconds into the recording. */
  beats: readonly number[];
  chords: readonly ChordEntry[];
}

/** The section's beats: the first, and the one after its last (both indexes into the song's beats). */
export interface SectionBeats {
  first: number;
  end: number;
}

/** Where a section's beats are in the song; null when it has none. */
export function sectionBeats(map: SongMap, fromBar: number, toBar: number): SectionBeats | null {
  const first = Math.max(0, Math.round(fromBar) * BEATS_PER_BAR);
  const end = Math.min(map.beats.length, Math.round(toBar) * BEATS_PER_BAR);
  return end > first ? { first, end } : null;
}

/**
 * A beat's time in the song, any beat from 0 to the song's length: after the last mapped
 * beat, the last gap carries on (a section that runs to the end of the song ends a beat
 * after its last beat).
 */
export function songBeatTime(map: SongMap, k: number): number {
  const b = map.beats;
  if (b.length === 0) return 0;
  if (k < b.length) return b[Math.max(0, k)];
  const gap = b.length > 1 ? b[b.length - 1] - b[b.length - 2] : 0.5;
  return b[b.length - 1] + (k - b.length + 1) * gap;
}

/** How long beat k lasts in the song (to the next beat), in seconds. */
export function songBeatLength(map: SongMap, k: number): number {
  return Math.max(0.05, songBeatTime(map, k + 1) - songBeatTime(map, k));
}

/** The song's speed around beat k, in BPM: over the bar before it (the record's own breathing). */
export function songTempoAt(map: SongMap, k: number): number {
  const from = Math.max(0, k - BEATS_PER_BAR);
  const to = Math.max(from + 1, k);
  const sec = (songBeatTime(map, to) - songBeatTime(map, from)) / (to - from);
  return sec > 0 ? 60 / sec : 60;
}

/** The song's chord at a time in it, or null before its first. */
export function songChordAt(map: SongMap, sec: number): ChordEntry | null {
  let best: ChordEntry | null = null;
  for (const c of map.chords) {
    if (c.time <= sec + 1e-6) best = c;
    else break;
  }
  return best;
}

const unit = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

/** A stored section made safe, or null. */
export function sanitizeSongSection(v: unknown): SongSectionSpec | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.songId !== 'string' || o.songId.length === 0 || o.songId.length > 80) return null;
  const from = typeof o.fromBar === 'number' && Number.isInteger(o.fromBar) && o.fromBar >= 0 && o.fromBar < 1000 ? o.fromBar : null;
  const to = typeof o.toBar === 'number' && Number.isInteger(o.toBar) && o.toBar > 0 && o.toBar <= 1000 ? o.toBar : null;
  if (from === null || to === null || to <= from) return null;
  const l = (typeof o.levels === 'object' && o.levels !== null ? o.levels : {}) as Record<string, unknown>;
  return {
    songId: o.songId, fromBar: from, toBar: to,
    levels: { vocals: unit(l.vocals, 1), drums: unit(l.drums, 0), bass: unit(l.bass, 0), other: unit(l.other, 0) },
  };
}

/** Whether a section is a whole number of passes long, so the board is in step after it. */
export function sectionFitsPasses(spec: Pick<SongSectionSpec, 'fromBar' | 'toBar'>, beatsPerPass: number): boolean {
  return ((spec.toBar - spec.fromBar) * BEATS_PER_BAR) % Math.max(1, beatsPerPass) === 0;
}
