import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { RAIL_COLUMN } from '../../../../songs/performance/launcher';
import { Button } from '../ui/Button';
import { CAPTION_STYLE } from '../ui/text';
import { LoopThumb, type PieceLoop } from './PieceSteps';

export interface LoopRailProps {
  loops: PieceLoop[];
  rows: number;
  cols: number;
  swatchFor(colour: string): string;
  running: boolean;
  /** Why the board can't be kept into the dashed place now, or null. */
  keepReason: string | null;
  /** Why the loops can't be changed now (the piece plays, F2): keeping and the menu are off; play and stop stay. */
  locked: string | null;
  /** Why New loop from silence can't open now, or null. */
  newLoopReason: string | null;
  /** The place the next Keep fills (slotForKeep): the one dashed place. Null = every place full. */
  keepSlot: number | null;
  /** Steps until the next pass, when a starting or stopping loop changes over; null when stopped. */
  stepsToPass?: number | null;
  onKeep(slot: number): void;
  onToggle(slot: number): void;
  onRename(slot: number, name: string): void;
  onReplace(slot: number): void;
  onEditNotes(slot: number): void;
  onClear(slot: number): void;
  onNewLoop(): void;
  /** Along the board's side (a column), or under it on a narrow screen (a row). */
  direction?: 'column' | 'row';
  /** New loop (from silence) is open: when it closes, focus comes back to … more, where it was opened (T1-04). */
  newLoopOpen?: boolean;
}

const THUMB = 36;
/**
 * The rail's height as a column (past eight places it adds a second column, never more
 * height): the caption (20), eight places with their gaps
 * (8 targets + 7 × 4), the two gaps of 6, and the … row (4 + a target). The row holding the
 * board and the rail is never shorter than this, so nothing under the board can cover the
 * rail's last places; and it fits a 768 px screen (U4).
 */
export const RAIL_MIN_HEIGHT = 'calc(9 * var(--bs-target) + 64px)';

export const loopName = (l: PieceLoop): string => (l.name.length > 0 ? l.name : `Loop ${l.slot + 1}`);

/** A place's name for a screen reader: starts with the words on it (A9). */
export function placeLabel(l: PieceLoop, running: boolean, stepsToPass: number | null = null): string {
  const shown = loopName(l);
  if (l.state === 'empty') return `${shown}: empty. Keep the board here`;
  const what = l.name.length > 0 ? `loop ${l.slot + 1}, ` : '';
  const notes = `${l.notes} ${l.notes === 1 ? 'note' : 'notes'}`;
  const state = running
    ? (l.state === 'playing' ? 'playing' : l.state === 'starting' ? 'starting' : l.state === 'stopping' ? 'stopping' : 'stopped')
    : 'stopped';
  const wait = stepsToPass !== null && (state === 'starting' || state === 'stopping') ? `, in ${stepsToPass} ${stepsToPass === 1 ? 'step' : 'steps'}` : '';
  return `${shown}: ${what}${notes}, ${state}${wait}`;
}

/**
 * What the rail shows (K1): the loops you have, in slot order, then the one place the next
 * Keep fills. The empty places in between are not shown: eight grey "Loop N" boxes read as
 * a list, not as something to press.
 */
export function railPlaces(loops: readonly PieceLoop[], keepSlot: number | null): { kept: PieceLoop[]; dashed: PieceLoop | null } {
  return {
    kept: loops.filter((l) => l.state !== 'empty'),
    dashed: keepSlot === null ? null : loops.find((l) => l.slot === keepSlot) ?? null,
  };
}

/**
 * The loop rail (grid investigation, G1; Keep design, K1): the loops you have kept beside the
 * board, each a small picture of its counters with ▶ or ■, and one dashed "+ Keep as loop"
 * place, which keeps the board as the next loop (as the panel's Keep as loop button does).
 * Press a kept one and it plays or stops. The … menu holds Rename, Replace with the board,
 * Edit notes and Clear for the place last pressed, and New loop from silence, the second
 * way. One tab stop: arrows move, Enter presses, Shift+Enter opens the menu.
 */
export function LoopRail(p: LoopRailProps): JSX.Element {
  const { kept, dashed } = railPlaces(p.loops, p.keepSlot);
  // The places as shown, in order: what the arrows move over.
  const shown: PieceLoop[] = dashed ? [...kept, dashed] : kept;
  const [focusSlot, setFocusSlot] = useState<number>(shown[0]?.slot ?? 0);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [replaceArmed, setReplaceArmed] = useState(false);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  // Done or Leave closes New loop: focus goes back to … more, never to the page (T1-04).
  const wasOpen = useRef(p.newLoopOpen === true);
  useEffect(() => {
    const open = p.newLoopOpen === true;
    if (wasOpen.current && !open && (document.activeElement === null || document.activeElement === document.body)) moreRef.current?.focus();
    wasOpen.current = open;
  }, [p.newLoopOpen]);
  const column = (p.direction ?? 'column') === 'column';
  // A place that has gone (cleared, or the dashed one filled): focus the first one shown.
  const focusIndex = Math.max(0, shown.findIndex((l) => l.slot === focusSlot));
  const focused = shown[focusIndex] ?? null;

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
  // The menu is for a kept loop; with none focused (or none kept) it holds New loop alone.
  // -1 marks that menu, so its id and closing work as a place's would.
  const openMenu = (slot: number): void => {
    if (p.locked) return;
    setRenaming(false);
    setReplaceArmed(false);
    setMenuFor((m) => (m === slot ? null : slot));
  };
  const move = (delta: number): void => {
    if (shown.length === 0) return;
    const next = (focusIndex + delta + shown.length) % shown.length;
    setFocusSlot(shown[next].slot);
    refs.current[shown[next].slot]?.focus();
  };

  const menuLoop = menuFor === null ? null : p.loops.find((l) => l.slot === menuFor && l.state !== 'empty') ?? null;
  const menuOpen = menuFor !== null;
  const menuSlot = focused && focused.state !== 'empty' ? focused.slot : -1;
  return (
    <div
      data-loop-rail=""
      style={{ display: 'flex', flexDirection: column ? 'column' : 'row', gap: 6, alignItems: column ? 'stretch' : 'flex-end', flexShrink: 0, position: 'relative', flexWrap: column ? 'nowrap' : 'wrap' }}
    >
      <span style={{ ...CAPTION_STYLE, padding: column ? '0 0 2px 4px' : '0 4px 10px 0' }}>Loops · press to play or stop</span>
      <div
        role="group"
        aria-label="Loops: press a kept loop to play or stop it, the dashed place to keep the board as the next loop"
        // Up to sixteen loops: past eight the places run on in a second column of eight, so the
        // rail is never taller than it was, and every loop stays in sight.
        style={column && shown.length > RAIL_COLUMN
          ? { display: 'grid', gridTemplateRows: `repeat(${RAIL_COLUMN}, auto)`, gridAutoFlow: 'column', gap: 4, alignContent: 'start' }
          : { display: 'flex', flexDirection: column ? 'column' : 'row', gap: 4, flexWrap: column ? 'nowrap' : 'wrap' }}
        onKeyDown={(e) => {
          if (e.key === (column ? 'ArrowDown' : 'ArrowRight')) { e.preventDefault(); move(1); }
          else if (e.key === (column ? 'ArrowUp' : 'ArrowLeft')) { e.preventDefault(); move(-1); }
          else if (e.key === 'Home') { e.preventDefault(); move(-focusIndex); }
          else if (e.key === 'End') { e.preventDefault(); move(shown.length - 1 - focusIndex); }
          else if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); openMenu(menuSlot); }
        }}
      >
        {shown.map((l) => {
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
              aria-label={empty ? `Keep as loop: keep the board as loop ${l.slot + 1}` : placeLabel(l, p.running, p.stepsToPass ?? null)}
              aria-pressed={empty ? undefined : on}
              aria-disabled={cantKeep ? true : undefined}
              title={empty ? (cantKeep ?? 'Keep the board as the next loop') : on ? 'Stop this loop' : 'Play this loop'}
              tabIndex={l.slot === (focused?.slot ?? -1) ? 0 : -1}
              onClick={() => press(l)}
              onContextMenu={(e) => { if (!empty) { e.preventDefault(); setFocusSlot(l.slot); openMenu(l.slot); } }}
              onFocus={() => setFocusSlot(l.slot)}
              // A row: the picture, then the name. Eight of them fit beside the board at 768 px tall.
              style={{
                display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: empty ? 'center' : 'flex-start',
                // Room for the picture, a name like "Loop 12" and ▶ (at 124 only "Loop 1" fitted).
                width: 140, minHeight: 'var(--bs-target)', padding: '2px 6px', boxSizing: 'border-box', textAlign: 'left',
                borderRadius: 'var(--bs-radius-md)',
                // Kept: a step up from the page. Playing: an edge in the text colour. The dashed place: a hairline.
                border: `1px ${empty || offSoon ? 'dashed' : 'solid'} ${on ? 'var(--bs-fg)' : offSoon ? 'var(--bs-border-control)' : empty ? 'var(--bs-border-control)' : 'transparent'}`,
                background: empty ? 'transparent' : 'var(--bs-raised)',
                color: empty ? (cantKeep ? 'var(--bs-fg3)' : 'var(--bs-fg2)') : 'var(--bs-fg)',
                fontWeight: on ? 600 : 500, cursor: cantKeep ? 'not-allowed' : 'pointer', opacity: empty && cantKeep ? 0.7 : 1,
                // The place's own edge says playing; the app's pressed edge stays off it.
                ['--bs-pressed-edge' as string]: on ? 'var(--bs-fg)' : 'transparent',
              } as CSSProperties}
            >
              {empty ? (
                <span style={{ fontSize: 14 }}>+ Keep as loop</span>
              ) : (
                <>
                  <LoopThumb cells={l.cells} rows={p.rows} cols={p.cols} swatchFor={p.swatchFor} width={THUMB} />
                  <span style={{ fontSize: 14, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loopName(l)}</span>
                  {/* A loop changes over on the next pass: the steps to go, counted down on its place. */}
                  {(l.state === 'starting' || offSoon) && p.running && typeof p.stepsToPass === 'number' && (
                    <span aria-hidden="true" data-steps-to-pass="" style={{ fontSize: 14, color: 'var(--bs-fg2)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{`in ${p.stepsToPass}`}</span>
                  )}
                  {/* Playing or stopped, by shape as well as by edge (never colour alone); the countdown takes its place while it shows. */}
                  {!((l.state === 'starting' || offSoon) && p.running && typeof p.stepsToPass === 'number') && (
                    <span aria-hidden="true" style={{ fontSize: 14, color: on ? 'var(--bs-fg)' : 'var(--bs-fg2)', flexShrink: 0 }}>{on ? '■' : '▶'}</span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>
      {kept.length === 0 && (
        <span style={{ fontSize: 14, color: 'var(--bs-fg2)', padding: column ? '0 4px' : '0 4px 10px 0', maxWidth: 124 }}>Loops you keep appear here.</span>
      )}
      {/* The … menu: for the place last pressed, and New loop from silence (the second way). */}
      <div style={{ display: 'flex', flexDirection: 'row', gap: 4, marginTop: column ? 4 : 0, alignItems: 'center' }}>
        <Button
          ref={moreRef}
          tone="quiet"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={menuSlot >= 0 && focused ? `More for ${loopName(focused)}` : 'More: new loop from silence'}
          title={p.locked ?? (menuSlot >= 0 ? 'Rename, replace, edit the notes or clear this loop, or a new loop from silence' : 'A new loop from silence')}
          disabled={p.locked !== null}
          onClick={() => openMenu(menuSlot)}
          style={{ padding: '0 8px', minWidth: 'var(--bs-target)' }}
        >
          <span aria-hidden="true">… more</span>
        </Button>
      </div>
      {menuOpen && (
        <div
          ref={menuRef}
          id={menuId}
          role="group"
          aria-label={`${menuLoop ? loopName(menuLoop) : 'Loops'}: more`}
          style={{
            position: 'absolute', left: column ? 'calc(100% + 6px)' : 0, top: column ? 0 : 'calc(100% + 6px)', zIndex: 30, minWidth: 220, padding: 8,
            display: 'flex', flexDirection: 'column', gap: 4,
            background: 'var(--bs-elev)', border: '1px solid var(--bs-border-control)', borderRadius: 'var(--bs-radius-md)',
          }}
        >
          {menuLoop && (renaming ? (
            <input
              type="text" value={menuLoop.name} placeholder={`Loop ${menuLoop.slot + 1}`} aria-label={`Name of loop ${menuLoop.slot + 1}`} autoFocus
              onChange={(e) => p.onRename(menuLoop.slot, e.target.value)}
              // Enter closes the menu and goes back to the place. Its default press must not land
              // on that place as a click, which toggled the loop just renamed (e2e, 5 Nov).
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setMenuFor(null); setRenaming(false); refs.current[menuLoop.slot]?.focus(); } }}
              style={{ minHeight: 'var(--bs-target)' }}
            />
          ) : (
            <Button tone="quiet" onClick={() => setRenaming(true)} style={{ justifyContent: 'flex-start' }}>Rename</Button>
          ))}
          {menuLoop && (
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
          )}
          {menuLoop && <Button tone="quiet" onClick={() => { setMenuFor(null); p.onEditNotes(menuLoop.slot); }} aria-label={`Edit notes: loop ${menuLoop.slot + 1}`} style={{ justifyContent: 'flex-start' }}>Edit notes</Button>}
          {menuLoop && <Button tone="quiet" onClick={() => { setMenuFor(null); p.onClear(menuLoop.slot); }} aria-label={`Clear loop ${menuLoop.slot + 1}`} style={{ justifyContent: 'flex-start' }}>Clear</Button>}
          <Button
            tone="quiet"
            onClick={() => { setMenuFor(null); p.onNewLoop(); }}
            disabled={p.newLoopReason !== null}
            aria-label="New loop: from silence"
            title={p.newLoopReason ?? 'A loop from silence: only the counters sound until you Keep'}
            style={{ justifyContent: 'flex-start' }}
          >
            New loop
          </Button>
        </div>
      )}
    </div>
  );
}
