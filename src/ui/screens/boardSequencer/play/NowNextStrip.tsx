import type { Ref } from 'react';
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
  /** The piece has just ended (A17): a quiet "Ended" shows where the clock was. */
  ended?: boolean;
  /** ▶ Start the piece: from 0:00, whether the board is stopped or already playing. */
  onStartPiece(): void;
  onNext(): void;
  /** For one pass after Next scene: the scene before, and going back to it (B13). */
  undoNext?: { name: string } | null;
  onUndoNext?(): void;
  onEnd(): void;
  onCancelEnding(): void;
  /** Bigger type for the Big board view, read from across the room. */
  big?: boolean;
  /** A cue just given ("1 minute left"), shown large for a few seconds. */
  cue?: string | null;
  /** The colours still waiting for their time: "Waiting: Red at 1:30, Blue at 2:30". */
  waiting?: string | null;
  /** Show puts focus here once the piece starts (never onto ■ Stop, B3). */
  focusRef?: Ref<HTMLDivElement>;
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
      ref={p.focusRef}
      tabIndex={p.focusRef ? -1 : undefined}
      role="region"
      aria-label="Now and next"
      // On the page, under a hairline (L6): the clock light and tabular, the scene's name bold.
      style={{
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '8px 4px 10px',
        borderBottom: '1px solid var(--bs-border)',
      }}
    >
      {p.clock && phase !== 'idle' ? (
        <span
          role="timer" aria-label={`${p.clock.text} left`}
          style={{ fontSize: 34 * size, fontWeight: 300, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', color: clockColour, lineHeight: 1 }}
        >
          {phase === 'ending' ? `ending ${p.clock.text}` : p.clock.text}
        </span>
      ) : (
        <>
          {p.ended && (
            <span data-piece-ended style={{ fontSize: 20 * size, fontWeight: 600, color: 'var(--bs-fg2)' }}>Ended</span>
          )}
          {/* In Show the one thing to press before the piece: as big as Show's own (U3). */}
          <Button tone="primary" onClick={p.onStartPiece} style={p.big ? { fontSize: 22, padding: '10px 26px' } : undefined}>▶ Start the piece</Button>
        </>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 200px' }}>
        <span style={{ fontSize: 20 * size, fontWeight: 600 }}>{p.nowName ? `Now: ${p.nowName}` : 'Now: no scene'}</span>
        <span style={{ fontSize: 14 * size, color: 'var(--bs-fg2)' }}>
          {p.next ? `Next: ${p.next.name} in ${formatClock(p.next.inSec)}` : phase !== 'idle' ? 'No more scenes on the clock' : 'Scenes come in once the clock starts'}
        </span>
        {p.waiting && (
          // Said once as each colour comes in (the board's notice); here it is only seen.
          <span style={{ fontSize: 14 * size, fontWeight: 600 }}>{`⏱ ${p.waiting}`}</span>
        )}
        {p.loops.length > 0 && (
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }} aria-label={`Loops playing: ${p.loops.join(', ')}`}>
            {p.loops.map((l) => (
              <span key={l} style={{ fontSize: 14 * size, padding: '1px 10px', borderRadius: 999, border: '1px solid var(--bs-border-control)' }}>{l}</span>
            ))}
          </span>
        )}
      </div>
      {p.cue && (
        // Seen here; spoken by the screen's own announcement, so not announced twice.
        <span
          aria-hidden="true"
          style={{ fontSize: 24 * size, fontWeight: 600, padding: '4px 14px', borderRadius: 'var(--bs-radius-pill)', background: 'var(--bs-warn)', color: 'var(--bs-warn-fg)' }}
        >
          {p.cue}
        </span>
      )}
      {/* Only once the clock runs (B13): before, Next scene and End had nothing to act on. End
          has its own sign and a quiet style; ■ Stop, elsewhere, is the danger button. */}
      {p.clock && phase !== 'idle' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {/* Beside Next, never in its place: a second press of Next goes on, as it always did. */}
          {p.undoNext && p.onUndoNext && <Button tone="secondary" onClick={p.onUndoNext}>{`↶ Back to ${p.undoNext.name}`}</Button>}
          <Button tone="secondary" onClick={p.onNext} disabled={p.ending}>Next scene ▶</Button>
          {!p.ending
            ? <Button tone="quiet" onClick={p.onEnd} style={{ border: '1px solid var(--bs-border-control)' }}>↘ End piece</Button>
            : <Button tone="secondary" onClick={p.onCancelEnding}>Cancel the ending</Button>}
        </div>
      )}
    </div>
  );
}
