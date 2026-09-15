import { useEffect, useRef } from 'react';
import { Button } from './Button';

export interface ConfirmDialogProps {
  title: string;
  /** The consequence, in plain words — especially what will go quiet. */
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  onConfirm(): void;
  onCancel(): void;
}

/**
 * A modal confirmation for destructive or disruptive actions. Focus moves in on open,
 * is trapped while open, Esc cancels, and focus returns to whatever opened it.
 */
export function ConfirmDialog({
  title, body, confirmLabel, cancelLabel = 'Cancel', tone = 'danger', onConfirm, onCancel,
}: ConfirmDialogProps): JSX.Element {
  const panel = useRef<HTMLDivElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    confirmRef.current?.focus();
    return () => {
      // Restore focus, so a switch or screen-reader user isn't dropped at the page top.
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = panel.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, display: 'grid', placeItems: 'center',
        background: 'rgba(0,0,0,.45)', zIndex: 50,
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          background: 'var(--bs-raised)', color: 'var(--bs-fg)',
          border: '1px solid var(--bs-border)', borderRadius: 'var(--bs-radius-lg)',
          padding: 20, maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12,
          boxShadow: 'var(--bs-shadow)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
        {body && <p style={{ margin: 0, color: 'var(--bs-fg2)' }}>{body}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button tone="secondary" onClick={onCancel}>{cancelLabel}</Button>
          <Button ref={confirmRef} tone={tone} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
