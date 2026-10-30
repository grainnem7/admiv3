import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';

export interface HeaderMoreProps {
  /** Narrow window: the buttons go into the menu. Wide: they sit in the header as before. */
  folded: boolean;
  /** A button inside is waiting for its second press: the menu stays open for it. */
  keepOpen?: boolean;
  children: ReactNode;
}

/**
 * "More" in the header (A3): below about 1400 px the less-used buttons (the audience screen,
 * Set up, Camera / Laptop) open from here, so the header stays one row and never pushes the
 * board down. The buttons are the same ones, so they do and say exactly what they did.
 * Esc or a click elsewhere closes it; focus goes back to More.
 */
export function HeaderMore({ folded, keepOpen = false, children }: HeaderMoreProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const shown = open || keepOpen;

  useEffect(() => {
    if (!folded || !shown) return undefined;
    const away = (e: PointerEvent): void => {
      if (keepOpen) return;
      if (box.current && e.target instanceof Node && !box.current.contains(e.target)) setOpen(false);
    };
    const key = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [folded, shown, keepOpen]);

  if (!folded) return <>{children}</>;
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <Button ref={button} tone="quiet" aria-expanded={shown} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {`More ${shown ? '▴' : '▾'}`}
      </Button>
      <div
        id={id}
        role="group"
        aria-label="More"
        hidden={!shown}
        style={{
          display: shown ? 'flex' : 'none', flexDirection: 'column', alignItems: 'stretch', gap: 6,
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 30, padding: 8, minWidth: 240,
          background: 'var(--bs-raised)', border: '1px solid var(--bs-border-control)', borderRadius: 'var(--bs-radius-md)',
          boxShadow: '0 6px 18px rgba(0, 0, 0, 0.25)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
