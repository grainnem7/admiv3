import { Button } from '../ui/Button';
import { formatClock, type ClockView } from '../../../../songs/performance/clock';

export interface NowNextStripProps {
  clock: ClockView | null;
  /** The scene on now, and the next one the clock brings in. */
  nowName: string | null;
  next: { name: string; inSec: number } | null;
  /** The loops playing (or starting), by name. */
  loops: string[];
  ending: boolean;
  onStartClock(): void;
  onNext(): void;
  onEnd(): void;
  onCancelEnding(): void;
  /** Bigger type for the Big board view, read from across the room. */
  big?: boolean;
  /** A cue just given ("1 minute left"), shown large for a few seconds. */
  cue?: string | null;
}

/**
 * During a piece, above the board: how long is left, what is on, what comes next and
 * when, and which loops are playing — in type large enough to read from the player's
 * chair. The structure of the piece is seen, not only heard.
 */
export function NowNextStrip(p: NowNextStripProps): JSX.Element {
  const phase = p.clock?.phase ?? 'idle';
  const clockColour = phase === 'lastMoments' || phase === 'ending' || phase === 'over' ? 'var(--bs-danger)'
    : phase === 'lastMinute' ? 'var(--bs-warn)' : 'var(--bs-fg)';
  const size = p.big ? 1.5 : 1;
  return (
    <div
      role="region"
      aria-label="Now and next"
      style={{
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '8px 12px',
        borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-elev)', border: '1px solid var(--bs-border)',
      }}
    >
      {p.clock && phase !== 'idle' ? (
        <span
          role="timer" aria-label={`${p.clock.text} left`}
          style={{ fontSize: 34 * size, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: clockColour, lineHeight: 1 }}
        >
          {phase === 'ending' ? `ending ${p.clock.text}` : p.clock.text}
        </span>
      ) : (
        <Button tone="primary" onClick={p.onStartClock}>⏱ Start clock</Button>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 200px' }}>
        <span style={{ fontSize: 18 * size, fontWeight: 700 }}>{p.nowName ? `Now: ${p.nowName}` : 'Now: no scene'}</span>
        <span style={{ fontSize: 14 * size, color: 'var(--bs-fg2)' }}>
          {p.next ? `Next: ${p.next.name} in ${formatClock(p.next.inSec)}` : phase !== 'idle' ? 'No more scenes on the clock' : 'Scenes come in once the clock starts'}
        </span>
        {p.loops.length > 0 && (
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }} aria-label={`Loops playing: ${p.loops.join(', ')}`}>
            {p.loops.map((l) => (
              <span key={l} style={{ fontSize: 12 * size, padding: '1px 8px', borderRadius: 999, background: 'var(--bs-accent-muted)', border: '1px solid var(--bs-accent)' }}>{l}</span>
            ))}
          </span>
        )}
      </div>
      {p.cue && (
        // Seen here; spoken by the screen's own announcement, so not announced twice.
        <span
          aria-hidden="true"
          style={{ fontSize: 24 * size, fontWeight: 800, padding: '4px 14px', borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-warn)', color: 'var(--bs-bg)' }}
        >
          {p.cue}
        </span>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Button tone="secondary" onClick={p.onNext} disabled={p.ending}>Next ▶</Button>
        {!p.ending
          ? <Button tone="primary" onClick={p.onEnd}>⏹ End</Button>
          : <Button tone="secondary" onClick={p.onCancelEnding}>Cancel the ending</Button>}
      </div>
    </div>
  );
}
