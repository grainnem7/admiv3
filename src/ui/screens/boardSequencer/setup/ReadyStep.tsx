import { useRef } from 'react';
import { Button } from '../ui/Button';
import { SwatchChip } from '../ui/SwatchChip';
import type { BoardPalette } from '../theme/boardTokens';
import { describeChannel, type ColourChannel, type ColourId } from '../../../../tracking/boardColours';
import type { ActiveCell } from '../../../../tracking/BoardSequencerMode';
import { steadyCells, type SteadyMemory } from '../steadyCells';

export interface ReadyStepProps {
  channels: ColourChannel[];
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
  channels, detected, palette, matchingBoard, onRecalibrate, onPlay, playReason,
}: ReadyStepProps): JSX.Element {
  const nameOf = (id: ColourId): string => {
    const c = channels.find((ch) => ch.id === id);
    return c ? describeChannel(c) : id;
  };
  const matching = matchingBoard ? channels.find((c) => c.id === matchingBoard) ?? null : null;
  // Straight from the camera, the list flickered and reordered every frame; see steadyCells.
  const memory = useRef<SteadyMemory>(new Map());
  const steady = steadyCells(memory.current, detected, performance.now());
  // The counts come from the same steady list, so the chips and the list always agree.
  const steadyCounts = new Map<ColourId, number>();
  for (const d of steady) steadyCounts.set(d.colour, (steadyCounts.get(d.colour) ?? 0) + 1);

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

      <Button tone="primary" full onClick={onPlay} reason={playReason}>▶ Play</Button>

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
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{`${describeChannel(c)}: ${steadyCounts.get(c.id) ?? 0}`}</span>
          </div>
        ))}
      </div>

      {/* The same information in words, for a muted run or a screen reader. */}
      <div>
        <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>On the board now</h3>
        {steady.length === 0
          ? <p style={{ margin: 0, color: 'var(--bs-fg2)' }}>Nothing detected yet.</p>
          : (
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--bs-fg2)' }}>
              {steady.map((d) => (
                <li key={`${d.row},${d.col},${d.colour}`}>{`${nameOf(d.colour)} · row ${d.row + 1} · step ${d.col + 1}`}</li>
              ))}
            </ul>
          )}
      </div>
    </>
  );
}
