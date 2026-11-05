import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { CAPTION_STYLE } from '../ui/text';
import { LoopThumb, type PieceLoop } from './PieceSteps';
import { loopName } from './LoopRail';
import { describeEnding, formatClock, type PerformanceSettings } from '../../../../songs/performance/clock';
import type { Scene, WayIn } from '../../../../songs/performance/launcher';
import type { SoundWorldChoice } from '../../../../audio/worlds/soundWorlds';
import { cardWords, joinWords, moveCard, sceneCards, type SceneCard } from '../../../../songs/performance/storyboard';

export interface StoryboardProps {
  scenes: Scene[];
  loops: PieceLoop[];
  lengthSec: number;
  performance: PerformanceSettings;
  currentScene: number | null;
  running: boolean;
  /** Where the piece's clock is, while it runs; null when it doesn't. */
  elapsedSec: number | null;
  /** The scene open in the editor, by id. */
  selected: string | null;
  pieceName: string;
  /** The pieces (Open, Duplicate, Delete, Rename, New), shown under the heading while the ▾ is open. */
  pieceMenu: ReactNode;
  worldLabel(w: SoundWorldChoice): string;
  /** Who plays, for "Tim alone" on a card (null = "the player"). */
  playerName?: string | null;
  rows: number;
  cols: number;
  swatchFor(colour: string): string;
  /** Why nothing can be changed now (the piece plays from Show), or null. A card can still be selected. */
  locked: string | null;
  onSelect(id: string | null): void;
  onKeepScene(): void;
  keepSceneReason: string | null;
  onMakePlan(): void;
  onCheck(): void;
  /** The join before scene `i` pressed: select that scene, at its "Into this scene" line. */
  onJoinPress(i: number): void;
}

const CARD_WIDTH = 190;
const JOIN_WIDTH = 64;

/** A scene's way in; one saved before it existed reads as the fade of a pass it had. */
const wayInto = (s: Scene): WayIn => s.wayIn ?? { kind: 'fade', passes: 1 };

/** " Bed carries on." when a loop plays in both scenes, else nothing. */
function carriesOn(from: SceneCard, to: SceneCard, loops: readonly PieceLoop[]): string {
  const both = to.loops.filter((slot) => from.loops.includes(slot)).map((slot) => loops.find((l) => l.slot === slot)).filter((l): l is PieceLoop => l !== undefined).map(loopName);
  return both.length > 0 ? ` ${both.join(', ')} ${both.length === 1 ? 'carries' : 'carry'} on.` : '';
}

/** The loops that play in a card, by name; "none" with none. */
const loopNames = (card: SceneCard, loops: readonly PieceLoop[]): string => {
  const names = card.loops.map((slot) => loops.find((l) => l.slot === slot)).filter((l): l is PieceLoop => l !== undefined).map(loopName);
  return names.length > 0 ? names.join(', ') : 'none';
};

/** The card's first line: its number and time (or that it has none: no room was left for it). */
const cardHead = (card: SceneCard): string => `Scene ${card.index + 1} · ${card.at === null ? 'no time' : formatClock(card.at)}`;

/** The extra words on a card: no loops (amber, unless the scene is for the player alone), or the player alone. */
function cardExtras(scene: Scene, card: SceneCard, playerName: string | null): string[] {
  if (scene.alone) return [`${playerName?.trim() || 'the player'} alone`];
  return card.loops.length === 0 ? ['no loops'] : [];
}

/**
 * What a card says to a screen reader: the words on it in their order (A9: the name starts
 * with the visible words), then its length and its loops.
 */
export function cardLabel(card: SceneCard, loops: readonly PieceLoop[], words: string): string {
  const length = card.at === null ? 'no room before the end' : `${formatClock(card.lengthSec)} long`;
  return `${cardHead(card)} ${card.name} ${words}, ${length}, loops ${loopNames(card, loops)}`;
}

/**
 * The storyboard (Keep design, 5 Nov 2026, K2): the piece as a row of scene cards under the
 * board, left to right in time order. Each card shows its number and time, its name, the
 * kept loops as pictures (lit where the loop plays in it, dim where it doesn't) and a line
 * of words for its energy and world. Between cards a join says how the piece gets into the
 * next scene (K3 fills it in). After the last card, the dashed card keeps what is playing
 * as the next scene. One tab stop: arrows move, Enter selects; a press on a card opens it
 * in the editor beside the board.
 */
export function Storyboard(p: StoryboardProps): JSX.Element {
  const cards = sceneCards(p.scenes, p.lengthSec, p.currentScene);
  const kept = p.loops.filter((l) => l.state !== 'empty');
  // The loop pictures are drawn once per change of the loops, not on every tick of the clock:
  // each is 64 circles, on every card, and the screen renders many times a second while it plays.
  const loopsKey = kept.map((l) => `${l.slot}:${l.cells.length}:${l.cells.map((c) => `${c.row},${c.col},${c.colour},${p.swatchFor(c.colour)}`).join(';')}`).join('|');
  const thumbs = useMemo(
    () => new Map(kept.map((l) => [l.slot, <LoopThumb key={l.slot} cells={l.cells} rows={p.rows} cols={p.cols} swatchFor={p.swatchFor} width={28} />])),
    [loopsKey, p.rows, p.cols], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // The tab stop: the selected card, else the first.
  const stopIndex = Math.max(0, cards.findIndex((c) => c.id === p.selected));
  const focusedIndex = (): number => refs.current.findIndex((b) => b === document.activeElement);

  const cardStyle = (c: SceneCard): CSSProperties => ({
    width: CARD_WIDTH, flexShrink: 0, minHeight: 'var(--bs-target)', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start', textAlign: 'left',
    padding: '6px 10px', borderRadius: 'var(--bs-radius-md)', cursor: 'pointer', color: 'var(--bs-fg)',
    // Selected: a thick edge in the text colour, and its name heavier. On now: raised, with a
    // thicker top edge. A scene with no time: dashed. Never colour alone.
    border: `${c.id === p.selected ? 2 : 1}px ${c.at === null ? 'dashed' : 'solid'} ${c.id === p.selected ? 'var(--bs-fg)' : 'var(--bs-border-control)'}`,
    borderTop: c.current ? '3px solid var(--bs-fg)' : undefined,
    background: c.current ? 'var(--bs-raised)' : 'transparent',
    opacity: c.at === null ? 0.7 : 1,
  });

  return (
    <section aria-label="The piece" style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flexShrink: 0 }}>
      {/* The heading: the piece (its ▾ opens the pieces), its length and ending, and Check. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={CAPTION_STYLE}>The piece</span>
        <button
          type="button" aria-expanded={menuOpen} aria-label={`${p.pieceName} ▾: your pieces`} onClick={() => setMenuOpen((o) => !o)}
          style={{ minHeight: 'var(--bs-target)', padding: '0 6px', background: 'transparent', border: '1px solid transparent', borderRadius: 'var(--bs-radius-md)', color: 'var(--bs-fg)', fontWeight: 600, cursor: 'pointer' }}
        >
          {`${p.pieceName} ▾`}
        </button>
        <span style={{ color: 'var(--bs-fg2)', fontSize: 14 }}>{`${formatClock(p.lengthSec)} · ${describeEnding(p.performance)}`}</span>
        <span style={{ flex: 1 }} />
        <Button tone="quiet" onClick={p.onCheck} aria-label="Check › the length, the ending and the ready check">Check ›</Button>
      </div>
      {menuOpen && <div>{p.pieceMenu}</div>}

      {/* The row of cards: the one place sideways scrolling is allowed. */}
      <div
        role="listbox"
        aria-label="The piece: its scenes in order"
        style={{ display: 'flex', alignItems: 'stretch', gap: 0, overflowX: 'auto', paddingBottom: 4, opacity: p.locked ? 0.6 : 1 }}
        onKeyDown={(e) => {
          const from = focusedIndex();
          if (from < 0) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelect(cards[from].id); return; }
          const to = moveCard(from, e.key, cards.length);
          if (to === null) return;
          e.preventDefault();
          refs.current[to]?.focus();
        }}
      >
        {cards.map((c, i) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'stretch' }}>
            {i > 0 && c.at !== null && (
              // The join: how the piece gets into this scene (K3): fade, overlap or cut. A loop
              // in both scenes carries on untouched, whatever the way. Out of the tab order (the
              // row is one tab stop, the cards); the keyboard has the same line in the editor.
              <button
                type="button" tabIndex={-1}
                data-join={i} aria-label={`${joinWords(wayInto(p.scenes[c.index]))}: into ${c.name}`}
                title={p.locked ?? `How the piece gets into ${c.name}: ${joinWords(wayInto(p.scenes[c.index]))}.${carriesOn(cards[i - 1], c, p.loops)}`}
                disabled={p.locked !== null} onClick={() => p.onJoinPress(c.index)}
                style={{ width: JOIN_WIDTH, flexShrink: 0, background: 'transparent', border: 'none', color: 'var(--bs-fg2)', cursor: p.locked ? 'not-allowed' : 'pointer', fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}
              >
                <span style={{ border: '1px solid var(--bs-border-control)', borderRadius: 10, padding: '0 6px', color: 'var(--bs-fg)', whiteSpace: 'nowrap' }}>{joinWords(wayInto(p.scenes[c.index]))}</span>
                {/* The arrow is drawn, not written, so the words on the join are the way in alone (A9). */}
                <svg aria-hidden="true" width="18" height="10" viewBox="0 0 18 10" style={{ display: 'block' }}><path d="M0 5h15M11 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
              </button>
            )}
            <button
              ref={(el) => { refs.current[i] = el; }}
              type="button" role="option" data-scene-card={c.id}
              aria-selected={c.id === p.selected} aria-label={cardLabel(c, p.loops, cardWords(c, p.worldLabel(p.scenes[c.index].settings.soundWorld), cardExtras(p.scenes[c.index], c, p.playerName ?? null)))}
              title={c.at === null ? `${c.name}: no time (no room was left before the end: delete it, or shorten a scene)` : `${c.name}: ${formatClock(c.at)}, ${formatClock(c.lengthSec)} long`}
              data-on-now={c.current ? '' : undefined}
              tabIndex={i === stopIndex ? 0 : -1}
              onClick={() => p.onSelect(c.id)}
              style={cardStyle(c)}
            >
              {/* The spaces between the lines are real text, so the name reads as the words do (A9). */}
              <span style={{ fontSize: 14, color: 'var(--bs-fg2)', fontVariantNumeric: 'tabular-nums' }}>{cardHead(c)}</span>
              {' '}
              <span style={{ fontSize: 16, fontWeight: c.id === p.selected ? 800 : 700 }}>{c.name}</span>
              {' '}
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {kept.map((l) => {
                  const on = c.loops.includes(l.slot);
                  return (
                    <span key={l.slot} data-in-scene={on ? 'true' : 'false'} title={`${loopName(l)}: ${on ? 'plays' : "doesn't play"}`} style={{ opacity: on ? 1 : 0.3, display: 'inline-flex' }}>
                      {thumbs.get(l.slot)}
                    </span>
                  );
                })}
              </span>
              <span style={{ fontSize: 14, color: c.loops.length === 0 && !p.scenes[c.index].alone ? 'var(--bs-warn)' : 'var(--bs-fg2)' }}>
                {cardWords(c, p.worldLabel(p.scenes[c.index].settings.soundWorld), cardExtras(p.scenes[c.index], c, p.playerName ?? null))}
              </span>
            </button>
          </div>
        ))}
        {cards.length > 0 && (
          <span aria-hidden="true" style={{ width: JOIN_WIDTH, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bs-fg2)' }}>
            <svg width="18" height="10" viewBox="0 0 18 10" style={{ display: 'block' }}><path d="M0 5h15M11 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </span>
        )}
        {/* The dashed card: the next scene, from what is playing now. Out of the tab order (the keyboard has Keep as scene in the panel). */}
        <Button
          tabIndex={-1}
          tone="secondary" onClick={p.onKeepScene} reason={p.locked ?? p.keepSceneReason}
          style={{ width: 170, flexShrink: 0, minHeight: 'var(--bs-target)', borderStyle: 'dashed', borderRadius: 'var(--bs-radius-md)', whiteSpace: 'normal', alignSelf: 'flex-start' }}
        >
          + Keep what&rsquo;s playing as a scene
        </Button>
      </div>

      {cards.length === 0 && (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--bs-fg2)', maxWidth: '60ch' }}>Play some loops together, then press Keep as scene. Or press Make my plan for a four-scene start.</p>
      )}

      {/* Under the row: the ruler (the times, and the playhead while it plays) and Make my plan. */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        {cards.length > 0 && (
          <div aria-hidden="true" style={{ position: 'relative', flex: 1, height: 20, borderTop: '1px solid var(--bs-border)', fontSize: 14, color: 'var(--bs-fg3)', fontVariantNumeric: 'tabular-nums' }}>
            {cards.filter((c): c is SceneCard & { at: number } => c.at !== null).map((c) => (
              <span key={c.id} style={{ position: 'absolute', left: `${(c.at / p.lengthSec) * 100}%`, top: 2 }}>{formatClock(c.at)}</span>
            ))}
            <span style={{ position: 'absolute', right: 0, top: 2 }}>{formatClock(p.lengthSec)}</span>
            {p.elapsedSec !== null && (
              <span data-playhead="" style={{ position: 'absolute', top: -1, bottom: 0, width: 3, background: 'var(--bs-fg)', left: `${Math.min(100, (p.elapsedSec / p.lengthSec) * 100)}%` }} />
            )}
          </div>
        )}
        <Button
          tone={cards.length === 0 ? 'primary' : 'quiet'} onClick={p.onMakePlan} reason={p.locked}
          title={cards.length === 0 ? 'Four scenes across the piece, with your loops in them' : 'Start again: four scenes across the piece, with your loops in them'}
        >
          {`✦ Make my plan${cards.length === 0 ? `: 4 scenes over ${formatClock(p.lengthSec)}` : ''}`}
        </Button>
      </div>
    </section>
  );
}
