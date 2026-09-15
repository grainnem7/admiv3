import { useId, useRef } from 'react';
import type { ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  label: string;
  tabs: TabItem[];
  active: string;
  onChange(id: string): void;
}

/**
 * Tabs with a roving tabindex: Tab reaches the tab strip once, then arrows, Home and End
 * move between tabs. Selecting a tab moves focus with it, so switch and keyboard users
 * never lose their place.
 */
export function Tabs({ label, tabs, active, onChange }: TabsProps): JSX.Element {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, tabs.findIndex((t) => t.id === active));

  const focusTab = (next: number): void => {
    const i = (next + tabs.length) % tabs.length;
    onChange(tabs[i].id);
    refs.current[i]?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--bs-border)' }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); focusTab(index + 1); }
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); focusTab(index - 1); }
          else if (e.key === 'Home') { e.preventDefault(); focusTab(0); }
          else if (e.key === 'End') { e.preventDefault(); focusTab(tabs.length - 1); }
        }}
      >
        {tabs.map((t, i) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.id)}
              style={{
                minHeight: 'var(--bs-target)',
                background: selected ? 'var(--bs-elev)' : 'transparent',
                color: selected ? 'var(--bs-fg)' : 'var(--bs-fg2)',
                border: 'none',
                borderBottom: selected ? '3px solid var(--bs-accent)' : '3px solid transparent',
                borderRadius: 0,
                fontWeight: selected ? 600 : 400,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-panel-${t.id}`}
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={t.id !== active}
          tabIndex={0}
        >
          {t.id === active && t.content}
        </div>
      ))}
    </div>
  );
}
