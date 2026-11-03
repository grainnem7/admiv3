import { useRef, useState, type CSSProperties } from 'react';
import type { Scene } from '../../../../songs/performance/launcher';
import { cellLabel, cellOn, gridColumns, moveCell, toggledLoops, type CellPos } from '../../../../songs/performance/pieceGrid';
import { CAPTION_STYLE } from '../ui/text';
import type { PieceLoop } from './PieceSteps';

export interface PieceGridProps {
  scenes: readonly Scene[];
  /** Every loop place; only the kept ones are rows. */
  loops: readonly PieceLoop[];
  lengthSec: number;
  currentScene: number | null;
  running: boolean;
  /** A loop turned on or off in a scene (by the scene's index in the list). */
  onToggle(sceneIndex: number, loops: number[]): void;
  /** The column's heading pressed: that scene is selected (its row opens below). */
  onSelectScene(id: string): void;
  /** The row's name pressed: that loop plays or stops, as in the rail. */
  onToggleLoop(slot: number): void;
}

const NAME_W = 96;
const ROW_H = 44;

const loopName = (l: PieceLoop): string => (l.name.length > 0 ? l.name : `Loop ${l.slot + 1}`);

/**
 * The piece as one picture (grid investigation, G2): under the timeline's ruler, a row for
 * each kept loop and a column for each scene, a dot where the loop plays in the scene. Press
 * a cell to turn the loop on or off there; press a row's name to hear the loop; the column
 * on now is lit while the piece plays. One tab stop: arrows move, Enter presses.
 */
export function PieceGrid(p: PieceGridProps): JSX.Element {
  const columns = gridColumns(p.scenes, p.lengthSec, p.currentScene);
  const rows = p.loops.filter((l) => l.state !== 'empty');
  const [focus, setFocus] = useState<CellPos>({ r: 0, c: 0 });
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const at = { r: Math.min(focus.r, Math.max(0, rows.length - 1)), c: Math.min(focus.c, Math.max(0, columns.length - 1)) };
  const key = (r: number, c: number): string => `${r},${c}`;

  if (rows.length === 0) {
    return (
      <p data-piece-grid-empty="" style={{ margin: 0, fontSize: 14, color: 'var(--bs-fg2)' }}>
        No loops yet. Keep one in the rail beside the board: play something, then press an empty place.
      </p>
    );
  }
  return (
    <div
      role="grid"
      aria-label="Which loops play in which scene"
      data-piece-grid=""
      style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--bs-border)' }}
      onKeyDown={(e) => {
        const next = moveCell(at, e.key, rows.length, columns.length);
        if (!next) return;
        e.preventDefault();
        setFocus(next);
        refs.current.get(key(next.r, next.c))?.focus();
      }}
    >
      <div role="row" style={{ display: 'flex', height: 24, alignItems: 'center' }}>
        <span role="columnheader" style={{ ...CAPTION_STYLE, width: NAME_W, flexShrink: 0 }}>Loops</span>
        <span role="columnheader" style={{ ...CAPTION_STYLE, flex: 1 }}>Scenes</span>
      </div>
      {rows.map((l, r) => (
        <div role="row" key={l.slot} style={{ display: 'flex', height: ROW_H, alignItems: 'stretch', borderTop: '1px solid var(--bs-border)' }}>
          <div role="rowheader" style={{ width: NAME_W, flexShrink: 0, display: 'flex', alignItems: 'center', minWidth: 0 }}>
            <button
              type="button"
              aria-label={`${loopName(l)}: ${p.running && (l.state === 'playing' || l.state === 'starting') ? 'playing. Stop it' : 'play it'}`}
              aria-pressed={p.running && (l.state === 'playing' || l.state === 'starting')}
              tabIndex={-1}
              onClick={() => p.onToggleLoop(l.slot)}
              title={p.running && l.state === 'playing' ? 'Stop this loop' : 'Play this loop'}
              style={{
                minHeight: ROW_H, minWidth: 0, width: '100%', padding: '0 6px 0 0', border: '1px solid transparent', borderRadius: 0, background: 'transparent',
                textAlign: 'left', fontSize: 14, fontWeight: 500, color: 'var(--bs-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                ['--bs-pressed-edge' as string]: 'transparent',
              } as CSSProperties}
            >
              {loopName(l)}
            </button>
          </div>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            {columns.map((col, c) => {
              const scene = p.scenes[col.i];
              const on = cellOn(scene, l.slot);
              const focused = at.r === r && at.c === c;
              return (
                <div
                  role="gridcell"
                  key={col.id}
                  style={{
                    position: 'absolute', top: 0, bottom: 0, left: `${col.leftPct}%`, width: `${col.widthPct}%`, boxSizing: 'border-box',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderLeft: '1px solid var(--bs-border)',
                    // The column on now, lit while the piece plays, as the board's step is.
                    background: p.running && col.current ? 'var(--bs-raised)' : 'transparent',
                  }}
                >
                  <button
                    type="button"
                    ref={(el) => { if (el) refs.current.set(key(r, c), el); else refs.current.delete(key(r, c)); }}
                    aria-label={cellLabel(loopName(l), col.name)}
                    aria-pressed={on}
                    tabIndex={focused ? 0 : -1}
                    title={on ? `${loopName(l)} plays in ${col.name}: press to take it out` : `Press to play ${loopName(l)} in ${col.name}`}
                    onFocus={() => setFocus({ r, c })}
                    onClick={() => p.onToggle(col.i, toggledLoops(scene, l.slot))}
                    style={{
                      width: '100%', height: '100%', minWidth: 0, minHeight: 0, padding: 0, border: '1px solid transparent', borderRadius: 0,
                      background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                      // The dot says on or off; no edge from the pressed state.
                      ['--bs-pressed-edge' as string]: 'transparent',
                    } as CSSProperties}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: on ? 14 : 5, height: on ? 14 : 5, borderRadius: '50%',
                        background: on ? 'var(--bs-fg)' : 'var(--bs-border-control)',
                      }}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div role="row" style={{ display: 'flex', height: 0 }}>
        {/* The column headings are the timeline above; they are named here for the grid. */}
        {columns.map((col) => (
          <button key={col.id} type="button" role="columnheader" tabIndex={-1} onClick={() => p.onSelectScene(col.id)} aria-label={`${col.name}: open`} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', border: 0, padding: 0, minHeight: 0, minWidth: 0 }}>{col.name}</button>
        ))}
      </div>
    </div>
  );
}
