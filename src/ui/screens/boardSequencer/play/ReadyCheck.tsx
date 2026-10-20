import { Button } from '../ui/Button';

export type CheckState = 'ok' | 'warn' | 'problem';

export interface ReadyItem {
  label: string;
  state: CheckState;
  /** What to do about it, when it is not ok. */
  fix?: string;
}

const MARK: Record<CheckState, string> = { ok: '✓', warn: '!', problem: '✕' };
const COLOUR: Record<CheckState, string> = { ok: 'var(--bs-ok)', warn: 'var(--bs-warn)', problem: 'var(--bs-danger)' };
const WORD: Record<CheckState, string> = { ok: 'ready', warn: 'check', problem: 'not ready' };

/**
 * Before the piece: everything the pre-show checklist asks, checked by the app where it
 * can be — the board, the colours, the loops the scenes use, the times, the ending, the
 * iPad, the AI, and whether the work is saved on the laptop and backed up.
 */
export function ReadyList({ items }: { items: ReadyItem[] }): JSX.Element {
  const problems = items.filter((i) => i.state === 'problem').length;
  const warns = items.filter((i) => i.state === 'warn').length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <p role="status" style={{ margin: 0, fontWeight: 700 }}>
        {problems > 0 ? `${problems} ${problems === 1 ? 'thing needs' : 'things need'} fixing before the piece.`
          : warns > 0 ? `Ready, with ${warns} ${warns === 1 ? 'thing' : 'things'} to check.` : 'Everything is ready.'}
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((i) => (
          <li key={i.label} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 8, alignItems: 'start' }}>
            <span aria-hidden="true" style={{ fontWeight: 800, color: COLOUR[i.state], fontSize: 18, textAlign: 'center' }}>{MARK[i.state]}</span>
            <span>
              <span style={{ fontWeight: 600 }}>{i.label}</span>
              <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{` — ${WORD[i.state]}`}</span>
              {i.fix && i.state !== 'ok' && <span style={{ display: 'block', fontSize: 13, color: 'var(--bs-fg2)' }}>{i.fix}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The same list in a window, with a Close button. */
export function ReadyCheck({ items, onClose }: { items: ReadyItem[]; onClose(): void }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <ReadyList items={items} />
      <div><Button tone="primary" autoFocus onClick={onClose}>Close</Button></div>
    </div>
  );
}
