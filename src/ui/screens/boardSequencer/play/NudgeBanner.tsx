import { Button } from '../ui/Button';
import type { NudgeSignal } from '../playNudge';

export interface NudgeBannerProps {
  signal: NudgeSignal | null;
  /** The colour's name, for the colour-matches-board message. */
  nameFor(id: string): string;
  onFindBoard(): void;
  onRecalibrate(id: string): void;
  onDismiss(kind: NudgeSignal['kind']): void;
  /** Knock guard: let the ghosts go, or keep them as a loop. */
  onLetGo?(): void;
  onSaveAsLoop?(): void;
  /** Why Save as loop isn't available (no loop bank, or no empty slot). */
  saveReason?: string | null;
  align?: 'start' | 'end';
}

const MESSAGE: Record<NudgeSignal['kind'], string> = {
  'board-moved': "Some pieces aren't lining up with the grid. Has the board moved?",
  'colour-matches-board': '',            // built from the colour's name
  'something-resting': 'Something is resting on the board — pieces under it are on hold.',
  knocked: 'Pieces were knocked — the pattern is still playing.',
};

/**
 * A hint, never an action. The slot is always reserved, so a nudge appearing or going
 * can't move the board, the legend or the transport under someone's hand.
 *
 * A knock is the exception to "Not now": something has already changed, so it stays until
 * the player lets it go, saves it, or puts the pieces back.
 */
export function NudgeBanner({
  signal, nameFor, onFindBoard, onRecalibrate, onDismiss, onLetGo, onSaveAsLoop,
  saveReason = null, align = 'end',
}: NudgeBannerProps): JSX.Element {
  const name = signal && signal.kind === 'colour-matches-board' ? nameFor(signal.channelId) : '';
  return (
    <div
      aria-hidden={signal === null || undefined}
      style={{
        minHeight: 'calc(var(--bs-target) + 8px)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: signal ? '4px 10px' : 0,
        borderRadius: 'var(--bs-radius-md)',
        background: signal ? 'var(--bs-warn-tint)' : 'transparent',
        border: signal ? '1px solid var(--bs-border-control)' : '1px solid transparent',
        flexDirection: align === 'start' ? 'row-reverse' : 'row',
      }}
    >
      {signal && (
        <>
          <span aria-hidden="true" style={{ color: 'var(--bs-warn)', fontWeight: 700 }}>
            {signal.kind === 'knocked' ? '↺' : signal.kind === 'something-resting' ? '✋' : '!'}
          </span>
          <span style={{ flex: 1 }}>
            {signal.kind === 'colour-matches-board'
              ? `${name} is matching the board itself.`
              : MESSAGE[signal.kind]}
          </span>
          {signal.kind === 'board-moved' && <Button tone="secondary" onClick={onFindBoard}>Find board</Button>}
          {signal.kind === 'colour-matches-board' && (
            <Button tone="secondary" onClick={() => onRecalibrate(signal.channelId)}>{`Recalibrate ${name}`}</Button>
          )}
          {signal.kind === 'knocked' && (
            <>
              <Button tone="secondary" onClick={onSaveAsLoop} reason={saveReason}>Save as loop</Button>
              <Button tone="primary" onClick={onLetGo}>Let go</Button>
            </>
          )}
          {signal.kind !== 'knocked' && (
            <Button tone="quiet" onClick={() => onDismiss(signal.kind)}>Not now</Button>
          )}
        </>
      )}
    </div>
  );
}
