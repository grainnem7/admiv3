import { SwatchChip } from '../ui/SwatchChip';
import { Button } from '../ui/Button';
import type { BoardPalette } from '../theme/boardTokens';
import { describeChannel, ROLE_LABELS, type ColourChannel } from '../../../../tracking/boardColours';

export interface LaptopBoardBarProps {
  /** The colours with a job: the counters there are to put down. */
  channels: ColourChannel[];
  /** Every colour this device knows, with or without a job. */
  knownColours: number;
  selected: string;
  onSelect(id: string): void;
  count: number;
  onClear(): void;
  onAddColours(): void;
  palette: BoardPalette;
}

/**
 * Above the laptop board: which counter a click puts down, how many are down, and a way
 * to clear them. With no colours yet (a laptop that has never seen the board), one button
 * adds four ready-made ones so there is something to play straight away.
 */
export function LaptopBoardBar({
  channels, knownColours, selected, onSelect, count, onClear, onAddColours, palette,
}: LaptopBoardBarProps): JSX.Element {
  if (channels.length === 0) {
    return (
      <div role="group" aria-label="Laptop board" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--bs-fg2)', fontSize: 13, flex: '1 1 240px' }}>
          {knownColours === 0
            ? 'No counter colours yet. Add four to play with now; the real counters can be added later in Set up → Colours.'
            : 'No colour has a job yet. Give one a job in Set up → Colours, or add four ready-made colours.'}
        </span>
        <Button tone="primary" onClick={onAddColours}>Add four colours</Button>
      </div>
    );
  }
  return (
    <div role="group" aria-label="Laptop board" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <div role="radiogroup" aria-label="Counter to put down" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {channels.map((c, i) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={selected === c.id}
            onClick={() => onSelect(c.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', minHeight: 'var(--bs-target)',
              borderRadius: 'var(--bs-radius-md)', border: `2px solid ${selected === c.id ? 'var(--bs-accent)' : 'var(--bs-border-control)'}`,
              background: selected === c.id ? 'var(--bs-accent-muted)' : 'var(--bs-raised)', color: 'inherit', cursor: 'pointer',
            }}
          >
            <SwatchChip swatch={c.swatch} palette={palette} number={i + 1} size={20} />
            <span>{describeChannel(c)}</span>
            <span style={{ fontSize: 12, color: 'var(--bs-fg2)' }}>{ROLE_LABELS[c.role]}</span>
          </button>
        ))}
      </div>
      <span style={{ fontSize: 12, color: 'var(--bs-fg2)', flex: '1 1 160px' }}>
        {`${count} on the board. Click a square to put a counter down, click it again to lift it.`}
      </span>
      <Button tone="quiet" onClick={onClear} reason={count === 0 ? 'The board is already empty.' : null}>Clear the board</Button>
    </div>
  );
}
