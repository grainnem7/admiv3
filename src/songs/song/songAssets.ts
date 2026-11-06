/**
 * A library song's map (beats and chords, from its analysis) and its stems' addresses, for
 * a piece's song sections (spec 2026-11-06). Null when the song is unknown or its analysis
 * can't be read: the piece then plays without the record.
 */

import { SONG_LIBRARY } from '../songLibrary';
import { loadSongAnalysis } from '../analysisLoader';
import type { SongMap, StemName } from './songSection';

export interface BoardSong {
  map: SongMap;
  urls: Partial<Record<StemName, string>>;
}

export async function loadBoardSong(songId: string): Promise<BoardSong | null> {
  const song = SONG_LIBRARY.find((s) => s.id === songId);
  if (!song?.analysisUrl) return null;
  try {
    const analysis = await loadSongAnalysis(song.analysisUrl);
    if (analysis.beats.length < 2) return null;
    const stems = song.stems as Partial<Record<string, string>>;
    return {
      map: { beats: analysis.beats, chords: analysis.chordProgression },
      urls: { vocals: stems.vocals, drums: stems.drums, bass: stems.bass, other: stems.other },
    };
  } catch (err) {
    console.warn(`[songAssets] could not load ${songId}:`, err);
    return null;
  }
}
