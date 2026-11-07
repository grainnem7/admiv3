/**
 * The Simple iPad page (spec 2026-11-04), its pure parts. The iPad is for playing live only:
 * Drums on or off (no drums anywhere while silent), Calm / Busy, what the melody plays, and
 * the Board. Loops are prepared and switched on the laptop. The laptop works these out and
 * sends them; the iPad only draws them.
 */

import type { ColourChannel, ColourId } from '../tracking/boardColours';
import { MELODY_SOUNDS, PART_ROLES, type Feel, type MelodySound, type RemoteColour, type RemotePicture } from './protocol';

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
 * notes while the Board button has them silent (a control colour still works), the drum
 * colours while Drums is silent, and each colour silenced on its own pad (K4).
 */
export function silencedColourIds(
  channels: readonly Pick<ColourChannel, 'id' | 'role'>[], s: { board: boolean; drums: boolean; colours?: ReadonlySet<string> },
): ColourId[] {
  const plays = (c: Pick<ColourChannel, 'role'>): boolean => (PART_ROLES as readonly string[]).includes(c.role);
  return channels
    .filter((c) => (s.board && plays(c)) || (s.drums && c.role === 'drums') || (s.colours?.has(c.id) === true && plays(c)))
    .map((c) => c.id);
}

/**
 * The colours the Counters row draws (K4): the note-playing ones in board order, numbered as
 * the laptop's colour words number them, with the laptop's words for the job and instrument.
 */
/**
 * The picture on a colour's pad (owner, 5 Nov 2026: pictures, not instrument words): read
 * from the instrument's name as the laptop writes it, else the job's own picture.
 */
export function colourPicture(role: string, words: string): string {
  const w = words.toLowerCase();
  const has = (...keys: string[]): boolean => keys.some((k) => w.includes(k));
  if (role === 'drums' || has('kit', 'drum')) return '🥁';
  if (has('sax')) return '🎷';
  if (has('flute', 'clarinet', 'oboe', 'bassoon', 'recorder', 'whistle')) return '🪈';
  if (has('trumpet', 'horn', 'trombone', 'tuba', 'brass')) return '🎺';
  if (has('cello', 'violin', 'viola', 'string')) return '🎻';
  if (has('bell', 'xylophone', 'marimba', 'glock', 'vibraphone', 'chime')) return '🔔';
  if (has('guitar', 'bass', 'banjo')) return '🎸';
  if (has('piano', 'organ', 'keys', 'harpsichord', 'chord', 'clav', 'synth', 'saw')) return '🎹';
  if (has('harp', 'pad', 'choir', 'voice', 'vocal')) return '🎶';
  if (role === 'bass') return '🎸';
  if (role === 'chord') return '🎹';
  return '🎵';
}

/**
 * The ink that reads on a swatch: near-black on a light colour, white on a dark one, by the
 * colour's relative luminance; white when the colour is written in a form this cannot read.
 */
export function inkOn(swatch: string): string {
  const rgb = parseRgb(swatch);
  if (!rgb) return '#ffffff';
  const lin = (c: number): number => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const lum = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  return lum > 0.4 ? '#111111' : '#ffffff';
}

function parseRgb(s: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim());
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const fn = /^rgba?\(\s*(\d+)\s*,?\s*(\d+)\s*,?\s*(\d+)/i.exec(s.trim());
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];
  return null;
}

export function remoteColours(channels: readonly ColourChannel[], words: (ch: ColourChannel) => string, name: (ch: ColourChannel) => string): RemoteColour[] {
  const out: RemoteColour[] = [];
  channels.forEach((c, i) => {
    if (!(PART_ROLES as readonly string[]).includes(c.role)) return;
    const w = words(c);
    out.push({ id: c.id, number: i + 1, name: name(c), swatch: c.swatch, role: c.role, words: w, picture: colourPicture(c.role, w) });
  });
  return out;
}

/**
 * A colour's pad pressed to bring it back: a drum colour while Drums are off brings Drums
 * back everywhere too (a press on a colour means "I want this to sound"); otherwise only
 * the colour changes. Returns whether Drums should come back.
 */
export function colourBack(role: ColourChannel['role'], drumsSilent: boolean): { drums: boolean } {
  return { drums: role === 'drums' && drumsSilent };
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
/** The Board pad is not shown any more (K4): a silence it left behind would stay in force with no pad to lift it. */
export const clearBoardSilent = (store: TabStore | null): void => writeFlag(store, BOARD_SILENT_KEY, false);

const SILENT_COLOURS_KEY = 'admi-silent-colours';
/** The colours silenced on their own pads (K4), kept for the tab as the other live states are. */
export function readSilentColours(store: TabStore | null): string[] {
  try {
    const v = JSON.parse(store?.getItem(SILENT_COLOURS_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}
export function writeSilentColours(store: TabStore | null, ids: readonly string[]): void {
  try { store?.setItem(SILENT_COLOURS_KEY, JSON.stringify([...ids])); } catch { /* storage blocked: kept for this page only */ }
}
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

/**
 * The grid of `n` round pads that gives each the biggest circle in a `w` × `h` box, with
 * `gap` between: how many columns (from `minCols` to `maxCols`), and the circle's size. With
 * the page to themselves, four colours are a 2 × 2 of big pads rather than a thin row of four.
 */
export function bestCircleGrid(w: number, h: number, n: number, gap: number, minCols = 1, maxCols = 4): { cols: number; size: number } {
  const count = Math.max(1, n);
  let best = { cols: Math.max(1, Math.min(minCols, maxCols)), size: 0 };
  for (let cols = Math.max(1, minCols); cols <= Math.max(minCols, Math.min(maxCols, count)); cols++) {
    const rows = Math.ceil(count / cols);
    const size = Math.floor(Math.min((w - gap * (cols - 1)) / cols, (h - gap * (rows - 1)) / rows));
    if (size > best.size) best = { cols, size: Math.max(0, size) };
  }
  return best;
}
