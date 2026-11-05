import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { MAX_PIECES } from '../../../../songs/performance/pieces';
import { focusWhenGone } from '../ui/focusNext';
import { SceneEditor } from './SceneEditor';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Switch } from '../ui/Switch';
import { Note } from '../ui/explain';
import type { SoundWorldChoice } from '../../../../audio/worlds/soundWorlds';
import {
  describeEnding, endingTooLong, formatClock, MAX_PIECE_SEC, parseClock, pieceLengthProblem, plainNumberProblem,
  type ClockView, type EndingMode, type EndingStyle, type PerformanceSettings,
} from '../../../../songs/performance/clock';
import type { LoopSlotState, Scene } from '../../../../songs/performance/launcher';
import type { ScenePatch } from '../../../../songs/performance/piece';
import { colourEntryProblem } from '../../../../songs/performance/colourEntries';
import { ReadyList, type ReadyItem } from './ReadyCheck';
import { WORDS } from '../words';
import { listNames } from '../pieceCheck';
import { SwatchChip } from '../ui/SwatchChip';
import type { BoardPalette } from '../theme/boardTokens';

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
  /** The scene selected in the storyboard (by id), shown in the editor here. */
  selectedScene: string | null;
  onSelectScene(id: string | null): void;
  /** A scene's length typed: the later scenes move (see storyboard.withLength). */
  onLength(i: number, sec: number): void;
  /** Why nothing can be changed now (the piece plays from Show), or null. */
  locked: string | null;
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
  /** The player's pieces (item 3): the one open now, and the rest. */
  pieces: { id: string; name: string; scenes: number; lengthSec: number }[];
  pieceId: string;
  /** Why another piece can't be opened now (the piece plays), or null. */
  pieceLocked: string | null;
  onOpenPiece(id: string): void;
  onNewPiece(): void;
  onDuplicatePiece(id: string): void;
  onDeletePiece(id: string): void;
  onRenamePiece(id: string, name: string): void;
  onGoScene(i: number): void;
  /** Hear from here: play the piece from scene i (two passes before it, when a scene comes before). */
  onRehearseFrom(i: number): void;
  onSaveSceneFromNow(name: string): void;
  onUpdateSceneFromNow(i: number): void;
  onEditScene(i: number, patch: ScenePatch): void;
  onDeleteScene(i: number): void;
  /** A copy of a scene, right after it, with no time yet (item 7). */
  onDuplicateScene(i: number): void;
  onUndoDelete(): void;
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


/** A loop at a glance: its counters on a tiny board, so loops are told apart by eye. */
export function LoopThumb({ cells, rows, cols, swatchFor, width = 64 }: {
  cells: readonly { row: number; col: number; colour: string }[]; rows: number; cols: number;
  swatchFor(colour: string): string; width?: number;
}): JSX.Element {
  const cw = width / Math.max(1, cols);
  const h = cw * rows;
  return (
    <svg width={width} height={h} aria-hidden="true" style={{ flexShrink: 0 }}>
      {/* The empty squares as dots, as the board draws them (L5). */}
      {Array.from({ length: rows * cols }, (_, k) => (
        <circle key={`sq${k}`} cx={(k % cols) * cw + cw / 2} cy={Math.floor(k / cols) * cw + cw / 2} r={Math.max(1, cw * 0.08)} fill="var(--bs-border-control)" />
      ))}
      {cells.map((c, i) => (
        <circle key={i} cx={c.col * cw + cw / 2} cy={c.row * cw + cw / 2} r={Math.max(1.5, cw * 0.38)} fill={swatchFor(c.colour)} />
      ))}
    </svg>
  );
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




const heading = { margin: 0, fontSize: 20, fontWeight: 600 } as const;
const note = { fontSize: 14, color: 'var(--bs-fg2)', margin: 0 } as const;
/** A section (L5): a hairline above it, never a card. */
const card = { padding: '10px 0 4px', borderTop: '1px solid var(--bs-border)', display: 'flex', flexDirection: 'column', gap: 6 } as const;

const ENDINGS: { value: EndingStyle; label: string; what: string }[] = [
  { value: 'chord', label: 'Final chord', what: 'The texture thins, then a held chord and a crash ring out. A clear end the audience hears.' },
  { value: 'fade', label: 'Fade out', what: 'Everything fades together.' },
  { value: 'slow', label: 'Slow down', what: 'The speed eases to about half, then stops on the one.' },
  { value: 'thin', label: 'Thin out', what: 'The band and the extra notes leave first, so the player’s own notes end the piece.' },
  { value: 'stop', label: 'Stop', what: 'A tidy stop at the end of the pass.' },
];

/**
 * Make a piece (Keep design, 5 Nov 2026, K2): the panel beside the board holds the editor of
 * the scene selected in the storyboard under the board, or Check (the length, the ending,
 * the whole piece's settings and the ready check). New loop's own panel shows here while it
 * is open. The step ids stay: 'loops' and 'scenes' are the editor, 'ending' is Check.
 */
export function PieceSteps(p: PieceStepsProps): JSX.Element {
  const i = p.scenes.findIndex((s) => s.id === p.selectedScene);
  const s = i >= 0 ? p.scenes[i] : null;
  const undoRef = useRef<HTMLButtonElement>(null);
  const nextAt = s ? (p.scenes.slice(i + 1).map((x) => x.at).find((at): at is number => typeof at === 'number') ?? null) : null;
  // The editor is remade only when its scene or the board changes, not on every tick of the clock.
  const editor = useMemo(() => (s ? (
    <SceneEditor
      key={s.id} number={i + 1} scene={s} current={p.currentScene === i} running={p.running} lengthSec={p.lengthSec} passSec={p.passSec} nextAt={nextAt}
      loops={p.loops} worldOptions={p.worldOptions} playerName={p.playerName} loopFadePasses={p.loopFadePasses} locked={p.locked}
      onEdit={(patch) => p.onEditScene(i, patch)}
      onLength={(sec) => p.onLength(i, sec)}
      onHear={!p.running && typeof s.at === 'number' ? () => p.onRehearseFrom(i) : undefined}
      onGo={p.running ? () => p.onGoScene(i) : undefined}
      onUpdateFromNow={p.running ? () => p.onUpdateSceneFromNow(i) : undefined}
      onNewIdeas={() => p.onNewIdeasScene(i)}
      onDuplicate={() => p.onDuplicateScene(i)}
      onDelete={(pressed) => {
        p.onSelectScene(null);
        p.onDeleteScene(i);
        // Onto Undo, its opposite (T4-09); when Undo goes, onto the storyboard's first card.
        void focusWhenGone(() => undoRef.current ?? document.querySelector<HTMLElement>('[role="listbox"][aria-label^="The piece"] [data-scene-card]'), pressed);
      }}
      onCheck={() => p.onStep('ending')}
    />
  ) : null), [s, i, p.currentScene, p.running, p.lengthSec, p.passSec, nextAt, p.loops, p.worldOptions, p.playerName, p.loopFadePasses, p.locked]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
      {p.step === 'ending' ? <CheckPanel {...p} /> : editor ?? (
        <p style={note}>{p.scenes.length === 0 ? 'No scenes yet: see under the board.' : 'Press a scene under the board to change it here.'}</p>
      )}
      {p.step !== 'ending' && p.deletedSceneName && (
        <div role="status" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
          <span>{`Deleted “${p.deletedSceneName}”.`}</span>
          {/* Undo puts the scene back under the board: focus goes to its row's first card, never the page (T4-09). */}
          <Button ref={undoRef} tone="secondary" onClick={(e) => { p.onUndoDelete(); void focusWhenGone(() => document.querySelector<HTMLElement>('[role="listbox"][aria-label^="The piece"] [data-scene-card]'), e.currentTarget); }}>Undo</Button>
        </div>
      )}
      {/* New loop's panel (from silence), while it is open: the second way (K1). */}
      {p.step !== 'ending' && p.newLoop}
    </div>
  );
}



/**
 * The piece open now, and the player's other pieces (item 3), under the storyboard's ▾ (K2):
 * every piece with Open, Duplicate and Delete, a Rename field for the one open now, and New
 * piece. The loops are shared, so they are not here.
 */
export type PiecePickerProps = Pick<PieceStepsProps, 'pieces' | 'pieceId' | 'pieceLocked' | 'onOpenPiece' | 'onNewPiece' | 'onDuplicatePiece' | 'onDeletePiece' | 'onRenamePiece'>;
export function PiecePicker(p: PiecePickerProps): JSX.Element {
  return (
    <div role="group" aria-label="Pieces" data-piece-picker="" style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 6, borderBottom: '1px solid var(--bs-border)' }}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {p.pieces.map((x) => {
            const isCurrent = x.id === p.pieceId;
            return (
              <li
                key={x.id}
                aria-label={`${x.name}: ${x.scenes} ${x.scenes === 1 ? 'scene' : 'scenes'}, ${formatClock(x.lengthSec)}${isCurrent ? ', open now' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 0', borderTop: '1px solid var(--bs-border)' }}
              >
                {isCurrent ? (
                  <input
                    type="text" value={x.name} aria-label="Name of this piece"
                    onChange={(e) => p.onRenamePiece(x.id, e.target.value)}
                    style={{ width: 140, minHeight: 'var(--bs-target)', fontWeight: 600 }}
                  />
                ) : (
                  <span style={{ width: 140, fontWeight: 500 }}>{x.name}</span>
                )}
                <span style={{ fontSize: 14, color: 'var(--bs-fg2)', flex: '1 1 80px' }}>{`${x.scenes} ${x.scenes === 1 ? 'scene' : 'scenes'} · ${formatClock(x.lengthSec)}${isCurrent ? ' · open now' : ''}`}</span>
                <span style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                  {!isCurrent && <Button tone="secondary" onClick={() => p.onOpenPiece(x.id)} aria-label={`Open: ${x.name}`} reason={p.pieceLocked}>Open</Button>}
                  <Button tone="quiet" onClick={() => p.onDuplicatePiece(x.id)} aria-label={`Duplicate: ${x.name}`} reason={p.pieceLocked ?? (p.pieces.length >= MAX_PIECES ? 'Twelve pieces is the most.' : null)}>Duplicate</Button>
                  {p.pieces.length > 1 && <Button tone="quiet" onClick={() => p.onDeletePiece(x.id)} aria-label={`Delete: ${x.name}`} reason={p.pieceLocked}>Delete</Button>}
                </span>
              </li>
            );
          })}
        </ul>
        <div>
          <Button tone="secondary" onClick={p.onNewPiece} reason={p.pieceLocked ?? (p.pieces.length >= MAX_PIECES ? 'Twelve pieces is the most.' : null)}>New piece</Button>
        </div>
        <Note as="p">A piece is its scenes, its length and its ending, and when each colour comes in. The loops are the player&rsquo;s, shared by every piece.</Note>
    </div>
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
function CheckPanel(p: PieceStepsProps): JSX.Element {
  const perf = p.performance;
  return (
    <section aria-labelledby="piece-ending" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 id="piece-ending" style={heading}>Check</h2>
      <div style={card}>
        <p style={{ margin: 0, fontWeight: 700 }}>{`${formatClock(p.lengthSec)} · ${describeEnding(perf)} · ${perf.ending === 'cue' ? 'you press End' : 'ends at the time'}`}</p>
        <p style={note}>The clock counts down from the length, with cues at 1 minute, 30 and 10 seconds. The piece never runs over: if End hasn&rsquo;t been pressed, the ending starts by itself in time to finish at {formatClock(p.lengthSec)}.</p>
      </div>
      <LengthField lengthSec={p.lengthSec} scenes={p.scenes} onChange={(lengthSec) => p.onPerformance({ lengthSec })} />
      <Switch
        label="Count in" checked={perf.countIn} onChange={(countIn) => p.onPerformance({ countIn })}
        hint="▶ Start the piece waits for the top of the next pass: the board plays on, the strip counts the steps down, and the piece comes in on step 1."
      />
      <div role="radiogroup" aria-label="How it ends" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontWeight: 700 }}>How it ends</span>
        {ENDINGS.map((e) => {
          const on = perf.style === e.value;
          return (
            <button
              key={e.value} type="button" role="radio" aria-checked={on} onClick={() => p.onPerformance({ style: e.value })}
              // Rows under hairlines (L5): the chosen one says so with ● and its weight.
              style={{
                textAlign: 'left', padding: '8px 0', borderRadius: 0, cursor: 'pointer', minHeight: 'var(--bs-target)',
                color: on ? 'var(--bs-fg)' : 'var(--bs-fg2)',
                border: 'none', borderTop: '1px solid var(--bs-border)', background: 'transparent',
              }}
            >
              <span style={{ fontWeight: on ? 600 : 500 }}>{`${on ? '● ' : '○ '}${e.label}`}</span>
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
        The piece starts from <b>Show → ▶ Start the piece</b>, or <b>Hear from here</b> on a
        scene. <b>▶ Play the board</b> on its own just plays what is on the board: no clock, no scenes.
      </p>
      {/* The whole piece (K2): what belongs to no scene, here with the length and the ending. */}
      <span style={{ fontWeight: 700, marginTop: 6 }}>The whole piece</span>
      {p.colours.length > 0 && <ColourTimes colours={p.colours} lengthSec={p.lengthSec} palette={p.palette} onChange={p.onColourEntry} />}
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
      <span style={{ fontWeight: 700, marginTop: 6 }}>Ready check</span>
      <ReadyList items={p.readyItems} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button tone="secondary" onClick={p.onBackup}>⤓ Back up to a file</Button>
        <Button tone="quiet" onClick={p.onRestore}>⤒ Restore from a file</Button>
      </div>
      <p role="status" style={note}>{p.diskLine}</p>
      {p.restoreError && <span role="alert" style={{ fontSize: 14, color: 'var(--bs-danger)' }}>{p.restoreError}</span>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button tone="quiet" onClick={() => p.onStep('scenes')}>‹ Back to the scene</Button>
        <Button tone="primary" onClick={p.onShow}>Go to Show</Button>
      </div>
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
            : ' Change a scene’s length under the board if they should move.'}`}
        </p>
      )}
    </div>
  );
}


