import { useCallback, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { Switch } from './Switch';

/**
 * "Explain the choices" (U7): the sentences under the choices on the Sound, Timing, Board,
 * Connections and Cap tabs, in a scene's More and in the Ready check. On to start with, so
 * a new player reads what each thing does; off, the panels show only the choices, and stay
 * that way on this laptop (remembered in local storage). The owner switches it under More.
 */
const KEY = 'admi-board-explain';
const listeners = new Set<() => void>();
let known: boolean | null = null;

function read(): boolean {
  if (known !== null) return known;
  let v = true;
  try {
    const s = localStorage.getItem(KEY);
    if (s !== null) v = s !== '0';
  } catch { /* not remembered */ }
  known = v;
  return v;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Back to the start (a new laptop; the tests). */
export function forgetExplain(): void {
  known = null;
  try { localStorage.removeItem(KEY); } catch { /* nothing kept */ }
  listeners.forEach((l) => l());
}

export function useExplain(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => true);
  const set = useCallback((next: boolean) => {
    known = next;
    try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* not remembered */ }
    listeners.forEach((l) => l());
  }, []);
  return [on, set];
}

/** The switch itself, for the header's More. */
export function ExplainSwitch(): JSX.Element {
  const [on, set] = useExplain();
  return <Switch label="Explain the choices" checked={on} onChange={set} />;
}

export const NOTE_STYLE: CSSProperties = { fontSize: 14, color: 'var(--bs-fg2)' };

/**
 * A sentence that explains a choice: shown only while Explain the choices is on. Never for
 * what is true now (a status, a reason a button is off): those are always shown.
 */
export function Note({ children, style, as = 'span' }: { children: ReactNode; style?: CSSProperties; as?: 'span' | 'p' }): JSX.Element | null {
  const [on] = useExplain();
  if (!on) return null;
  const s = { ...NOTE_STYLE, ...(as === 'p' ? { margin: 0 } : {}), ...style };
  return as === 'p' ? <p style={s}>{children}</p> : <span style={s}>{children}</span>;
}
