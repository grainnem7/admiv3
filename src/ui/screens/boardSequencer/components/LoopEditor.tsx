import { useState } from 'react';
import { SwatchChip } from '../ui/SwatchChip';
import { Button } from '../ui/Button';
import type { BoardPalette } from '../theme/boardTokens';
import { describeChannel, type ColourChannel } from '../../../../tracking/boardColours';
import type { StoredLoopCell } from '../../../../profiles/BoardSequencerConfig';

export interface LoopEditorProps {
  rows: number;
  cols: number;
  /** The colours with a sequenced job: the only ones a loop can hold. */
  channels: ColourChannel[];
  cells: StoredLoopCell[];
  palette: BoardPalette;
  onChange(cells: StoredLoopCell[]): void;
}

/**
 * Draw a loop on screen, with no board and no camera: pick a colour, tap the squares.
 * So loops can be prepared at home before a session, and a facilitator can fix one
 * square without rebuilding the whole board. Tapping a square of the chosen colour clears
 * it; a square of another colour takes the chosen colour.
 */
export function LoopEditor({ rows, cols, channels, cells, palette, onChange }: LoopEditorProps): JSX.Element {
  const [colour, setColour] = useState<string>(channels[0]?.id ?? '');
  const at = new Map(cells.map((c) => [`${c.row},${c.col}`, c]));
  const swatchOf = (id: string): string => channels.find((c) => c.id === id)?.swatch ?? '#888';
  const nameOf = (id: string): string => { const c = channels.find((ch) => ch.id === id); return c ? describeChannel(c) : id; };

  const tap = (row: number, col: number): void => {
    if (!colour) return;
    const key = `${row},${col}`;
    const here = at.get(key);
    const rest = cells.filter((c) => !(c.row === row && c.col === col));
    onChange(here && here.colour === colour ? rest : [...rest, { row, col, colour }]);
  };

  if (channels.length === 0) {
    return <p style={{ margin: 0, color: 'var(--bs-fg2)' }}>Give at least one colour a melody, bass, drums or chord job first.</p>;
  }
  const size = Math.max(22, Math.min(40, Math.floor(360 / Math.max(rows, cols))));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div role="radiogroup" aria-label="Colour to draw with" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {channels.map((c, i) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={colour === c.id}
            onClick={() => setColour(c.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', minHeight: 'var(--bs-target)',
              borderRadius: 'var(--bs-radius-md)', border: `2px solid ${colour === c.id ? 'var(--bs-accent)' : 'var(--bs-border-control)'}`,
              background: colour === c.id ? 'var(--bs-accent-muted)' : 'var(--bs-raised)', color: 'inherit',
            }}
          >
            <SwatchChip swatch={c.swatch} palette={palette} number={i + 1} size={20} />
            {describeChannel(c)}
          </button>
        ))}
      </div>
      <div
        role="grid"
        aria-label={`Loop, ${rows} rows by ${cols} steps`}
        style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${size}px)`, gap: 3 }}
      >
        {Array.from({ length: rows * cols }, (_, k) => {
          const row = Math.floor(k / cols);
          const col = k % cols;
          const here = at.get(`${row},${col}`);
          return (
            <button
              key={k}
              type="button"
              role="gridcell"
              aria-label={`Row ${row + 1}, step ${col + 1}${here ? `: ${nameOf(here.colour)}` : ''}`}
              aria-pressed={here !== undefined}
              onClick={() => tap(row, col)}
              style={{
                width: size, height: size, padding: 0, borderRadius: 6,
                border: `1px solid ${here ? '#fff' : 'var(--bs-border)'}`,
                background: here ? swatchOf(here.colour) : 'var(--bs-raised)',
              }}
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--bs-fg2)', flex: 1 }}>
          {`${cells.length} ${cells.length === 1 ? 'note' : 'notes'}. Bottom row is the lowest note; left to right is time.`}
        </span>
        <Button tone="quiet" onClick={() => onChange([])} reason={cells.length === 0 ? 'Already empty.' : null}>Clear</Button>
      </div>
    </div>
  );
}
