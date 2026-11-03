import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Button } from '../ui/Button';
import { CAPTION_STYLE } from '../ui/text';
import { LoopThumb, type PieceLoop } from './PieceSteps';

export interface LoopRailProps {
  loops: PieceLoop[];
  rows: number;
  cols: number;
  swatchFor(colour: string): string;
  running: boolean;
  /** Why the board can't be kept into an empty place now, or null. */
  keepReason: string | null;
  /** Why the loops can't be changed now (the piece plays, F2): keeping and the menu are off; play and stop stay. */
  locked: string | null;
  /** Why New loop can't open now, or null. */
  newLoopReason: string | null;
  onKeep(slot: number): void;
  onToggle(slot: number): void;
  onRename(slot: number, name: string): void;
  onReplace(slot: number): void;
  onEditNotes(slot: number): void;
  onClear(slot: number): void;
  onNewLoop(): void;
  /** Along the board's side (a column), or under it on a narrow screen (a row). */
  direction?: 'column' | 'row';
}

const THUMB = 36;
/**
 * The rail's height as a column: the caption (20), the eight places with their gaps
 * (8 targets + 7 × 4), the two gaps of 6, and the … and New loop row (4 + a target). The
 * row holding the board and the rail is never shorter than this, so nothing under the
 * board can cover the rail's last places.
 */
export const RAIL_MIN_HEIGHT = 'calc(9 * var(--bs-target) + 64px)';

export const loopName = (l: PieceLoop): string => (l.name.length > 0 ? l.name : `Loop ${l.slot + 1}`);

/** A place's name for a screen reader: starts with the words on it (A9). */
export function placeLabel(l: PieceLoop, running: boolean): string {
  const shown = loopName(l);
  if (l.state === 'empty') return `${shown}: empty. Keep the board here`;
  const what = l.name.length > 0 ? `loop ${l.slot + 1}, ` : '';
  const notes = `${l.notes} ${l.notes === 1 ? 'note' : 'notes'}`;
  const state = running
    ? (l.state === 'playing' ? 'playing' : l.state === 'starting' ? 'starting' : l.state === 'stopping' ? 'stopping' : 'stopped')
    : 'stopped';
  return `${shown}: ${what}${notes}, ${state}`;
}

/**
 * The loop rail (grid investigation, G1): the eight places beside the board, each a small
 * picture of its counters. Press an empty place and the board is kept there, the music
 * playing on; press a kept one and it plays or stops. The … menu holds Rename, Replace with
 * the board, Edit notes and Clear for the place last pressed. New loop, from silence, is the
 * second way. One tab stop: arrows move, Enter presses, Shift+Enter opens the menu.
 */
export function LoopRail(p: LoopRailProps): JSX.Element {
  const [focusSlot, setFocusSlot] = useState(0);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [replaceArmed, setReplaceArmed] = useState(false);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const column = (p.direction ?? 'column') === 'column';

  // The menu closes on Escape or a press elsewhere, and focus goes back to its place.
  useEffect(() => {
    if (menuFor === null) return undefined;
    const away = (e: PointerEvent): void => {
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) { setMenuFor(null); setRenaming(false); setReplaceArmed(false); }
    };
    const key = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      const slot = menuFor;
      setMenuFor(null); setRenaming(false); setReplaceArmed(false);
      refs.current[slot]?.focus();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [menuFor]);

  const press = (l: PieceLoop): void => {
    setFocusSlot(l.slot);
    if (l.state === 'empty') p.onKeep(l.slot);
    else p.onToggle(l.slot);
  };
  const openMenu = (slot: number): void => {
    if (p.locked) return;
    setFocusSlot(slot);
    setRenaming(false);
    setReplaceArmed(false);
    setMenuFor((m) => (m === slot ? null : slot));
  };
  const move = (delta: number): void => {
    const next = (focusSlot + delta + p.loops.length) % p.loops.length;
    setFocusSlot(next);
    refs.current[next]?.focus();
  };

  const menuLoop = menuFor === null ? null : p.loops[menuFor] ?? null;
  return (
    <div
      data-loop-rail=""
      style={{ display: 'flex', flexDirection: column ? 'column' : 'row', gap: 6, alignItems: column ? 'stretch' : 'flex-end', flexShrink: 0, position: 'relative', flexWrap: column ? 'nowrap' : 'wrap' }}
    >
      <span style={{ ...CAPTION_STYLE, padding: column ? '0 0 2px 4px' : '0 4px 10px 0' }}>Loops</span>
      <div
        role="group"
        aria-label="Loops: press an empty place to keep the board there, a kept one to play or stop it"
        style={{ display: 'flex', flexDirection: column ? 'column' : 'row', gap: 4, flexWrap: column ? 'nowrap' : 'wrap' }}
        onKeyDown={(e) => {
          if (e.key === (column ? 'ArrowDown' : 'ArrowRight')) { e.preventDefault(); move(1); }
          else if (e.key === (column ? 'ArrowUp' : 'ArrowLeft')) { e.preventDefault(); move(-1); }
          else if (e.key === 'Home') { e.preventDefault(); move(-focusSlot); }
          else if (e.key === 'End') { e.preventDefault(); move(p.loops.length - 1 - focusSlot); }
          else if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); openMenu(focusSlot); }
        }}
      >
        {p.loops.map((l) => {
          const empty = l.state === 'empty';
          const on = p.running && (l.state === 'playing' || l.state === 'starting');
          const offSoon = p.running && l.state === 'stopping';
          const cantKeep: string | null = empty ? (p.locked ?? p.keepReason) : null;
          return (
            <button
              key={l.slot}
              ref={(el) => { refs.current[l.slot] = el; }}
              type="button"
              data-loop-place={l.slot}
              aria-label={placeLabel(l, p.running)}
              aria-pressed={empty ? undefined : on}
              aria-disabled={cantKeep ? true : undefined}
              title={empty ? (cantKeep ?? 'Keep the board here') : on ? 'Stop this loop' : 'Play this loop'}
              tabIndex={l.slot === focusSlot ? 0 : -1}
              onClick={() => press(l)}
              onContextMenu={(e) => { if (!empty) { e.preventDefault(); openMenu(l.slot); } }}
              onFocus={() => setFocusSlot(l.slot)}
              // A row: the picture, then the name. Eight of them fit beside the board at 768 px tall.
              style={{
                display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8,
                width: 124, minHeight: 'var(--bs-target)', padding: '2px 6px', boxSizing: 'border-box', textAlign: 'left',
                borderRadius: 'var(--bs-radius-md)',
                // Kept: a step up from the page. Playing: an edge in the text colour. Empty: a dashed hairline.
                border: `1px ${empty || offSoon ? 'dashed' : 'solid'} ${on ? 'var(--bs-fg)' : offSoon ? 'var(--bs-border-control)' : empty ? 'var(--bs-border)' : 'transparent'}`,
                background: empty ? 'transparent' : 'var(--bs-raised)',
                color: empty ? (cantKeep ? 'var(--bs-fg3)' : 'var(--bs-fg2)') : 'var(--bs-fg)',
                fontWeight: on ? 600 : 500, cursor: cantKeep ? 'not-allowed' : 'pointer', opacity: empty && cantKeep ? 0.7 : 1,
                // The place's own edge says playing; the app's pressed edge stays off it.
                ['--bs-pressed-edge' as string]: on ? 'var(--bs-fg)' : 'transparent',
              } as CSSProperties}
            >
              <LoopThumb cells={l.cells} rows={p.rows} cols={p.cols} swatchFor={p.swatchFor} width={THUMB} />
              <span style={{ fontSize: 14, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loopName(l)}</span>
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: column ? 'column' : 'row', gap: 4, marginTop: column ? 4 : 0 }}>
        <Button
          tone="quiet"
          aria-expanded={menuFor !== null}
          aria-controls={menuId}
          aria-label={`More for ${loopName(p.loops[focusSlot] ?? p.loops[0])}`}
          title={p.locked ?? 'Rename, replace, edit the notes or clear this loop'}
          disabled={p.locked !== null || (p.loops[focusSlot]?.state ?? 'empty') === 'empty'}
          onClick={() => openMenu(focusSlot)}
          style={{ padding: '0 8px', minWidth: 'var(--bs-target)' }}
        >
          <span aria-hidden="true">…</span>
        </Button>
        <Button tone="quiet" onClick={p.onNewLoop} disabled={p.newLoopReason !== null} aria-label="New loop: from silence" title={p.newLoopReason ?? 'A loop from silence: only the counters sound until you Keep'} style={{ padding: '0 8px' }}>
          New loop
        </Button>
      </div>
      {menuLoop && (
        <div
          ref={menuRef}
          id={menuId}
          role="group"
          aria-label={`${loopName(menuLoop)}: more`}
          style={{
            position: 'absolute', left: column ? 'calc(100% + 6px)' : 0, top: column ? 0 : 'calc(100% + 6px)', zIndex: 30, minWidth: 220, padding: 8,
            display: 'flex', flexDirection: 'column', gap: 4,
            background: 'var(--bs-elev)', border: '1px solid var(--bs-border-control)', borderRadius: 'var(--bs-radius-md)',
          }}
        >
          {renaming ? (
            <input
              type="text" value={menuLoop.name} placeholder={`Loop ${menuLoop.slot + 1}`} aria-label={`Name of loop ${menuLoop.slot + 1}`} autoFocus
              onChange={(e) => p.onRename(menuLoop.slot, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setMenuFor(null); setRenaming(false); refs.current[menuLoop.slot]?.focus(); } }}
              style={{ minHeight: 'var(--bs-target)' }}
            />
          ) : (
            <Button tone="quiet" onClick={() => setRenaming(true)} style={{ justifyContent: 'flex-start' }}>Rename</Button>
          )}
          <Button
            tone="quiet"
            onClick={() => {
              if (!replaceArmed) { setReplaceArmed(true); return; }
              setReplaceArmed(false);
              setMenuFor(null);
              p.onReplace(menuLoop.slot);
              refs.current[menuLoop.slot]?.focus();
            }}
            reason={p.keepReason}
            style={{ justifyContent: 'flex-start' }}
          >
            {replaceArmed ? 'Press again to replace it' : 'Replace with the board'}
          </Button>
          <Button tone="quiet" onClick={() => { setMenuFor(null); p.onEditNotes(menuLoop.slot); }} aria-label={`Edit notes: loop ${menuLoop.slot + 1}`} style={{ justifyContent: 'flex-start' }}>Edit notes</Button>
          <Button tone="quiet" onClick={() => { setMenuFor(null); p.onClear(menuLoop.slot); }} aria-label={`Clear loop ${menuLoop.slot + 1}`} style={{ justifyContent: 'flex-start' }}>Clear</Button>
        </div>
      )}
    </div>
  );
}
