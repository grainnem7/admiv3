/**
 * One writer per parameter. When a control counter owns a parameter, the matching
 * on-screen control is disabled and says why — rather than the two quietly fighting,
 * with the counter winning on the next camera frame.
 */
import type { ColourId, ColourRole } from '../../../tracking/boardColours';
import type { FaderRole } from '../../../profiles/BoardSequencerConfig';

export interface ControlOwner {
  channelId: ColourId;
  role: FaderRole;
}

const FADER_LABELS: Record<FaderRole, string> = {
  volume: 'Volume', reverb: 'Reverb', delay: 'Delay', tone: 'Tone', tempo: 'Tempo',
};

const isFader = (r: ColourRole): r is FaderRole => r in FADER_LABELS;

/** Which parameters currently have a control counter assigned (first colour wins). */
export function controlOwners(
  channels: readonly { id: ColourId; role: ColourRole }[],
): Partial<Record<FaderRole, ControlOwner>> {
  const owners: Partial<Record<FaderRole, ControlOwner>> = {};
  for (const ch of channels) {
    if (isFader(ch.role) && !owners[ch.role]) owners[ch.role] = { channelId: ch.id, role: ch.role };
  }
  return owners;
}

/** Why an on-screen control is disabled, or null when the user still owns it. */
export function disabledReason(
  role: FaderRole,
  owners: Partial<Record<FaderRole, ControlOwner>>,
  syncedToSong = false,
): string | null {
  if (role === 'tempo' && syncedToSong) return 'Tempo follows the backing song';
  if (owners[role]) return `${FADER_LABELS[role]} is set by the ${FADER_LABELS[role].toLowerCase()} counter`;
  return null;
}

/** The live value to show in the legend, with a hold glyph when the counter is away. */
export function legendValue(
  role: FaderRole, value: number | undefined, held: ReadonlySet<ColourRole>,
): string {
  if (value === undefined) return '—';
  const shown = role === 'tempo' ? `${Math.round(value)} BPM` : `${Math.round(value * 100)}%`;
  return held.has(role) ? `${shown} ‖` : shown;
}
