import { Button } from '../ui/Button';
import { SwatchChip } from '../ui/SwatchChip';
import type { BoardPalette } from '../theme/boardTokens';
import { describeChannel, type ColourChannel, type ColourId } from '../../../../tracking/boardColours';
import type { ActiveCell } from '../../../../tracking/BoardSequencerMode';

export interface ReadyStepProps {
  channels: ColourChannel[];
  counts: Partial<Record<ColourId, number>>;
  /** Every piece detected right now, for the plain-language list. */
  detected: ActiveCell[];
  palette: BoardPalette;
  /** A colour that is matching the board itself, from the same rule as the Play nudge. */
  matchingBoard: ColourId | null;
  onRecalibrate(id: ColourId): void;
  onPlay(): void;
  playReason: string | null;
}

export function ReadyStep({
  channels, counts, detected, palette, matchingBoard, onRecalibrate, onPlay, playReason,
}: ReadyStepProps): JSX.Element {
  const nameOf = (id: ColourId): string => {
    const c = channels.find((ch) => ch.id === id);
    return c ? describeChannel(c) : id;
  };
  const matching = matchingBoard ? channels.find((c) => c.id === matchingBoard) ?? null : null;

  return (
    <>
      {matching && (
        <div
          role="alert"
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: 10,
            borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-warn-tint)',
            border: '1px solid var(--bs-border-control)',
          }}
        >
          <span aria-hidden="true" style={{ color: 'var(--bs-warn)', fontWeight: 700 }}>!</span>
          <span style={{ flex: 1 }}>{`${describeChannel(matching)} is matching the board itself.`}</span>
          <Button tone="secondary" onClick={() => onRecalibrate(matching.id)}>
            {`Recalibrate ${describeChannel(matching)}`}
          </Button>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {channels.map((c, i) => (
          <div
            key={c.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
              borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-raised)',
              border: '1px solid var(--bs-border)',
            }}
          >
            <SwatchChip swatch={c.swatch} palette={palette} number={i + 1} size={24} />
            <span>{`${describeChannel(c)}: ${counts[c.id] ?? 0}`}</span>
          </div>
        ))}
      </div>

      {/* The same information in words, for a muted run or a screen reader. */}
      <div>
        <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>On the board now</h3>
        {detected.length === 0
          ? <p style={{ margin: 0, color: 'var(--bs-fg2)' }}>Nothing detected yet.</p>
          : (
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--bs-fg2)' }}>
              {detected.map((d) => (
                <li key={`${d.row},${d.col}`}>{`${nameOf(d.colour)} · row ${d.row + 1} · step ${d.col + 1}`}</li>
              ))}
            </ul>
          )}
      </div>

      <Button tone="primary" full onClick={onPlay} reason={playReason}>▶ Play</Button>
    </>
  );
}
