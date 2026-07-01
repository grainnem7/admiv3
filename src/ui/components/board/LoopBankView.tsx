import type { StoredLoopCell } from '../../../profiles/BoardSequencerConfig';

/** One slot's state for the mini-view. */
export interface LoopSlotView {
  /** Saved cells, or null if the slot is empty. */
  cells: StoredLoopCell[] | null;
  /** A counter is on the slot right now (playing). */
  active: boolean;
}

/**
 * On-screen mini-views of the loop bank: one thumbnail per slot showing its captured
 * pattern (coloured dots), bordered when active, dimmed when paused. Guarantees every
 * layer stays visible even though the physical grid only shows the live pattern.
 */
export default function LoopBankView({
  slots, rows, cols, swatchById, onClear,
}: {
  slots: LoopSlotView[];
  rows: number;
  cols: number;
  swatchById: Map<string, string>;
  onClear: (slot: number) => void;
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {slots.map((slot, i) => {
        const filled = slot.cells != null;
        const dot = new Map<string, string>();
        for (const c of slot.cells ?? []) dot.set(`${c.row},${c.col}`, swatchById.get(c.colour) ?? '#888');
        return (
          <div
            key={i}
            style={{
              display: 'flex', flexDirection: 'column', gap: 3, padding: 4, borderRadius: 4,
              border: `2px solid ${slot.active ? 'rgba(80,200,255,0.95)' : '#ffffff22'}`,
              opacity: filled ? (slot.active ? 1 : 0.55) : 0.3,
            }}
          >
            <span style={{ fontSize: 10, opacity: 0.7 }}>Slot {i + 1}</span>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, 6px)`,
                gridTemplateRows: `repeat(${rows}, 6px)`,
                gap: 1,
              }}
            >
              {Array.from({ length: rows * cols }, (_, k) => {
                const r = Math.floor(k / cols);
                const c = k % cols;
                const hex = dot.get(`${r},${c}`);
                return (
                  <div key={k} style={{ width: 6, height: 6, background: hex ?? '#ffffff10', borderRadius: 1 }} />
                );
              })}
            </div>
            <button
              type="button" disabled={!filled} onClick={() => onClear(i)}
              style={{ fontSize: 10, opacity: filled ? 0.8 : 0.3 }}
            >
              Clear
            </button>
          </div>
        );
      })}
    </div>
  );
}
