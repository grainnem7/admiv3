import type { ColourKind, ColourRole } from '../../../tracking/boardColours';

const JOB_ORDER: ColourRole[] = ['melody', 'bass', 'drums', 'chord'];

/** The job suggested for a newly added colour; the user can always change it. */
export function suggestRole(existing: { role: ColourRole }[], added: { kind: ColourKind }): ColourRole {
  const used = new Set(existing.map((c) => c.role));
  const free = JOB_ORDER.filter((r) => !used.has(r));
  if (added.kind === 'black' && free.includes('drums')) return 'drums';
  return free[0] ?? 'off';
}
