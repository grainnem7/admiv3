import { useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { focusWhenGone } from '../ui/focusNext';

/** note: advice, never a warning (B21): shown with its words, not counted against Ready. */
export type CheckState = 'ok' | 'warn' | 'problem' | 'note';

export interface ReadyItem {
  label: string;
  state: CheckState;
  /** What to do about it, when it is not ok. */
  fix?: string;
  /** A button that fixes it right here ("Take it out"); `name` says what it does in full. */
  action?: { label: string; name: string; onClick(): void };
  /**
   * Where it is fixed (A14): the screen turns this into a button that goes straight there,
   * so a fix never sends the owner looking for a place by its name.
   */
  place?: CheckPlace;
}

/** The places a fix can be made. */
export type CheckPlace = 'scenes' | 'sound' | 'cap' | 'connections' | 'setupCamera' | 'setupBoard' | 'setupColours' | 'cameraBoard';

/** What the button that goes to a place says. */
export const PLACE_WORDS: Record<CheckPlace, string> = {
  scenes: 'Go to Scenes',
  sound: 'Go to the Sound tab',
  cap: 'Go to the Cap tab',
  connections: 'Go to the Connections tab',
  setupCamera: 'Go to Set up: Camera',
  setupBoard: 'Go to Set up: Board',
  setupColours: 'Go to Set up: Colours',
  cameraBoard: 'Use the camera board',
};

const MARK: Record<CheckState, string> = { ok: '✓', warn: '!', problem: '✕', note: 'i' };
const COLOUR: Record<CheckState, string> = { ok: 'var(--bs-ok)', warn: 'var(--bs-warn)', problem: 'var(--bs-danger)', note: 'var(--bs-fg2)' };
const WORD: Record<CheckState, string> = { ok: 'ready', warn: 'check', problem: 'not ready', note: 'advice' };

/**
 * Before the piece: everything the pre-show checklist asks, checked by the app where it
 * can be — the board, the colours, the loops the scenes use, the times, the ending, the
 * iPad, the AI, and whether the work is saved on the laptop and backed up.
 */
export function ReadyList({ items }: { items: ReadyItem[] }): JSX.Element {
  const problems = items.filter((i) => i.state === 'problem').length;
  const warns = items.filter((i) => i.state === 'warn').length;
  // Advice is one line until its line is pressed (U7): its words and its button wait behind
  // it. A problem or a thing to check is open from the start, so its fix is one press away.
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const isOpen = (i: ReadyItem): boolean => i.state !== 'note' || opened.has(i.label);
  const toggle = (label: string): void => setOpened((was) => {
    const next = new Set(was);
    if (next.has(label)) next.delete(label); else next.add(label);
    return next;
  });
  // A fix button goes with the line it fixed: focus goes to the summary, which says what is
  // left, never to the page (R3-TB-01).
  const summaryRef = useRef<HTMLParagraphElement | null>(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <p ref={summaryRef} tabIndex={-1} role="status" style={{ margin: 0, fontWeight: 700 }}>
        {problems > 0 ? `${problems} ${problems === 1 ? 'thing needs' : 'things need'} fixing before the piece.`
          : warns > 0 ? `Ready, with ${warns} ${warns === 1 ? 'thing' : 'things'} to check.` : 'Everything is ready.'}
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((i, k) => (
          <li key={`${k}:${i.label}`} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 8, alignItems: i.state === 'note' ? 'center' : 'start' }}>
            <span aria-hidden="true" style={{ fontWeight: 800, color: COLOUR[i.state], fontSize: 20, textAlign: 'center' }}>{MARK[i.state]}</span>
            <span>
              {i.state === 'note' && (i.fix || i.action) ? (
                <button
                  type="button" aria-expanded={isOpen(i)} onClick={() => toggle(i.label)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 0, minHeight: 'var(--bs-target)', background: 'transparent', border: 'none', color: 'inherit', textAlign: 'left', cursor: 'pointer', fontWeight: 600 }}
                >
                  <span aria-hidden="true">{isOpen(i) ? '▾' : '▸'}</span>
                  {i.label}
                  <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{` — ${WORD[i.state]}`}</span>
                </button>
              ) : (
                <>
                  <span style={{ fontWeight: 600 }}>{i.label}</span>
                  <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{` — ${WORD[i.state]}`}</span>
                </>
              )}
              {i.fix && i.state !== 'ok' && isOpen(i) && <span style={{ display: 'block', fontSize: 14, color: 'var(--bs-fg2)' }}>{i.fix}</span>}
              {i.action && i.state !== 'ok' && isOpen(i) && (
                <span style={{ display: 'block', marginTop: 4 }}>
                  <Button
                    tone="secondary"
                    aria-label={i.action.name}
                    onClick={(e) => { i.action?.onClick(); void focusWhenGone(() => summaryRef.current, e.currentTarget); }}
                  >
                    {i.action.label}
                  </Button>
                </span>
              )}
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
