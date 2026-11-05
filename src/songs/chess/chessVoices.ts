/**
 * Which sound each piece plays, from ADMI's sound catalogue. Pawns plucked, knights
 * hollow, bishops bright, rooks low, the queen a lead, the king a pad; black a darker
 * sound of the same kind (and an octave lower, see chessNotes).
 */
import { voiceSpecFor, type LayeredVoiceSpec } from '../../audio/worlds/soundWorlds';
import { soundOptionName } from '../../ui/screens/boardSequencer/soundCatalogue';
import type { PieceType, Side } from './chessNotes';

export const PIECE_NAMES: Record<PieceType, string> = { p: 'Pawns', n: 'Knights', b: 'Bishops', r: 'Rooks', q: 'Queen', k: 'King' };
export const SIDE_NAMES: Record<Side, string> = { w: 'White', b: 'Black' };
export const PIECE_TYPES: readonly PieceType[] = ['p', 'n', 'b', 'r', 'q', 'k'];

/** The catalogue key each voice starts on. */
export const DEFAULT_CHESS_SOUNDS: Record<string, string> = {
  wp: 'harp', bp: 'guitarNylon',
  wn: 'clarinet', bn: 'bassoon',
  wb: 'xylophone', bb: 'synth:bell',
  wr: 'cello', br: 'contrabass',
  wq: 'trumpet', bq: 'frenchHorn',
  wk: 'synth:pad', bk: 'pad',
};

/** The engine's spec for a catalogue key (a synth key becomes a synth layer). */
export function specForSound(key: string): string | LayeredVoiceSpec {
  return voiceSpecFor({ role: 'melody', instrument: key }, 'none');
}

/** Every voice's spec, for the engine. */
export function chessVoiceSpecs(sounds: Record<string, string> = DEFAULT_CHESS_SOUNDS): Record<string, string | LayeredVoiceSpec> {
  return Object.fromEntries(Object.entries(sounds).map(([v, key]) => [v, specForSound(key)]));
}

/** A voice's plain name and sound: "White pawns: Harp". */
export function voiceLabel(voice: string, sounds: Record<string, string> = DEFAULT_CHESS_SOUNDS): string {
  const side = SIDE_NAMES[voice[0] as Side];
  const piece = PIECE_NAMES[voice[1] as PieceType];
  return `${side} ${piece.toLowerCase()}: ${soundOptionName(sounds[voice] ?? '')}`;
}
