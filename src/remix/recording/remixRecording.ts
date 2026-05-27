/**
 * Remix performance-recording data model. A "remix" is the song plus the
 * recorded control performance: per loop-region SECTION, a stack of overdub
 * TAKES, each a list of timestamped control EVENTS. All pure + serializable.
 */
import type { StemId } from '../RemixBaton';

/** A captured control change. `t` is seconds from the section start, in [0,length). */
export type RemixEvent =
  | { t: number; kind: 'stemFilter'; stem: StemId; value: number }
  | { t: number; kind: 'percussion'; velocity: number }
  | { t: number; kind: 'loopSelect'; index: number }
  | { t: number; kind: 'loopEnable'; on: boolean }
  | { t: number; kind: 'loopVolume'; value: number };

/** A capture call (no timestamp — the recorder stamps it). */
export type CaptureInput =
  | { kind: 'stemFilter'; stem: StemId; value: number }
  | { kind: 'percussion'; velocity: number }
  | { kind: 'loopSelect'; index: number }
  | { kind: 'loopEnable'; on: boolean }
  | { kind: 'loopVolume'; value: number };

/** One overdub pass. */
export interface RemixTake {
  id: string;
  muted: boolean;
  events: RemixEvent[];
}

/** A bar-aligned section (mirrors a loop region). */
export interface RemixSection {
  originBar: number;
  lengthBars: number;
  layers: RemixTake[];
}

/** A whole remix performance for one song. */
export interface RemixArrangement {
  songId: string;
  sections: RemixSection[];
}
