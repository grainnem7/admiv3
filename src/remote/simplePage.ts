/**
 * The Simple iPad page (spec 2026-11-04), its pure parts. The iPad is for playing live only:
 * Drums on or off (no drums anywhere while silent), Calm / Busy, what the melody plays, and
 * the Board. Loops are prepared and switched on the laptop. The laptop works these out and
 * sends them; the iPad only draws them.
 */

import type { ColourChannel, ColourId } from '../tracking/boardColours';
import { MELODY_SOUNDS, PART_ROLES, type Feel, type MelodySound, type RemotePicture } from './protocol';

/** Each picture's emoji. Chords and Piano share the keyboard. */
export const PICTURE_EMOJI: Record<RemotePicture, string> = {
  drums: '🥁', bass: '🎸', chords: '🎹', piano: '🎹', flute: '🪈', trumpet: '🎺', saxophone: '🎷', melody: '🎵',
};

/** The first colour whose job is melody: the one the iPad's sound buttons change. */
export function melodyColour<C extends Pick<ColourChannel, 'role'>>(channels: readonly C[]): C | null {
  return channels.find((c) => c.role === 'melody') ?? null;
}

/** Which of the four the melody colour plays; null for anything else, the default sound included. */
export function melodyChoice(ch: Pick<ColourChannel, 'instrument'>): MelodySound | null {
  const key = ch.instrument;
  return key !== undefined && (MELODY_SOUNDS as readonly string[]).includes(key) ? (key as MelodySound) : null;
}

/**
 * The player's colours whose counters are silent on the board now: every colour that plays
 * notes while the Board button has them silent (a control colour still works), and the drum
 * colours while Drums is silent.
 */
export function silencedColourIds(
  channels: readonly Pick<ColourChannel, 'id' | 'role'>[], s: { board: boolean; drums: boolean },
): ColourId[] {
  return channels
    .filter((c) => (s.board && (PART_ROLES as readonly string[]).includes(c.role)) || (s.drums && c.role === 'drums'))
    .map((c) => c.id);
}

// ---- live states kept for the browser tab -------------------------------------------------

/**
 * Drums, the Board button and Calm / Busy are live states of a performance: they last through
 * Stop and a reload (Carry on must sound as before), for the browser tab only, never saved
 * with the player. Closing ADMI starts the next time with everything playing and Normal.
 */
interface TabStore { getItem(k: string): string | null; setItem(k: string, v: string): void }
const BOARD_SILENT_KEY = 'admi-board-silent';
const DRUMS_SILENT_KEY = 'admi-drums-silent';
const FEEL_KEY = 'admi-feel';

const readFlag = (store: TabStore | null, key: string): boolean => {
  try { return store?.getItem(key) === 'true'; } catch { return false; }
};
const writeFlag = (store: TabStore | null, key: string, on: boolean): void => {
  try { store?.setItem(key, on ? 'true' : 'false'); } catch { /* storage blocked: kept for this page only */ }
};
export const readBoardSilent = (store: TabStore | null): boolean => readFlag(store, BOARD_SILENT_KEY);
export const writeBoardSilent = (store: TabStore | null, silent: boolean): void => writeFlag(store, BOARD_SILENT_KEY, silent);
export const readDrumsSilent = (store: TabStore | null): boolean => readFlag(store, DRUMS_SILENT_KEY);
export const writeDrumsSilent = (store: TabStore | null, silent: boolean): void => writeFlag(store, DRUMS_SILENT_KEY, silent);

export function readFeel(store: TabStore | null): Feel {
  try {
    const v = store?.getItem(FEEL_KEY);
    return v === 'calm' || v === 'busy' ? v : 'normal';
  } catch { return 'normal'; }
}
export function writeFeel(store: TabStore | null, feel: Feel): void {
  try { store?.setItem(FEEL_KEY, feel); } catch { /* storage blocked: kept for this page only */ }
}
