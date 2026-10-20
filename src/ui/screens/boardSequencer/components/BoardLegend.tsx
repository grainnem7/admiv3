/**
 * What the marks on the board mean, drawn the way the board draws them, so the player can
 * tell their own counters from what the instrument adds. Only the marks that can appear
 * right now are listed.
 */
export interface BoardLegendProps {
  loops: boolean;
  extra: boolean;
  band: boolean;
  tunes: boolean;
}

const MARK = 14;

function Mark({ kind }: { kind: 'you' | 'loop' | 'extra' | 'band' | 'tune' }): JSX.Element {
  const c = 'var(--bs-fg)';
  return (
    <svg width={kind === 'band' || kind === 'tune' ? MARK * 1.6 : MARK} height={MARK} aria-hidden="true">
      {kind === 'you' && <circle cx={MARK / 2} cy={MARK / 2} r={MARK / 2 - 1} fill={c} />}
      {kind === 'loop' && (
        <>
          <circle cx={MARK / 2} cy={MARK / 2} r={MARK / 2 - 2} fill="none" stroke={c} strokeWidth={2} />
          <circle cx={MARK / 2} cy={MARK / 2} r={2} fill={c} />
        </>
      )}
      {kind === 'extra' && <circle cx={MARK / 2} cy={MARK / 2} r={MARK / 2 - 2} fill="none" stroke={c} strokeWidth={2} strokeDasharray="2 3" />}
      {kind === 'band' && <rect x={0} y={MARK - 6} width={MARK * 1.6} height={5} fill="var(--bs-accent)" />}
      {kind === 'tune' && <rect x={0} y={MARK - 5} width={MARK * 1.6} height={3} fill={c} opacity={0.6} />}
    </svg>
  );
}

export function BoardLegend({ loops, extra, band, tunes }: BoardLegendProps): JSX.Element {
  const items: { kind: Parameters<typeof Mark>[0]['kind']; text: string }[] = [
    { kind: 'you', text: 'your counters' },
    ...(tunes ? [{ kind: 'tune' as const, text: 'a tune carrying on' }] : []),
    ...(loops ? [{ kind: 'loop' as const, text: 'a loop' }] : []),
    ...(extra ? [{ kind: 'extra' as const, text: 'extra notes' }] : []),
    ...(band ? [{ kind: 'band' as const, text: 'the band' }] : []),
  ];
  return (
    <ul
      aria-label="What the board shows"
      style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', margin: 0, padding: 0, listStyle: 'none', fontSize: 12, color: 'var(--bs-fg2)' }}
    >
      {items.map((i) => (
        <li key={i.kind} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Mark kind={i.kind} />
          {i.text}
        </li>
      ))}
    </ul>
  );
}
