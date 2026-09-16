import { useEffect, useRef } from 'react';
import { Button } from './Button';
import { useModalFocus } from './Modal';

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
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const onKeyDown = useModalFocus(panel, onCancel);

  // Focus lands on the safe button when the action destroys something. A player with
  // tremor or spasticity, or a switch that fires twice, can press whatever has focus the
  // moment a dialog opens — and that must never be the thing that wipes their work.
  useEffect(() => {
    if (tone === 'danger') cancelRef.current?.focus();
    else confirmRef.current?.focus();
  }, [tone]);

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
          <Button ref={cancelRef} tone="secondary" onClick={onCancel}>{cancelLabel}</Button>
          <Button ref={confirmRef} tone={tone} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
