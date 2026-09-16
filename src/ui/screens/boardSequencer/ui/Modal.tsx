import { useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

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

  useEffect(() => {
    opener.current = document.activeElement;
    return () => {
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
}

/** A plain modal panel over a dimmed page, with the focus behaviour above. */
export function Modal({ label, onClose, children, maxWidth = 560 }: ModalProps): JSX.Element {
  const panel = useRef<HTMLDivElement | null>(null);
  const onKeyDown = useModalFocus(panel, onClose);

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
        style={{
          background: 'var(--bs-raised)', color: 'var(--bs-fg)', padding: 20,
          borderRadius: 'var(--bs-radius-lg)', maxWidth, maxHeight: '80vh', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 12, boxShadow: 'var(--bs-shadow)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
