import { useState } from 'react';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Switch';
import { Disclosure } from '../ui/Disclosure';
import { SegmentedControl } from '../ui/SegmentedControl';
import { gridSizeOptions, type BoardSquares } from '../../../../tracking/boardGrid';
import type { BoardSequencerStored } from '../../../../profiles/BoardSequencerConfig';

export type SeatEdge = BoardSequencerStored['seatEdge'];

export interface BoardStepProps {
  boardSquares: BoardSquares;
  rows: number;
  cols: number;
  seatEdge: SeatEdge;
  nudgesEnabled: boolean;
  trackingEnabled: boolean;
  onTrackingEnabled(on: boolean): void;
  playerName: string;
  running: boolean;
  /** True while the corner editor is open, so Find board isn't offered twice. */
  editing: boolean;
  onFindBoard(): void;
  onTapCorners(): void;
  onBoardSquares(n: BoardSquares): void;
  onGrid(patch: { rows?: number; cols?: number }): void;
  onSeatEdge(edge: SeatEdge): void;
  onNudgesEnabled(on: boolean): void;
  /** Warns that confirming corners adopts the stand-in camera. */
  usingFallbackCamera: boolean;
}

const SEAT_OPTIONS: { value: SeatEdge; label: string }[] = [
  { value: 'low', label: 'Low-notes side' },
  { value: 'high', label: 'High-notes side' },
  { value: 'start', label: 'Start side' },
  { value: 'end', label: 'End side' },
];

export function BoardStep({
  boardSquares, rows, cols, seatEdge, nudgesEnabled, trackingEnabled, onTrackingEnabled,
  playerName, running, editing,
  onFindBoard, onTapCorners, onBoardSquares, onGrid, onSeatEdge, onNudgesEnabled, usingFallbackCamera,
}: BoardStepProps): JSX.Element {
  const options = gridSizeOptions(boardSquares, { rows, cols });
  const [moreOpen, setMoreOpen] = useState(options.rowsIsMore || options.colsIsMore);
  const offNearest = options.rowsIsMore || options.colsIsMore;

  return (
    <>
      {usingFallbackCamera && (
        <p role="status" style={{ margin: 0, padding: '8px 10px', borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-warn-tint)' }}>
          Confirming the corners will save the camera that is standing in as your chosen camera.
        </p>
      )}

      {!editing && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button tone="primary" onClick={onFindBoard}>Find board</Button>
          <Button tone="secondary" onClick={onTapCorners}>Tap corners myself</Button>
        </div>
      )}

      <div>
        <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Board size</span>
        <SegmentedControl<BoardSquares>
          label="Board size"
          value={boardSquares}
          onChange={onBoardSquares}
          disabled={running}
          options={[{ value: 8, label: '8 × 8' }, { value: 10, label: '10 × 10' }]}
        />
      </div>

      <div>
        <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Rows</span>
        <SegmentedControl<number>
          label="Rows"
          value={rows}
          onChange={(v) => onGrid({ rows: v })}
          disabled={running}
          options={options.divisors.map((n) => ({ value: n, label: String(n) }))}
        />
      </div>
      <div>
        <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Steps</span>
        <SegmentedControl<number>
          label="Steps"
          value={cols}
          onChange={(v) => onGrid({ cols: v })}
          disabled={running}
          options={options.divisors.map((n) => ({ value: n, label: String(n) }))}
        />
      </div>

      <Disclosure summary="More sizes…" defaultOpen={moreOpen}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--bs-fg2)' }}>
          Cells won&apos;t line up with the squares; detection may be less reliable.
        </p>
        <SegmentedControl<number>
          label="Rows, all sizes"
          value={rows}
          onChange={(v) => { onGrid({ rows: v }); setMoreOpen(true); }}
          disabled={running}
          options={options.moreRows.map((n) => ({ value: n, label: String(n) }))}
        />
        <SegmentedControl<number>
          label="Steps, all sizes"
          value={cols}
          onChange={(v) => { onGrid({ cols: v }); setMoreOpen(true); }}
          disabled={running}
          options={options.moreCols.map((n) => ({ value: n, label: String(n) }))}
        />
        {offNearest && (
          <Button
            tone="secondary"
            onClick={() => onGrid({ rows: options.nearest.rows, cols: options.nearest.cols })}
            disabled={running}
          >
            {`Use ${options.nearest.rows} × ${options.nearest.cols} to match the squares`}
          </Button>
        )}
      </Disclosure>

      <div>
        <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
          {`Where does ${playerName} sit?`}
        </span>
        <SegmentedControl<SeatEdge>
          label={`Where does ${playerName} sit?`}
          value={seatEdge}
          onChange={onSeatEdge}
          options={SEAT_OPTIONS}
        />
      </div>

      <Disclosure summary="Details">
        <Switch
          label="Follow small nudges"
          checked={trackingEnabled}
          onChange={onTrackingEnabled}
          hint="If the board is knocked a little, the grid follows it without stopping the music. A bigger move still asks you to find the board again."
        />
        <Switch
          label="Show the “Board moved?” hint"
          checked={nudgesEnabled}
          onChange={onNudgesEnabled}
          hint="Tells you when the board seems to have shifted. Nothing moves on its own."
        />
      </Disclosure>
    </>
  );
}
