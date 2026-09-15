import { useId, useState, type ReactNode } from 'react';

export interface DisclosureProps {
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

/** A details/summary section for settings that most sessions never need to open. */
export function Disclosure({ summary, children, defaultOpen = false }: DisclosureProps): JSX.Element {
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: '1px solid var(--bs-border)', paddingTop: 6 }}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'transparent', border: 'none', color: 'var(--bs-fg2)',
          minHeight: 'var(--bs-target)', textAlign: 'left',
        }}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span>{summary}</span>
      </button>
      <div id={id} hidden={!open} style={{ display: open ? 'flex' : 'none', flexDirection: 'column', gap: 8, paddingBottom: 8 }}>
        {children}
      </div>
    </div>
  );
}
