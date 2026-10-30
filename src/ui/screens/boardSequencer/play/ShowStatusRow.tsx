import type { ReactNode } from 'react';
import type { ShowStatusAction, ShowStatusItem } from './showStatus';

/**
 * Show's status row (B1): one line of fixed height, so nothing that appears or goes ever
 * moves the clock or the board. Warnings are amber with "!" (var(--bs-warn), never a
 * bright full-width bar); what is fine is calm, with ✓. Only the warnings' words are
 * announced: the hat's numbers change several times a second.
 */
export function ShowStatusRow({ items, action }: {
  items: ShowStatusItem[];
  /** The button for an item's action (the screen gives it its words and its work). */
  action(a: ShowStatusAction, item: ShowStatusItem): ReactNode;
}): JSX.Element {
  const warnings = items.filter((x) => x.tone === 'warn' && x.label === undefined).map((x) => x.text).join(' ');
  return (
    <div
      role="group"
      aria-label="Show status"
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap', overflow: 'hidden',
        height: 'calc(var(--bs-target) + 8px)', flexShrink: 0, minWidth: 0,
      }}
    >
      {/* The warnings, said once when they change. */}
      <span role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }}>
        {warnings}
      </span>
      {items.map((x) => (
        <span
          key={x.key}
          data-tone={x.tone}
          {...(x.label ? { role: 'status', 'aria-label': x.label } : {})}
          title={x.detail ? `${x.text} · ${x.detail}` : x.text}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, flex: x.tone === 'ok' ? '0 0 auto' : '0 1 auto',
            padding: '2px 10px', borderRadius: 'var(--bs-radius-md)', whiteSpace: 'nowrap', fontSize: 14,
            ...(x.tone === 'warn'
              ? { border: '2px solid var(--bs-warn)', background: 'var(--bs-warn-tint)', color: 'var(--bs-fg)', fontWeight: 700 }
              : x.tone === 'note'
                ? { border: '1px solid var(--bs-border-control)', color: 'var(--bs-fg)', fontWeight: 600 }
                : { border: '1px solid var(--bs-border)', color: 'var(--bs-fg2)' }),
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            {x.tone === 'warn' ? (
              <><span aria-hidden="true" style={{ color: 'var(--bs-warn)' }}>!</span>{x.text.slice(1)}</>
            ) : x.text.endsWith('✓') || x.text.includes('✓ ') ? (
              <>{x.text.split('✓')[0]}<span style={{ color: 'var(--bs-ok)' }}>✓</span>{x.text.split('✓').slice(1).join('✓')}</>
            ) : x.text}
          </span>
          {x.detail && <span style={{ color: 'var(--bs-fg2)', fontWeight: 400, flexShrink: 0 }}>{x.detail}</span>}
          {(x.actions ?? []).map((a) => <span key={a} style={{ flexShrink: 0 }}>{action(a, x)}</span>)}
        </span>
      ))}
    </div>
  );
}
