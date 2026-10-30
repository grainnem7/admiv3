import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { focusDropped, focusWhenGone, PLAY_STOP_ID } from '../ui/focusNext';
import { LabeledSlider } from '../ui/LabeledSlider';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Switch } from '../ui/Switch';
import type { BandLevel } from '../../../../songs/band/band';
import type { SoundWorldChoice } from '../../../../audio/worlds/soundWorlds';
import {
  describeEnding, endingTooLong, formatClock, MAX_PIECE_SEC, parseClock, pieceLengthProblem, plainNumberProblem,
  type ClockView, type EndingMode, type EndingStyle, type PerformanceSettings,
} from '../../../../songs/performance/clock';
import { MAX_SCENES, type LoopSlotState, type Scene } from '../../../../songs/performance/launcher';
import { sceneTimeProblem, type ScenePatch } from '../../../../songs/performance/piece';
import { bandJobsWords, LEAD_INS, LEAD_IN_WORDS, type LeadIn } from '../../../../songs/band/bandJobs';
import { colourEntryProblem } from '../../../../songs/performance/colourEntries';
import { GLIDE_DEFAULT_SEC, GLIDE_MAX_SEC, GLIDE_MIN_SEC } from '../../../../songs/performance/speedGlide';
import { BAND_WORDS, listNames, playerWords } from '../pieceCheck';
import { ReadyList, type ReadyItem } from './ReadyCheck';
import { ChordChoice, chordWords } from './ChordChoice';
import { BandJobsChoice } from './BandJobsChoice';
import { ENERGY_LEVELS, ENERGY_WORDS, energyLine, type SceneEnergy } from '../../../../songs/performance/energy';
import { ENERGY_NAMES, WORDS } from '../words';
import { SwatchChip } from '../ui/SwatchChip';
import type { BoardPalette } from '../theme/boardTokens';
import { useSessionFold } from '../ui/useSessionFold';

export interface PieceLoop {
  slot: number;
  /** The name the player gave it ('' = "Loop n"). */
  name: string;
  notes: number;
  state: LoopSlotState;
  /** Its counters, for the little picture of the loop. */
  cells: readonly { row: number; col: number; colour: string }[];
}

export type PieceStep = 'loops' | 'scenes' | 'ending';

/** A colour that plays notes, and when it comes in during the piece (null = from the start). */
export interface PieceColourTime {
  id: string;
  name: string;
  swatch: string;
  /** Its job, in words ("Melody"). */
  job: string;
  at: number | null;
}

export interface PieceStepsProps {
  step: PieceStep;
  onStep(step: PieceStep): void;
  running: boolean;
  lengthSec: number;
  /** How long one pass lasts, in seconds: every timing in a piece is counted in passes. */
  passSec: number;
  clock: ClockView | null;
  scenes: Scene[];
  currentScene: number | null;
  loops: PieceLoop[];
  loopFadePasses: number;
  performance: PerformanceSettings;
  respectPlayer: boolean;
  /** Counters are on the board now, so there is something to save. */
  canSaveBoard: boolean;
  /** Every loop is full: Keep would have nowhere to put a new one. */
  loopsFull: boolean;
  deletedSceneName: string | null;
  diskLine: string;
  restoreError: string | null;
  worldOptions: { value: SoundWorldChoice; label: string }[];
  readyItems: ReadyItem[];
  /** Who plays, for "Tim alone" (null = "the player"). */
  playerName: string | null;
  /** The board's size and colours, for the loop pictures. */
  rows: number;
  cols: number;
  swatchFor(colour: string): string;
  /** The board's colours, for the counters' two-tone ring beside each colour. */
  palette: BoardPalette;
  /** New loop: composing from silence. Shown in place of the list while it is on. */
  newLoop: ReactNode;
  /** The colours that play notes, each with when it comes in (Scenes: When each colour comes in). */
  colours: PieceColourTime[];
  /** A colour's time set, or cleared (null = from the start). */
  onColourEntry(id: string, at: number | null): void;
  onNewLoop(): void;
  onToggleLoop(slot: number): void;
  onSaveBoardToLoop(slot: number): void;
  onDrawLoop(slot: number): void;
  onClearLoop(slot: number): void;
  onRenameLoop(slot: number, name: string): void;
  onLoopFade(passes: number): void;
  onGoScene(i: number): void;
  onRehearseFrom(sec: number): void;
  onSaveSceneFromNow(name: string): void;
  onUpdateSceneFromNow(i: number): void;
  onEditScene(i: number, patch: ScenePatch): void;
  onDeleteScene(i: number): void;
  onUndoDelete(): void;
  onMakePlan(): void;
  onRespectPlayer(on: boolean): void;
  /** New ideas for one scene: the band, the extra notes and Sounds change play differently. */
  onNewIdeasScene(i: number): void;
  /** New ideas for every scene of the piece (Magenta's kept ideas let go). */
  onNewIdeasPiece(): void;
  /** Surprise me each time: fresh ideas every run, as before. */
  surpriseMe: boolean;
  onSurpriseMe(on: boolean): void;
  onPerformance(patch: Partial<PerformanceSettings>): void;
  onBackup(): void;
  onRestore(): void;
  onShow(): void;
}

const loopName = (l: PieceLoop): string => (l.name.length > 0 ? l.name : `Loop ${l.slot + 1}`);

/** A loop at a glance: its counters on a tiny board, so loops are told apart by eye. */
export function LoopThumb({ cells, rows, cols, swatchFor, width = 64 }: {
  cells: readonly { row: number; col: number; colour: string }[]; rows: number; cols: number;
  swatchFor(colour: string): string; width?: number;
}): JSX.Element {
  const cw = width / Math.max(1, cols);
  const h = cw * rows;
  return (
    <svg width={width} height={h} aria-hidden="true" style={{ flexShrink: 0, borderRadius: 4, background: 'var(--bs-elev)', border: '1px solid var(--bs-border)' }}>
      {width >= 120 && Array.from({ length: rows * cols }, (_, k) => (
        <rect key={`sq${k}`} x={(k % cols) * cw + 1} y={Math.floor(k / cols) * cw + 1} width={cw - 2} height={cw - 2} rx={3} fill="none" stroke="var(--bs-border)" />
      ))}
      {cells.map((c, i) => (
        <circle key={i} cx={c.col * cw + cw / 2} cy={c.row * cw + cw / 2} r={Math.max(1.5, cw * 0.38)} fill={swatchFor(c.colour)} />
      ))}
    </svg>
  );
}

/** Scene amounts as named steps: the same words as the Sound tab's helpers. */
const FILL_STEPS = [{ label: 'Off', value: 0 }, { label: 'A few', value: 0.25 }, { label: 'Some', value: 0.5 }, { label: 'Lots', value: 0.8 }];
const EVOLVE_STEPS = [{ label: 'Off', value: 0 }, { label: 'Slowly', value: 0.35 }, { label: 'More', value: 0.7 }];
function nearestStep(steps: { label: string; value: number }[], v: number): number {
  let best = 0;
  for (let i = 1; i < steps.length; i++) if (Math.abs(steps[i].value - v) < Math.abs(steps[best].value - v)) best = i;
  return best;
}

export function loopStateText(l: PieceLoop, running: boolean, fades: boolean): string {
  if (l.state === 'empty') return 'empty';
  // Stopped, nothing sounds: a row says what the loop is, never that it is playing.
  if (running && l.state === 'playing') return '▶ playing';
  if (running && l.state === 'starting') return fades ? 'fading in…' : 'starting…';
  if (running && l.state === 'stopping') return fades ? 'fading out…' : 'stopping…';
  return `${l.notes} ${l.notes === 1 ? 'note' : 'notes'}`;
}

/**
 * Scenes are told apart by their number, never by a colour of their own: the board's
 * colours belong to the counters, and white on a bright scene colour was 2.3:1 (B10).
 * Neighbours on the timeline alternate two neutral surfaces, with the board's text colour.
 */
const sceneChipSurface = (i: number): string => (i % 2 === 0 ? 'var(--bs-raised)' : 'var(--bs-hi)');

/** A chip's padding and edges, either side: what its words never get. */
const CHIP_EDGES_PX = 18;
const CHIP_FONT = "700 14px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
let chipCanvas: CanvasRenderingContext2D | null | undefined;
/** How wide the chip's words are drawn; without a canvas (tests), 8 px a character. */
function chipTextWidth(text: string): number {
  if (chipCanvas === undefined) {
    // jsdom (the unit tests) has no canvas: it says so loudly, so it is not asked.
    const jsdom = typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom');
    try { chipCanvas = jsdom ? null : document.createElement('canvas').getContext('2d') ?? null; } catch { chipCanvas = null; }
    if (chipCanvas) chipCanvas.font = CHIP_FONT;
  }
  return chipCanvas ? chipCanvas.measureText(text).width : text.length * 8;
}

/**
 * What a scene's chip on the timeline says, in the room it has: the whole label, then
 * without the time, then the number alone, else nothing. Never a word cut in half (a short
 * last scene read "4 · Home 6:"); the whole label stays in the chip's name and tooltip.
 * `widthPx` null: not measured yet, so the whole label.
 */
export function sceneChipLabel(
  n: number, name: string, time: string, widthPx: number | null, measure: (t: string) => number = chipTextWidth,
): string {
  const options = [`${n} · ${name} ${time}`, `${n} · ${name}`, String(n)];
  if (widthPx === null) return options[0];
  return options.find((o) => measure(o) <= widthPx) ?? '';
}

/** "Other ways to make a loop" stays open for the rest of the session once opened. */
let otherWaysOpen = false;

const heading = { margin: 0, fontSize: 20, fontWeight: 800 } as const;
const note = { fontSize: 14, color: 'var(--bs-fg2)', margin: 0 } as const;
const card = { padding: 12, borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-elev)', display: 'flex', flexDirection: 'column', gap: 6 } as const;

const ENDINGS: { value: EndingStyle; label: string; what: string }[] = [
  { value: 'chord', label: 'Final chord', what: 'The texture thins, then a held chord and a crash ring out. A clear end the audience hears.' },
  { value: 'fade', label: 'Fade out', what: 'Everything fades together.' },
  { value: 'slow', label: 'Slow down', what: 'The speed eases to about half, then stops on the one.' },
  { value: 'thin', label: 'Thin out', what: 'The band and the extra notes leave first, so the player’s own notes end the piece.' },
  { value: 'stop', label: 'Stop', what: 'A tidy stop at the end of the pass.' },
];

/**
 * Making a piece, in three steps that can be taken in order or opened any time: the
 * loops, the scenes, then the ending and a check. Each step shows only what it needs and
 * says in one line what it is for — and each is optional: with no loops and no scenes the
 * board still plays, and the clock still ends the piece.
 */
export function PieceSteps(p: PieceStepsProps): JSX.Element {
  const saved = p.loops.filter((l) => l.state !== 'empty');
  const steps: { id: PieceStep; n: number; label: string; status: string }[] = [
    { id: 'loops', n: 1, label: 'Loops', status: saved.length === 0 ? 'optional' : `${saved.length} saved` },
    { id: 'scenes', n: 2, label: 'Scenes', status: p.scenes.length === 0 ? 'optional' : `${p.scenes.length}` },
    { id: 'ending', n: 3, label: 'Ending & check', status: formatClock(p.lengthSec) },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
      <nav aria-label="Make a piece: steps" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {steps.map((s) => {
          const on = p.step === s.id;
          return (
            <button
              key={s.id}
              type="button"
              aria-current={on ? 'step' : undefined}
              onClick={() => p.onStep(s.id)}
              style={{
                minHeight: 'var(--bs-target)', padding: '6px 8px', borderRadius: 'var(--bs-radius-md)', textAlign: 'left', cursor: 'pointer', color: 'inherit',
                border: `2px solid ${on ? 'var(--bs-accent)' : 'var(--bs-border-control)'}`, background: on ? 'var(--bs-accent-muted)' : 'var(--bs-raised)',
              }}
            >
              <span style={{ display: 'block', fontWeight: 800 }}>{`${s.n} · ${s.label}`}</span>
              <span style={{ display: 'block', fontSize: 14, color: 'var(--bs-fg2)' }}>{s.status}</span>
            </button>
          );
        })}
      </nav>
      {p.step === 'loops' && <LoopsStep {...p} />}
      {p.step === 'scenes' && <ScenesStep {...p} />}
      {p.step === 'ending' && <EndingStep {...p} />}
    </div>
  );
}

function StepFooter({ back, next }: { back?: { label: string; onClick(): void }; next?: { label: string; onClick(): void; primary?: boolean } }): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap', borderTop: '1px solid var(--bs-border)', paddingTop: 10 }}>
      {back ? <Button tone="secondary" onClick={back.onClick}>{`← ${back.label}`}</Button> : <span />}
      {next && <Button tone={next.primary ? 'primary' : 'secondary'} onClick={next.onClick}>{`${next.label} →`}</Button>}
    </div>
  );
}

/** Step 1: the loops — a board saved once, that then plays by itself. */
function LoopsStep(p: PieceStepsProps): JSX.Element {
  const [replaceArmed, setReplaceArmed] = useState<number | null>(null);
  const nameRefs = useRef(new Map<number, HTMLInputElement>());
  const [more, setMore] = useState(false);
  // The old ways, folded (B17): remembered while the page is open, so a second loop made
  // the old way doesn't need the fold opened again.
  const [otherWays, setOtherWays] = useState(otherWaysOpen);
  const toggleOtherWays = (): void => setOtherWays((o) => { otherWaysOpen = !o; return !o; });
  // While the piece clock runs, the piece is playing: no loop is made then (F2).
  const pieceOn = p.clock !== null && p.clock.phase !== 'idle';
  const making = p.newLoop !== null && p.newLoop !== undefined;
  // The old ways to make a loop (Save the board here, Overwrite, Edit notes) stay for now,
  // but never inside New loop or during the piece, where they made a second, different
  // loop under the New loop heading (F1).
  const oldWaysAllowed = !making && !pieceOn;
  const oldWays = oldWaysAllowed && otherWays;
  // Done or Leave closes New loop: focus goes back to New loop, one Enter from the next
  // loop, never to the page (T1-04). (Opening it, the panel takes focus itself.)
  const newLoopRef = useRef<HTMLButtonElement>(null);
  const wasMaking = useRef(making);
  useEffect(() => {
    if (wasMaking.current && !making && focusDropped()) newLoopRef.current?.focus();
    wasMaking.current = making;
  }, [making]);
  return (
    <section aria-labelledby="piece-loops" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 id="piece-loops" style={heading}>1 · Loops</h2>
      {p.newLoop ?? (
        <div style={card}>
          <p style={{ margin: 0 }}>A loop is something the player makes with counters, from silence, that then plays by itself.</p>
          {/* Off while the piece plays (F2), and with no loop left to keep it in: nobody
              clears the board for a loop that can't be kept (R2-T4-04). */}
          <div>
            <Button
              ref={newLoopRef} tone="primary" onClick={p.onNewLoop}
              reason={pieceOn ? 'Stop the piece to make a loop' : p.loopsFull ? 'Every loop is full: clear one first' : null}
            >
              New loop
            </Button>
          </div>
          <p style={note}>Everything stops; only the counters sound. Keep makes the loop.</p>
        </div>
      )}
      {/* A note, not a warning: an empty board is where New loop starts (R2-T1-07). Not with
          every loop full: New loop is off then, and says why (R3-TB-03). */}
      {!p.canSaveBoard && oldWaysAllowed && !p.loopsFull && <p style={note}>To make a loop, press New loop.</p>}
      {oldWaysAllowed && (
        <button
          type="button" aria-expanded={otherWays} onClick={toggleOtherWays}
          style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', color: 'var(--bs-fg2)', minHeight: 'var(--bs-target)', cursor: 'pointer' }}
        >
          {otherWays ? '▾' : '▸'} Other ways to make a loop
        </button>
      )}
      {oldWays && <p style={note}>{`${WORDS.keepBoardAsLoop} keeps the counters on the board as that loop. ✎ Edit notes changes a loop square by square.`}</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {p.loops.map((l) => {
          const empty = l.state === 'empty';
          const on = l.state === 'playing' || l.state === 'starting';
          return (
            <li
              key={l.slot}
              aria-label={`Loop ${l.slot + 1}: ${loopName(l)}, ${loopStateText(l, p.running, p.loopFadePasses > 0)}`}
              style={{
                display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: 8, borderRadius: 'var(--bs-radius-md)',
                border: `2px solid ${on ? 'var(--bs-ok)' : 'var(--bs-border)'}`, background: empty ? 'transparent' : 'var(--bs-raised)',
              }}
            >
              <span style={{ fontWeight: 800, width: 18, textAlign: 'right', color: 'var(--bs-fg2)' }}>{l.slot + 1}</span>
              {!empty && <LoopThumb cells={l.cells} rows={p.rows} cols={p.cols} swatchFor={p.swatchFor} />}
              <input
                ref={(el) => { if (el) nameRefs.current.set(l.slot, el); else nameRefs.current.delete(l.slot); }}
                type="text" value={l.name} placeholder={empty ? 'name (after Keep)' : `Loop ${l.slot + 1}`}
                aria-label={`Name of loop ${l.slot + 1}`}
                onChange={(e) => p.onRenameLoop(l.slot, e.target.value)}
                style={{ width: 120, minHeight: 'var(--bs-target)' }}
              />
              <span style={{ fontSize: 14, color: on ? 'var(--bs-ok)' : 'var(--bs-fg2)', minWidth: 60 }}>{loopStateText(l, p.running, p.loopFadePasses > 0)}</span>
              <span style={{ flex: 1 }} />
              {empty ? (oldWays && (
                <Button
                  tone="secondary"
                  onClick={() => {
                    p.onSaveBoardToLoop(l.slot);
                    // Next comes its name: focus goes there, rather than dropping to the page.
                    requestAnimationFrame(() => nameRefs.current.get(l.slot)?.focus());
                  }}
                  reason={p.canSaveBoard ? null : 'Put counters on the board first.'}
                >
                  {WORDS.keepBoardAsLoop}
                </Button>
              )) : (
                <>
                  {/* Inside New loop a loop is heard with "Hear it with…"; this did nothing there (T1-10). */}
                  {!making && <Button tone={on ? 'selected' : 'secondary'} aria-pressed={on} onClick={() => p.onToggleLoop(l.slot)}>{on ? '■ Stop' : '▶ Play'}</Button>}
                  {oldWays && <Button
                    tone="secondary"
                    disabled={!p.canSaveBoard}
                    title={p.canSaveBoard ? 'Replace this loop with the counters on the board now' : 'Put counters on the board first.'}
                    onClick={() => {
                      if (replaceArmed !== l.slot) { setReplaceArmed(l.slot); return; }
                      setReplaceArmed(null);
                      p.onSaveBoardToLoop(l.slot);
                    }}
                    onBlur={() => setReplaceArmed((r) => (r === l.slot ? null : r))}
                  >
                    {replaceArmed === l.slot ? 'Press again to replace it' : WORDS.keepBoardAsLoop}
                  </Button>}
                </>
              )}
              {oldWays && <Button tone="quiet" onClick={() => p.onDrawLoop(l.slot)} aria-label={`Edit notes: loop ${l.slot + 1}`} title="See and change this loop's notes">✎ Edit notes</Button>}
              {!empty && <Button tone="quiet" onClick={() => p.onClearLoop(l.slot)} aria-label={`Clear loop ${l.slot + 1}`} title="Clear this loop">✕</Button>}
            </li>
          );
        })}
      </ul>
      <button
        type="button" aria-expanded={more} onClick={() => setMore((m) => !m)}
        style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', color: 'var(--bs-fg2)', minHeight: 'var(--bs-target)', cursor: 'pointer' }}
      >
        {more ? '▾' : '▸'} More: fades
      </button>
      {more && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SegmentedControl<number>
            label="Loops fade in and out over" showLabel
            value={p.loopFadePasses}
            onChange={p.onLoopFade}
            options={[{ value: 0, label: 'At once' }, { value: 0.5, label: 'Half a pass' }, { value: 1, label: '1 pass' }, { value: 2, label: '2 passes' }]}
          />
        </div>
      )}
      <StepFooter next={{ label: 'Next: Scenes', onClick: () => p.onStep('scenes') }} />
    </section>
  );
}

/**
 * The line of Energy across the piece: each scene's level held until the next scene, drawn
 * under the timeline (higher = more energy; a dashed floor where a scene has it off).
 */
function EnergyGraph({ scenes, lengthSec }: { scenes: readonly Scene[]; lengthSec: number }): JSX.Element | null {
  const line = energyLine(scenes).filter((x) => x.at < lengthSec);
  if (line.length === 0) return null;
  const words = line.map((x) => `${x.name} ${ENERGY_NAMES[x.energy]}`);
  const y = (e: SceneEnergy): number => 46 - e * 8;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <svg
        role="img" aria-label={`Energy across the piece: ${words.join(', ')}`} viewBox="0 0 100 50" preserveAspectRatio="none"
        style={{ width: '100%', height: 48, borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-elev)' }}
      >
        {ENERGY_LEVELS.map((e) => <line key={e} x1={0} x2={100} y1={y(e)} y2={y(e)} stroke="var(--bs-border)" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />)}
        {line.map((x, k) => {
          const x1 = (x.at / lengthSec) * 100;
          const x2 = ((k + 1 < line.length ? line[k + 1].at : lengthSec) / lengthSec) * 100;
          const next = k + 1 < line.length ? line[k + 1].energy : null;
          return (
            <g key={k}>
              <line
                x1={x1} x2={x2} y1={y(x.energy)} y2={y(x.energy)} stroke={x.energy === 0 ? 'var(--bs-fg2)' : 'var(--bs-accent)'}
                strokeWidth={3} strokeDasharray={x.energy === 0 ? '4 3' : undefined} vectorEffect="non-scaling-stroke"
              />
              {next !== null && <line x1={x2} x2={x2} y1={y(x.energy)} y2={y(next)} stroke="var(--bs-accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
            </g>
          );
        })}
      </svg>
      <span aria-hidden="true" style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>{`Energy: ${words.join(' · ')}`}</span>
    </div>
  );
}

/** Step 2: the scenes — the loops and the sound, changing at set times. */
function ScenesStep(p: PieceStepsProps): JSX.Element {
  // The open scene, by its id: a new time re-sorts the list, and the panel must stay on
  // the scene being edited, not on whichever scene moves into its place (T2-02).
  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  // The timeline's width, so each chip says only what fits (whole words, never cut).
  const timelineRef = useRef<HTMLUListElement>(null);
  const [timelinePx, setTimelinePx] = useState<number | null>(null);
  const hasTimeline = p.scenes.length > 0;
  useEffect(() => {
    const el = timelineRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const look = (): void => setTimelinePx(el.clientWidth > 0 ? el.clientWidth : null);
    const ro = new ResizeObserver(look);
    ro.observe(el);
    look();
    return () => ro.disconnect();
  }, [hasTimeline]);
  const elapsed = p.clock && p.clock.phase !== 'idle' ? p.clock.elapsedSec : null;
  const saved = p.loops.filter((l) => l.state !== 'empty');
  const who = playerWords(p.playerName);
  // Focus never drops to the page when a pressed button goes (T4-09): these are where it goes.
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const sceneRow = (id?: string): HTMLElement | null => [...(sectionRef.current?.querySelectorAll<HTMLElement>('[data-scene-row]') ?? [])]
    .find((b) => id === undefined || b.dataset.sceneRow === id) ?? null;
  return (
    <section ref={sectionRef} aria-labelledby="piece-scenes" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 id="piece-scenes" ref={headingRef} tabIndex={-1} style={heading}>2 · Scenes</h2>
      <div style={card}>
        <p style={{ margin: 0 }}>A scene says which loops play and how it sounds. The clock brings each scene in at its time while the player plays on top.</p>
        <p style={note}>Optional: without scenes, the piece doesn&rsquo;t change by itself.</p>
      </div>
      {p.scenes.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          <Button
            tone="primary"
            // The plan's scenes take its place: focus goes to the first of them.
            onClick={(e) => { p.onMakePlan(); void focusWhenGone(() => sceneRow(), e.currentTarget); }}
          >
            {`✦ Make my plan: 4 scenes over ${formatClock(p.lengthSec)}`}
          </Button>
          <p style={note}>Arrival, Build, Open and Home, using {saved.length > 0 ? 'your saved loops' : `no loops yet (make some in step 1 first: a scene without loops is silent unless ${who.name} plays)`}. Every scene can be changed afterwards.</p>
        </div>
      ) : (
        <>
          <ul ref={timelineRef} aria-label="Timeline of the scenes" style={{ listStyle: 'none', margin: 0, padding: 0, position: 'relative', height: 44, borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-elev)', overflow: 'hidden' }}>
            {p.scenes.map((s, i) => {
              if (typeof s.at !== 'number' || s.at >= p.lengthSec) return null;
              const nextAt = p.scenes.slice(i + 1).find((x) => typeof x.at === 'number')?.at ?? p.lengthSec;
              const words = `${i + 1} · ${s.name} ${formatClock(s.at)}`;
              const share = Math.max(2, ((Math.min(p.lengthSec, nextAt as number) - s.at) / p.lengthSec) * 100);
              const label = sceneChipLabel(i + 1, s.name, formatClock(s.at), timelinePx === null ? null : (timelinePx * share) / 100 - CHIP_EDGES_PX);
              return (
                <li
                  key={s.id}
                  style={{ position: 'absolute', top: 0, bottom: 0, left: `${(s.at / p.lengthSec) * 100}%`, width: `${share}%` }}
                >
                  <button
                    type="button" onClick={() => setSelected(s.id)}
                    aria-label={`${words}${p.currentScene === i ? ', on now' : ''}`}
                    title={words}
                    style={{
                      width: '100%', height: '100%', minHeight: 0, minWidth: 0, borderRadius: 0,
                      background: sceneChipSurface(i), color: 'var(--bs-fg)',
                      border: p.currentScene === i ? '3px solid var(--bs-accent)' : '1px solid var(--bs-border-control)',
                      padding: '2px 6px', textAlign: 'left', font: CHIP_FONT, overflow: 'hidden', whiteSpace: 'nowrap', cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                </li>
              );
            })}
            {elapsed !== null && <li aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, width: 3, left: `${Math.min(100, (elapsed / p.lengthSec) * 100)}%`, background: 'var(--bs-fg)' }} />}
          </ul>
          <EnergyGraph scenes={p.scenes} lengthSec={p.lengthSec} />
          <p style={note}>{`Tap a scene to change it. ▶ Rehearse from here plays the piece from that moment. While the board plays, Jump here now switches to a scene straight away; Stop gives ${who.name} their own sound back. 1 pass = ${p.passSec.toFixed(1)} s.`}</p>
          {p.scenes.map((s, i) => (
            <SceneRow
              key={s.id} number={i + 1} scene={s} open={selected === s.id} current={p.currentScene === i}
              lengthSec={p.lengthSec} otherTimes={p.scenes.filter((_, k) => k !== i).map((x) => x.at)}
              loops={p.loops} worldOptions={p.worldOptions} playerName={p.playerName}
              onToggleOpen={() => setSelected(selected === s.id ? null : s.id)}
              onGo={p.running ? () => p.onGoScene(i) : undefined}
              onRehearse={!p.running && typeof s.at === 'number' ? () => p.onRehearseFrom(s.at as number) : undefined}
              onUpdateFromNow={p.running ? () => p.onUpdateSceneFromNow(i) : undefined}
              onEdit={(patch) => p.onEditScene(i, patch)}
              onNewIdeas={() => p.onNewIdeasScene(i)}
              onDelete={(pressed) => {
                setSelected(null);
                p.onDeleteScene(i);
                // Onto Undo, its opposite (or the heading, with no scene left to show it
                // beside). When Undo goes, pressed or after its time, onto the scene if it
                // came back, else the heading.
                void focusWhenGone(() => undoRef.current ?? headingRef.current, pressed).then((undo) => {
                  if (undo !== null && undo === undoRef.current) void focusWhenGone(() => sceneRow(s.id) ?? headingRef.current, undo, 20_000);
                });
              }}
            />
          ))}
          {p.deletedSceneName && (
            <div role="status" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
              <span>{`Deleted “${p.deletedSceneName}”.`}</span>
              <Button ref={undoRef} tone="secondary" onClick={p.onUndoDelete}>Undo</Button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text" value={newName} placeholder={`Scene ${p.scenes.length + 1}`} aria-label="Name for a new scene"
              onChange={(e) => setNewName(e.target.value)} style={{ width: 140, minHeight: 'var(--bs-target)' }}
            />
            <Button
              tone="secondary" disabled={p.scenes.length >= MAX_SCENES}
              title={p.scenes.length >= MAX_SCENES ? 'Twelve scenes is the most.' : 'The loops playing now and the sound as it is now'}
              onClick={() => { p.onSaveSceneFromNow(newName); setNewName(''); }}
            >
              + Add a scene from what&rsquo;s playing
            </Button>
            <Button tone="quiet" onClick={p.onMakePlan}>✦ Start again from the plan</Button>
          </div>
          <div role="group" aria-label="The same ideas each rehearsal" style={card}>
            <span style={{ fontWeight: 800 }}>The same ideas each rehearsal</span>
            <p style={note}>
              {p.surpriseMe
                ? 'Surprise me is on: the band, the extra notes and Sounds change come out differently every time the piece plays, and the AI\u2019s ideas are not kept.'
                : 'The band, the extra notes and Sounds change play the same every time the piece plays, so a rehearsal is the piece. The AI\u2019s ideas are kept with each scene once made. ▶ Play the board on its own also repeats, but keeps no AI ideas.'}
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Button tone="secondary" onClick={p.onNewIdeasPiece} reason={p.surpriseMe ? 'Surprise me already gives new ideas every time.' : null}>↻ New ideas for the whole piece</Button>
            </div>
            <Switch
              label="Surprise me each time" checked={p.surpriseMe} onChange={p.onSurpriseMe}
              hint="On: different ideas every time, as before. Off: every rehearsal plays the same."
            />
          </div>
          <Switch
            label="Scenes leave the player's strips alone"
            checked={p.respectPlayer}
            onChange={p.onRespectPlayer}
            hint={`If the player moved ${WORDS.speed}, ${WORDS.extraNotes} or ${WORDS.soundsChange} on the iPad since the last scene, the next scene keeps their setting.`}
          />
        </>
      )}
      {p.colours.length > 0 && <ColourTimes colours={p.colours} lengthSec={p.lengthSec} palette={p.palette} onChange={p.onColourEntry} />}
      <StepFooter back={{ label: 'Loops', onClick: () => p.onStep('loops') }} next={{ label: 'Next: Ending & check', onClick: () => p.onStep('ending'), primary: true }} />
    </section>
  );
}

/**
 * When each colour comes in: a colour's counters stay silent until its time in the piece,
 * then play. All the counters go on the board before the piece (Tim can't place them), so
 * this is how the opening is the loops alone. For the whole piece, not per scene.
 */
function ColourTimes({ colours, lengthSec, palette, onChange }: { colours: PieceColourTime[]; lengthSec: number; palette: BoardPalette; onChange(id: string, at: number | null): void }): JSX.Element {
  return (
    <div style={card} role="group" aria-labelledby="piece-colours">
      <span id="piece-colours" style={{ fontWeight: 800 }}>When each colour comes in</span>
      <p style={note}>
        A colour&rsquo;s counters stay silent until its time, then play. The times count only while the
        piece plays: ▶ Play the board on its own plays every colour. Blank: from the start. Loops always play.
      </p>
      {colours.map((c) => <ColourTimeRow key={c.id} colour={c} lengthSec={lengthSec} palette={palette} onChange={(at) => onChange(c.id, at)} />)}
    </div>
  );
}

function ColourTimeRow({ colour: c, lengthSec, palette, onChange }: { colour: PieceColourTime; lengthSec: number; palette: BoardPalette; onChange(at: number | null): void }): JSX.Element {
  const [text, setText] = useState(c.at === null ? '' : formatClock(c.at));
  const parsed = text.trim() === '' ? null : parseClock(text);
  const typo = text.trim() !== '' && parsed === null;
  // Past the longest piece is refused too: it could never be kept.
  const refused = typo || (parsed !== null && parsed > MAX_PIECE_SEC);
  const problem = typo
    ? (plainNumberProblem(text) ?? 'Type a time as minutes:seconds, like 1:30.')
    : colourEntryProblem(parsed, lengthSec);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* The counters' own two-tone ring, as in the colour table (A16): a dark counter stays seen. */}
        <SwatchChip swatch={c.swatch} palette={palette} surface={palette.elev} size={18} />
        <span style={{ fontWeight: 700, minWidth: 64 }}>{c.name}</span>
        <span style={{ fontSize: 14, color: 'var(--bs-fg2)', minWidth: 60 }}>{c.job}</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
          Comes in at
          <input
            type="text" value={text} placeholder="from the start" aria-invalid={problem !== null}
            aria-label={`When ${c.name} comes in, in the piece (minutes:seconds; blank: from the start)`}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              // Unreadable: refused beside the field, and not saved.
              if (refused) return;
              // Shown back as it was read ("1.30" → 1:30), so a misreading is seen.
              setText(parsed === null ? '' : formatClock(parsed));
              if (parsed !== c.at) onChange(parsed);
            }}
            style={{ width: 110, minHeight: 'var(--bs-target)' }}
          />
        </label>
      </div>
      {problem && <span role="alert" style={{ fontSize: 14, color: 'var(--bs-warn)' }}>{problem}</span>}
    </div>
  );
}

/** Step 3: how long, how it ends, and whether everything is ready. */
function EndingStep(p: PieceStepsProps): JSX.Element {
  const perf = p.performance;
  return (
    <section aria-labelledby="piece-ending" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 id="piece-ending" style={heading}>3 · Ending &amp; check</h2>
      <div style={card}>
        <p style={{ margin: 0, fontWeight: 700 }}>{`${formatClock(p.lengthSec)} · ${describeEnding(perf)} · ${perf.ending === 'cue' ? 'you press End' : 'ends at the time'}`}</p>
        <p style={note}>The clock counts down from the length, with cues at 1 minute, 30 and 10 seconds. The piece never runs over: if End hasn&rsquo;t been pressed, the ending starts by itself in time to finish at {formatClock(p.lengthSec)}.</p>
      </div>
      <LengthField lengthSec={p.lengthSec} scenes={p.scenes} onChange={(lengthSec) => p.onPerformance({ lengthSec })} />
      <div role="radiogroup" aria-label="How it ends" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontWeight: 700 }}>How it ends</span>
        {ENDINGS.map((e) => {
          const on = perf.style === e.value;
          return (
            <button
              key={e.value} type="button" role="radio" aria-checked={on} onClick={() => p.onPerformance({ style: e.value })}
              style={{
                textAlign: 'left', padding: '8px 10px', borderRadius: 'var(--bs-radius-md)', cursor: 'pointer', color: 'inherit', minHeight: 'var(--bs-target)',
                border: `2px solid ${on ? 'var(--bs-accent)' : 'var(--bs-border-control)'}`, background: on ? 'var(--bs-accent-muted)' : 'var(--bs-raised)',
              }}
            >
              <span style={{ fontWeight: 700 }}>{`${on ? '● ' : '○ '}${e.label}`}</span>
              <span style={{ display: 'block', fontSize: 14, color: 'var(--bs-fg2)' }}>{e.what}</span>
            </button>
          );
        })}
      </div>
      {perf.style !== 'stop' && (
        <SegmentedControl<number>
          label="The ending takes" showLabel
          value={perf.fadePasses}
          onChange={(fadePasses) => p.onPerformance({ fadePasses })}
          options={[{ value: 1, label: '1 pass' }, { value: 2, label: '2 passes' }, { value: 4, label: '4 passes' }]}
        />
      )}
      <SegmentedControl<EndingMode>
        label="When it ends" showLabel
        value={perf.ending}
        onChange={(ending) => p.onPerformance({ ending })}
        options={[
          { value: 'cue', label: `When I press End (by ${formatClock(p.lengthSec)} at the latest)` },
          { value: 'auto', label: `By itself at ${formatClock(p.lengthSec)}` },
        ]}
      />
      {endingTooLong(perf, p.passSec) && (
        <span role="alert" style={{ fontSize: 14, color: 'var(--bs-warn)' }}>The ending takes as long as half the piece at this tempo. Choose fewer passes or a longer length.</span>
      )}
      <p style={note}>
        The piece starts from <b>Show → ▶ Start the piece</b>, or <b>Rehearse from here</b> on a
        scene. <b>▶ Play the board</b> on its own just plays what is on the board: no clock, no scenes.
      </p>
      <span style={{ fontWeight: 700, marginTop: 6 }}>Ready check</span>
      <ReadyList items={p.readyItems} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button tone="secondary" onClick={p.onBackup}>⤓ Back up to a file</Button>
        <Button tone="quiet" onClick={p.onRestore}>⤒ Restore from a file</Button>
      </div>
      <p role="status" style={note}>{p.diskLine}</p>
      {p.restoreError && <span role="alert" style={{ fontSize: 14, color: 'var(--bs-danger)' }}>{p.restoreError}</span>}
      <StepFooter back={{ label: 'Scenes', onClick: () => p.onStep('scenes') }} next={{ label: 'Go to Show', onClick: p.onShow, primary: true }} />
    </section>
  );
}

/**
 * The piece's length as m:ss, checked as it is typed: from 0:30 to 7:00 (F5). A length it
 * refuses is not saved. A new length leaves the scenes where they are, and says so.
 */
function LengthField({ lengthSec, scenes, onChange }: { lengthSec: number; scenes: readonly Scene[]; onChange(sec: number): void }): JSX.Element {
  const [text, setText] = useState(formatClock(lengthSec));
  const [changed, setChanged] = useState(false);
  const parsed = parseClock(text);
  const problem = plainNumberProblem(text) ?? pieceLengthProblem(parsed);
  const late = scenes.filter((s) => typeof s.at === 'number' && s.at >= lengthSec).map((s) => s.name);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, fontSize: 14 }}>
        Length of the piece
        <input
          type="text" value={text} aria-invalid={problem !== null} aria-describedby="perform-length-problem"
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (parsed === null || problem !== null) return;
            setText(formatClock(parsed));
            if (parsed === lengthSec) return;
            onChange(parsed);
            setChanged(true);
          }}
          style={{ width: 90, minHeight: 'var(--bs-target)' }}
        />
        <span id="perform-length-problem" style={{ fontSize: 14, color: problem ? 'var(--bs-warn)' : 'transparent' }}>{problem ?? ' '}</span>
      </label>
      {changed && scenes.length > 0 && (
        <p role="status" style={note}>
          {`The scenes keep their times.${late.length > 0
            ? ` ${listNames(late)} now ${late.length === 1 ? 'comes' : 'come'} in at or after the end: see the check below.`
            : ' Change them in Scenes if they should move.'}`}
        </p>
      )}
    </div>
  );
}

interface SceneRowProps {
  /** The scene's number, the same as on its block on the timeline. */
  number: number;
  scene: Scene;
  open: boolean;
  current: boolean;
  lengthSec: number;
  otherTimes: (number | null | undefined)[];
  /** Every loop slot, saved or empty. */
  loops: PieceLoop[];
  worldOptions: { value: SoundWorldChoice; label: string }[];
  playerName: string | null;
  onToggleOpen(): void;
  /**
   * Switch to this scene now (only while the board plays). A scene's settings are for the
   * run: while stopped there was nothing to hear, and the jump changed the player's own
   * sound, band, Extra notes and tempo for good (T2-05).
   */
  onGo?(): void;
  /** Play from this scene's time (only while stopped). */
  onRehearse?(): void;
  /**
   * Copy what is playing into this scene (only while the board plays). Stopped, it copied
   * nothing into the scene's loops and the player's own sound into its settings (R2-T2-02).
   */
  onUpdateFromNow?(): void;
  onEdit(patch: ScenePatch): void;
  /** New ideas for this scene. */
  onNewIdeas(): void;
  /** Delete it; `pressed` is the Delete button, for where focus goes next. */
  onDelete(pressed: HTMLElement): void;
}

/** One scene: a line saying what it is, opening into everything it sets, editable there. */
function SceneRow(r: SceneRowProps): JSX.Element {
  const s = r.scene;
  const who = playerWords(r.playerName);
  const [timeText, setTimeText] = useState(typeof s.at === 'number' ? formatClock(s.at) : '');
  const parsed = timeText.trim() === '' ? null : parseClock(timeText);
  const typo = timeText.trim() !== '' && parsed === null;
  const problem = typo
    ? (plainNumberProblem(timeText) ?? 'Type a time as minutes:seconds, like 2:30.')
    : sceneTimeProblem(parsed, r.lengthSec, r.otherTimes);
  const saved = r.loops.filter((l) => l.state !== 'empty');
  // A loop the scene uses that holds nothing still shows, marked, so it can be taken out (T2-06).
  const emptyInScene = r.loops.filter((l) => l.state === 'empty' && s.loops.includes(l.slot));
  const loopNames = s.loops.map((slot) => r.loops.find((l) => l.slot === slot)).filter((l): l is PieceLoop => l !== undefined)
    .map((l) => (l.state === 'empty' ? `${loopName(l)} (empty)` : loopName(l)));
  const world = r.worldOptions.find((w) => w.value === s.settings.soundWorld)?.label ?? s.settings.soundWorld;
  // How it reaches its speed: 0 = at once.
  const glide = typeof s.glideSec === 'number' && s.glideSec > 0 ? s.glideSec : 0;
  const fill = FILL_STEPS[nearestStep(FILL_STEPS, s.settings.fillAmount)].label.toLowerCase();
  const evolve = EVOLVE_STEPS[nearestStep(EVOLVE_STEPS, s.settings.evolveAmount)].label.toLowerCase();
  // The line under the scene: what A1 keeps in view, its loops and its Energy.
  const summary = [
    loopNames.length > 0 ? loopNames.join(', ') : s.alone ? `${who.Name} alone` : 'no loops',
    `Energy: ${ENERGY_NAMES[s.settings.sceneEnergy]}`,
  ].join(' · ');
  // The rest, said on "More for this scene" while it is folded, so nothing set is hidden.
  const moreSummary = [
    world,
    BAND_WORDS[s.settings.band],
    ...(s.settings.band !== 'off' ? [bandJobsWords(s.settings.bandJobs)] : []),
    fill === 'off' ? 'no extra notes' : `${fill} extra notes`,
    evolve === 'off' ? 'sounds stay' : `sounds change ${evolve === 'more' ? 'a lot' : 'slowly'}`,
    `${s.settings.bpm} BPM${glide > 0 ? `, reached over ${glide} s` : ''}`,
    chordWords(s.settings.chords),
    ...(s.leadIn ? [`${LEAD_IN_WORDS[s.leadIn].label.toLowerCase()} before it`] : []),
  ].join(' · ');
  const set = (patch: Partial<Scene['settings']>): void => r.onEdit({ settings: { ...s.settings, ...patch } });
  const kept = s.aiIdeas?.length ?? 0;
  // One fold for every scene, remembered for the session (A1).
  const [more, toggleMore] = useSessionFold('scene-more');

  return (
    <div
      style={{
        borderRadius: 'var(--bs-radius-md)', padding: 6, display: 'flex', flexDirection: 'column', gap: 6,
        borderTop: `2px solid ${r.current ? 'var(--bs-accent)' : 'var(--bs-border)'}`,
        borderRight: `2px solid ${r.current ? 'var(--bs-accent)' : 'var(--bs-border)'}`,
        borderBottom: `2px solid ${r.current ? 'var(--bs-accent)' : 'var(--bs-border)'}`,
        // A neutral stripe, never a colour of the scene's own (B10): the number says which.
        borderLeft: `8px solid ${r.current ? 'var(--bs-accent)' : 'var(--bs-border-control)'}`,
      }}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span aria-hidden="true" style={{ minWidth: 26, height: 26, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, border: '1px solid var(--bs-border-control)', background: 'var(--bs-raised)' }}>{r.number}</span>
        <button
          type="button" aria-expanded={r.open} onClick={r.onToggleOpen} data-scene-row={s.id}
          style={{ flex: '1 1 200px', minHeight: 'var(--bs-target)', textAlign: 'left', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
        >
          <span style={{ fontWeight: 700 }}>{`${typeof s.at === 'number' ? formatClock(s.at) : 'by hand'} · ${s.name}${r.current ? ' · on now' : ''}`}</span>
          <span style={{ display: 'block', fontSize: 14, color: 'var(--bs-fg2)' }}>{summary}</span>
        </button>
        {r.onRehearse && (
          <Button
            tone="secondary"
            // It goes once the rehearsal plays: focus goes to ■ Stop, one press from stopping it.
            onClick={(e) => { r.onRehearse?.(); void focusWhenGone(() => document.getElementById(PLAY_STOP_ID), e.currentTarget, 20_000); }}
            aria-label={`Rehearse from here: ${s.name}, play the piece from ${typeof s.at === 'number' ? formatClock(s.at) : ''}`}
          >
            ▶ Rehearse from here
          </Button>
        )}
        {r.onGo && (
          <Button tone={r.current ? 'selected' : 'secondary'} aria-pressed={r.current} onClick={r.onGo} aria-label={`${r.current ? 'On now' : 'Jump here now'}: ${s.name}`}>{r.current ? 'On now' : 'Jump here now'}</Button>
        )}
      </div>
      {r.open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 4 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, fontSize: 14 }}>
              Name
              <input
                type="text" defaultValue={s.name} aria-label="Scene name"
                onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== s.name) r.onEdit({ name }); }}
                style={{ width: 140, minHeight: 'var(--bs-target)' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, fontSize: 14 }}>
              Comes in at
              <input
                type="text" value={timeText} placeholder="m:ss" aria-invalid={problem !== null} aria-label={`When ${s.name} comes in (minutes:seconds)`}
                onChange={(e) => setTimeText(e.target.value)}
                onBlur={() => {
                  // Unreadable: refused beside the field, and not saved.
                  if (typo) return;
                  // Shown back as it was read ("2.30" → 2:30, "0" → 0:00), so a misreading is seen.
                  setTimeText(parsed === null ? '' : formatClock(parsed));
                  if (parsed !== (typeof s.at === 'number' ? s.at : null)) r.onEdit({ at: parsed });
                }}
                style={{ width: 80, minHeight: 'var(--bs-target)' }}
              />
            </label>
          </div>
          {problem && <span role="alert" style={{ fontSize: 14, color: 'var(--bs-warn)' }}>{problem}</span>}
          <div role="group" aria-label="Loops in this scene" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {saved.length === 0 && <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>No loops saved yet.</span>}
            {emptyInScene.map((l) => (
              <button
                key={`empty${l.slot}`} type="button"
                onClick={() => r.onEdit({ loops: s.loops.filter((x) => x !== l.slot) })}
                title="This loop holds nothing, so nothing plays from it"
                style={{
                  minHeight: 'var(--bs-target)', padding: '4px 10px', borderRadius: 999, cursor: 'pointer', color: 'inherit',
                  border: '2px dashed var(--bs-warn)', background: 'transparent',
                }}
              >
                {`${loopName(l)}: empty, take it out`}
              </button>
            ))}
            {saved.map((l) => {
              const inScene = s.loops.includes(l.slot);
              return (
                <button
                  key={l.slot} type="button" aria-pressed={inScene}
                  onClick={() => r.onEdit({ loops: inScene ? s.loops.filter((x) => x !== l.slot) : [...s.loops, l.slot].sort((a, b) => a - b) })}
                  style={{
                    minHeight: 'var(--bs-target)', padding: '4px 10px', borderRadius: 999, cursor: 'pointer', color: 'inherit',
                    border: `2px solid ${inScene ? 'var(--bs-accent)' : 'var(--bs-border-control)'}`, background: inScene ? 'var(--bs-accent-muted)' : 'transparent',
                  }}
                >
                  {`${inScene ? '✓ ' : ''}${loopName(l)}`}
                </button>
              );
            })}
          </div>
          {/* A scene with no loops is silence unless the player plays: only on purpose (F4). */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, minHeight: 'var(--bs-target)', cursor: 'pointer' }}>
            <input
              type="checkbox" checked={s.alone === true}
              onChange={(e) => r.onEdit({ alone: e.target.checked })}
              style={{ width: 20, height: 20 }}
            />
            <span>{`${who.Name} alone: no loops, only what ${who.name} plays`}</span>
          </label>
          <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>Energy</span>
          <SegmentedControl<number>
            label="Energy of this scene" value={s.settings.sceneEnergy} onChange={(e) => set({ sceneEnergy: e as SceneEnergy })}
            options={[{ value: 0, label: ENERGY_NAMES[0] }, ...ENERGY_LEVELS.map((e) => ({ value: e, label: ENERGY_NAMES[e] }))]}
          />
          <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>{ENERGY_WORDS[s.settings.sceneEnergy]}</span>
          <button
            type="button" aria-expanded={more} onClick={toggleMore}
            style={{ alignSelf: 'stretch', textAlign: 'left', background: 'transparent', border: 'none', borderTop: '1px solid var(--bs-border)', color: 'inherit', minHeight: 'var(--bs-target)', cursor: 'pointer', padding: '6px 0' }}
          >
            <span style={{ fontWeight: 700 }}>{`${more ? '▾' : '▸'} More for this scene`}</span>
            {!more && <span style={{ display: 'block', fontSize: 14, color: 'var(--bs-fg2)' }}>{moreSummary}</span>}
          </button>
          {more && (<>
          <SegmentedControl<SoundWorldChoice> label="Sound world" showLabel value={s.settings.soundWorld} onChange={(soundWorld) => set({ soundWorld })} options={r.worldOptions} />
          <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>Band</span>
          <SegmentedControl<BandLevel>
            label="Band" value={s.settings.band} onChange={(band) => set({ band })}
            options={[{ value: 'off', label: 'Off' }, { value: 'gentle', label: 'Quiet' }, { value: 'full', label: 'Full' }]}
          />
          {s.settings.band !== 'off' && <BandJobsChoice value={s.settings.bandJobs} onChange={(bandJobs) => set({ bandJobs })} />}
          <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>Lead-in</span>
          <SegmentedControl<LeadIn>
            label="Lead-in" value={s.leadIn ?? 'none'} onChange={(leadIn) => r.onEdit({ leadIn })}
            options={LEAD_INS.map((l) => ({ value: l, label: LEAD_IN_WORDS[l].label, hint: LEAD_IN_WORDS[l].what }))}
          />
          <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>{`${LEAD_IN_WORDS[s.leadIn ?? 'none'].what}${s.leadIn ? ' Brought in by hand, it plays in what is left of that pass.' : ''}`}</span>
          <ChordChoice value={s.settings.chords} onChange={(chords) => set({ chords })} />
          <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>Extra notes</span>
          <SegmentedControl<number>
            label="Extra notes" value={nearestStep(FILL_STEPS, s.settings.fillAmount)}
            onChange={(k) => set({ fillAmount: FILL_STEPS[k].value })}
            options={FILL_STEPS.map((x, k) => ({ value: k, label: x.label }))}
          />
          <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>Sounds change</span>
          <SegmentedControl<number>
            label="Sounds change" value={nearestStep(EVOLVE_STEPS, s.settings.evolveAmount)}
            onChange={(k) => set({ evolveAmount: EVOLVE_STEPS[k].value })}
            options={EVOLVE_STEPS.map((x, k) => ({ value: k, label: x.label }))}
          />
          <LabeledSlider label={WORDS.speed} min={40} max={240} value={s.settings.bpm} display={`${s.settings.bpm} BPM`} onChange={(v) => set({ bpm: Math.round(v) })} />
          {/* Gradually: when it comes in while the board plays, from the speed then to this one. */}
          <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>Reach this speed</span>
          <SegmentedControl<'once' | 'gradually'>
            label="Reach this speed" value={glide > 0 ? 'gradually' : 'once'}
            onChange={(v) => {
              if (v === (glide > 0 ? 'gradually' : 'once')) return;
              r.onEdit({ glideSec: v === 'once' ? 0 : GLIDE_DEFAULT_SEC });
            }}
            options={[{ value: 'once', label: 'At once' }, { value: 'gradually', label: 'Gradually' }]}
          />
          {glide > 0 && (
            <LabeledSlider
              label="Over" min={GLIDE_MIN_SEC} max={GLIDE_MAX_SEC} step={1} value={glide} display={`${glide} seconds`}
              onChange={(v) => r.onEdit({ glideSec: Math.round(v) })}
            />
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button tone="secondary" onClick={r.onNewIdeas} aria-label={`New ideas: ${s.name}`}>↻ New ideas</Button>
            <span style={{ fontSize: 14, color: 'var(--bs-fg2)', flex: '1 1 200px' }}>
              {`This scene plays the same ideas every rehearsal.${kept > 0 ? ` ${kept} AI ${kept === 1 ? 'idea is' : 'ideas are'} kept for it.` : ''} New ideas gives it different ones.`}
            </span>
          </div>
          {!r.onUpdateFromNow && <p style={note}>While the board plays, Update from now copies what is playing into this scene.</p>}
          {r.onUpdateFromNow && (
            <div><Button tone="secondary" onClick={r.onUpdateFromNow} title="Replace this scene's loops and sound with what is playing now">Update from now</Button></div>
          )}
          </>)}
          {/* Not a setting: always in reach, folded or not. */}
          <div><Button tone="quiet" onClick={(e) => r.onDelete(e.currentTarget)}>Delete scene</Button></div>
        </div>
      )}
    </div>
  );
}
