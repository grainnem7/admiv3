import { Button } from '../ui/Button';
import type { NudgeSignal } from '../playNudge';

export interface NudgeBannerProps {
  signal: NudgeSignal | null;
  /** The colour's name, for the colour-matches-board message. */
  nameFor(id: string): string;
  onFindBoard(): void;
  onRecalibrate(id: string): void;
  onDismiss(kind: NudgeSignal['kind']): void;
  align?: 'start' | 'end';
}

/**
 * A hint, never an action. The slot is always reserved, so a nudge appearing or going
 * can't move the board, the legend or the transport under someone's hand.
 */
export function NudgeBanner({
  signal, nameFor, onFindBoard, onRecalibrate, onDismiss, align = 'end',
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
          <span aria-hidden="true" style={{ color: 'var(--bs-warn)', fontWeight: 700 }}>!</span>
          <span style={{ flex: 1 }}>
            {signal.kind === 'board-moved'
              ? "Some pieces aren't lining up with the grid. Has the board moved?"
              : `${name} is matching the board itself.`}
          </span>
          {signal.kind === 'board-moved'
            ? <Button tone="secondary" onClick={onFindBoard}>Find board</Button>
            : <Button tone="secondary" onClick={() => onRecalibrate(signal.channelId)}>{`Recalibrate ${name}`}</Button>}
          <Button tone="quiet" onClick={() => onDismiss(signal.kind)}>Not now</Button>
        </>
      )}
    </div>
  );
}
