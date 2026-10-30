import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

// Disabled controls are skipped: focusing one is a no-op, so treating it as the first or
// last element let Tab escape the dialog entirely.
const FOCUSABLE = [
  'button:not([disabled])', '[href]', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Everything on the page but `el` (and what contains it) made inert: a screen reader or the
 * Tab key can no longer wander into the controls behind a dialog — 161 of them behind the
 * player chooser. Returns the undo.
 */
export function inertOutside(el: HTMLElement): () => void {
  const changed: HTMLElement[] = [];
  let node: HTMLElement = el;
  while (node.parentElement && node !== document.body) {
    const parent = node.parentElement;
    for (const sib of Array.from(parent.children)) {
      if (sib === node || !(sib instanceof HTMLElement) || sib.hasAttribute('inert')) continue;
      if (sib.tagName === 'SCRIPT' || sib.tagName === 'STYLE') continue;
      sib.setAttribute('inert', '');
      changed.push(sib);
    }
    node = parent;
  }
  return () => { for (const s of changed) s.removeAttribute('inert'); };
}

/**
 * Focus behaviour every modal on this screen needs: focus moves in on open, Tab is trapped
 * inside, Esc closes, and focus returns to whatever opened it — or, when that has been
 * removed, to a surviving heading rather than the top of the page.
 */
export function useModalFocus(
  panel: React.RefObject<HTMLElement | null>,
  onClose: () => void,
): (e: React.KeyboardEvent) => void {
  const opener = useRef<Element | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Read during render, on purpose. React applies a child's `autoFocus` while it commits
  // the DOM, which is BEFORE effects run — so by the time an effect looked, the "opener"
  // it found was already the dialog's own button and focus never came back.
  if (opener.current === null) opener.current = document.activeElement;

  useEffect(() => {
    // The page behind is out of reach while the dialog is open (the overlay is the panel's parent).
    const overlay = panel.current?.parentElement;
    const restore = overlay ? inertOutside(overlay) : () => {};
    return () => {
      // Back first: an inert element can't take the focus returned to it below.
      restore();
      const prev = opener.current as HTMLElement | null;
      if (prev?.isConnected) { prev.focus?.(); return; }
      const fallback = document.querySelector<HTMLElement>('[data-focus-fallback]')
        ?? document.querySelector<HTMLElement>('h1, h2');
      if (!fallback) return;
      if (!fallback.hasAttribute('tabindex')) fallback.setAttribute('tabindex', '-1');
      fallback.focus();
    };
  }, []);

  return (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeRef.current();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
}

export interface ModalProps {
  /** Named for screen readers; also what the dialog is announced as. */
  label: string;
  onClose(): void;
  children: ReactNode;
  maxWidth?: number;
  /**
   * 'scroll' (default): the panel scrolls as a whole. 'free': the panel does not scroll and
   * lays out its own children, so a long text can scroll inside it with a heading and Close
   * that stay put (Help, A8).
   */
  layout?: 'scroll' | 'free';
}

/** A plain modal panel over a dimmed page, with the focus behaviour above. */
export function Modal({ label, onClose, children, maxWidth = 560, layout = 'scroll' }: ModalProps): JSX.Element {
  const panel = useRef<HTMLDivElement | null>(null);
  const onKeyDown = useModalFocus(panel, onClose);
  // Focus moves in on open, even when nothing inside asks for it: Help's only button is
  // at the end of a long text, focus stayed on "?", and Esc and Tab went nowhere.
  useLayoutEffect(() => {
    const p = panel.current;
    if (p && !p.contains(document.activeElement)) p.focus();
  }, []);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 40, display: 'grid', placeItems: 'center',
        background: 'rgba(0,0,0,.45)',
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={{
          background: 'var(--bs-raised)', color: 'var(--bs-fg)', padding: layout === 'free' ? 0 : 20,
          borderRadius: 'var(--bs-radius-lg)', maxWidth, maxHeight: layout === 'free' ? '88vh' : '80vh',
          ...(layout === 'free' ? { width: `min(${maxWidth}px, calc(100vw - 24px))`, overflow: 'hidden' } : { overflowY: 'auto' as const }),
          display: 'flex', flexDirection: 'column', gap: layout === 'free' ? 0 : 12, boxShadow: 'var(--bs-shadow)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
