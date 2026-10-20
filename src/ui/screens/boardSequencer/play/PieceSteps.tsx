import { useState } from 'react';
import { Button } from '../ui/Button';
import { LabeledSlider } from '../ui/LabeledSlider';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Switch } from '../ui/Switch';
import type { BandLevel } from '../../../../songs/band/band';
import type { SoundWorldChoice } from '../../../../audio/worlds/soundWorlds';
import {
  describeEnding, endingTooLong, formatClock, parseClock,
  type ClockView, type EndingMode, type EndingStyle, type PerformanceSettings,
} from '../../../../songs/performance/clock';
import { MAX_SCENES, type LoopSlotState, type Scene } from '../../../../songs/performance/launcher';
import { sceneTimeProblem } from '../../../../songs/performance/piece';
import { ReadyList, type ReadyItem } from './ReadyCheck';

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
  deletedSceneName: string | null;
  diskLine: string;
  restoreError: string | null;
  worldOptions: { value: SoundWorldChoice; label: string }[];
  readyItems: ReadyItem[];
  /** The board's size and colours, for the loop pictures. */
  rows: number;
  cols: number;
  swatchFor(colour: string): string;
  onToggleLoop(slot: number): void;
  onSaveBoardToLoop(slot: number): void;
  onDrawLoop(slot: number): void;
  onClearLoop(slot: number): void;
  onRenameLoop(slot: number, name: string): void;
  onStopAllLoops(): void;
  onLoopFade(passes: number): void;
  onGoScene(i: number): void;
  onRehearseFrom(sec: number): void;
  onSaveSceneFromNow(name: string): void;
  onUpdateSceneFromNow(i: number): void;
  onEditScene(i: number, patch: Partial<Scene>): void;
  onDeleteScene(i: number): void;
  onUndoDelete(): void;
  onMakePlan(): void;
  onRespectPlayer(on: boolean): void;
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
const BAND_WORDS: Record<BandLevel, string> = { off: 'no band', gentle: 'quiet band', full: 'full band' };
function nearestStep(steps: { label: string; value: number }[], v: number): number {
  let best = 0;
  for (let i = 1; i < steps.length; i++) if (Math.abs(steps[i].value - v) < Math.abs(steps[best].value - v)) best = i;
  return best;
}

function loopStateText(l: PieceLoop, running: boolean, fades: boolean): string {
  if (l.state === 'empty') return 'empty';
  if (!running && (l.state === 'playing' || l.state === 'starting')) return 'ready · starts with Play';
  if (l.state === 'playing') return '▶ playing';
  if (l.state === 'starting') return fades ? 'fading in…' : 'starting…';
  if (l.state === 'stopping' && running) return fades ? 'fading out…' : 'stopping…';
  return `${l.notes} ${l.notes === 1 ? 'note' : 'notes'}`;
}

/** One colour per scene on the timeline, so a block and its row in the list match. */
const SCENE_HUES = [210, 32, 318, 145, 265, 0, 190, 55, 100, 285, 15, 230];
const sceneColour = (i: number): string => `hsl(${SCENE_HUES[i % SCENE_HUES.length]} 60% 48%)`;

const heading = { margin: 0, fontSize: 18, fontWeight: 800 } as const;
const note = { fontSize: 13, color: 'var(--bs-fg2)', margin: 0 } as const;
const card = { padding: 12, borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-elev)', display: 'flex', flexDirection: 'column', gap: 6 } as const;

const ENDINGS: { value: EndingStyle; label: string; what: string }[] = [
  { value: 'chord', label: 'Final chord', what: 'The texture thins, then a held chord and a crash ring out. A clear end the audience hears.' },
  { value: 'fade', label: 'Fade out', what: 'Everything fades together.' },
  { value: 'slow', label: 'Slow down', what: 'The tempo eases to about half, then stops on the one.' },
  { value: 'thin', label: 'Thin out', what: 'The band and the fill leave first, so the player’s own notes end the piece.' },
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
              <span style={{ display: 'block', fontSize: 12, color: 'var(--bs-fg2)' }}>{s.status}</span>
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
  const [more, setMore] = useState(false);
  return (
    <section aria-labelledby="piece-loops" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 id="piece-loops" style={heading}>1 · Loops</h3>
      <div style={card}>
        <p style={{ margin: 0 }}>A loop is a board you save, which then plays by itself under the player.</p>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 2 }}>
          <li>Put counters on the board (press ▶ Play to listen).</li>
          <li>Press <b>Save the board here</b> on an empty loop.</li>
          <li>Give it a name, clear the board, and make the next one.</li>
        </ol>
        <p style={note}>Optional: without loops, the board plays as usual.</p>
      </div>
      {!p.canSaveBoard && <p role="status" style={{ ...note, color: 'var(--bs-warn)' }}>The board is empty: put counters on it to save a loop.</p>}
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
                type="text" value={l.name} placeholder={empty ? 'name (after saving)' : `Loop ${l.slot + 1}`}
                aria-label={`Name of loop ${l.slot + 1}`}
                onChange={(e) => p.onRenameLoop(l.slot, e.target.value)}
                style={{ width: 120, minHeight: 'var(--bs-target)' }}
              />
              <span style={{ fontSize: 12, color: on ? 'var(--bs-ok)' : 'var(--bs-fg2)', minWidth: 60 }}>{loopStateText(l, p.running, p.loopFadePasses > 0)}</span>
              <span style={{ flex: 1 }} />
              {empty ? (
                <Button
                  tone="primary"
                  onClick={() => p.onSaveBoardToLoop(l.slot)}
                  disabled={!p.canSaveBoard}
                  title={p.canSaveBoard ? undefined : 'Put counters on the board first.'}
                >
                  Save the board here
                </Button>
              ) : (
                <>
                  <Button tone={on ? 'primary' : 'secondary'} aria-pressed={on} onClick={() => p.onToggleLoop(l.slot)}>{on ? '■ Stop' : '▶ Play'}</Button>
                  <Button
                    tone="secondary"
                    disabled={!p.canSaveBoard}
                    title={p.canSaveBoard ? 'Overwrite this loop with the counters on the board now' : 'Put counters on the board first.'}
                    onClick={() => {
                      if (replaceArmed !== l.slot) { setReplaceArmed(l.slot); return; }
                      setReplaceArmed(null);
                      p.onSaveBoardToLoop(l.slot);
                    }}
                    onBlur={() => setReplaceArmed((r) => (r === l.slot ? null : r))}
                  >
                    {replaceArmed === l.slot ? 'Press again to overwrite' : 'Overwrite with board'}
                  </Button>
                </>
              )}
              <Button tone="quiet" onClick={() => p.onDrawLoop(l.slot)} aria-label={`Edit the notes of loop ${l.slot + 1}`} title="See and change this loop's notes">✎ Edit notes</Button>
              {!empty && <Button tone="quiet" onClick={() => p.onClearLoop(l.slot)} aria-label={`Clear loop ${l.slot + 1}`} title="Clear this loop">✕</Button>}
            </li>
          );
        })}
      </ul>
      <button
        type="button" aria-expanded={more} onClick={() => setMore((m) => !m)}
        style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', color: 'var(--bs-fg2)', minHeight: 'var(--bs-target)', cursor: 'pointer' }}
      >
        {more ? '▾' : '▸'} More: fades, stop all
      </button>
      {more && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SegmentedControl<number>
            label="Loops fade in and out over"
            value={p.loopFadePasses}
            onChange={p.onLoopFade}
            options={[{ value: 0, label: 'At once' }, { value: 0.5, label: 'Half a pass' }, { value: 1, label: '1 pass' }, { value: 2, label: '2 passes' }]}
          />
          <div><Button tone="secondary" onClick={p.onStopAllLoops} disabled={!p.loops.some((l) => l.state === 'playing' || l.state === 'starting')}>■ Stop all loops</Button></div>
        </div>
      )}
      <StepFooter next={{ label: 'Next: Scenes', onClick: () => p.onStep('scenes'), primary: true }} />
    </section>
  );
}

/** Step 2: the scenes — the loops and the sound, changing at set times. */
function ScenesStep(p: PieceStepsProps): JSX.Element {
  const [selected, setSelected] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const elapsed = p.clock && p.clock.phase !== 'idle' ? p.clock.elapsedSec : null;
  const saved = p.loops.filter((l) => l.state !== 'empty');
  return (
    <section aria-labelledby="piece-scenes" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 id="piece-scenes" style={heading}>2 · Scenes</h3>
      <div style={card}>
        <p style={{ margin: 0 }}>A scene says which loops play and how it sounds. The clock brings each scene in at its time while the player plays on top.</p>
        <p style={note}>Optional: without scenes, the piece doesn&rsquo;t change by itself.</p>
      </div>
      {p.scenes.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          <Button tone="primary" onClick={p.onMakePlan}>{`✦ Make my plan: 4 scenes over ${formatClock(p.lengthSec)}`}</Button>
          <p style={note}>Arrival, Build, Open and Home, using {saved.length > 0 ? 'your saved loops' : 'no loops yet (save some in step 1 first, or add them to the scenes later)'}. Every scene can be changed afterwards.</p>
        </div>
      ) : (
        <>
          <div role="list" aria-label="Timeline of the scenes" style={{ position: 'relative', height: 44, borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-elev)', overflow: 'hidden' }}>
            {p.scenes.map((s, i) => {
              if (typeof s.at !== 'number' || s.at >= p.lengthSec) return null;
              const nextAt = p.scenes.slice(i + 1).find((x) => typeof x.at === 'number')?.at ?? p.lengthSec;
              return (
                <button
                  key={s.id} type="button" role="listitem" onClick={() => setSelected(i)}
                  aria-label={`${s.name} at ${formatClock(s.at)}${p.currentScene === i ? ', on now' : ''}`}
                  style={{
                    position: 'absolute', left: `${(s.at / p.lengthSec) * 100}%`, width: `${Math.max(2, ((Math.min(p.lengthSec, nextAt as number) - s.at) / p.lengthSec) * 100)}%`,
                    top: 0, bottom: 0, background: sceneColour(i), color: '#fff', border: p.currentScene === i ? '3px solid var(--bs-fg)' : '1px solid var(--bs-bg)',
                    padding: '2px 6px', textAlign: 'left', fontSize: 12, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', cursor: 'pointer',
                  }}
                >
                  {`${s.name} ${formatClock(s.at)}`}
                </button>
              );
            })}
            {elapsed !== null && <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, width: 3, left: `${Math.min(100, (elapsed / p.lengthSec) * 100)}%`, background: 'var(--bs-fg)' }} />}
          </div>
          <p style={note}>{`Tap a scene to change it. ▶ Rehearse from here plays the piece from that moment; Jump here now switches to it straight away. 1 pass = ${p.passSec.toFixed(1)} s.`}</p>
          {p.scenes.map((s, i) => (
            <SceneRow
              key={s.id} index={i} scene={s} open={selected === i} current={p.currentScene === i}
              lengthSec={p.lengthSec} otherTimes={p.scenes.filter((_, k) => k !== i).map((x) => x.at)}
              loops={saved} worldOptions={p.worldOptions}
              onToggleOpen={() => setSelected(selected === i ? null : i)}
              onGo={() => p.onGoScene(i)}
              onRehearse={!p.running && typeof s.at === 'number' ? () => p.onRehearseFrom(s.at as number) : undefined}
              onUpdateFromNow={() => p.onUpdateSceneFromNow(i)}
              onEdit={(patch) => p.onEditScene(i, patch)}
              onDelete={() => { setSelected(null); p.onDeleteScene(i); }}
            />
          ))}
          {p.deletedSceneName && (
            <div role="status" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <span>{`Deleted “${p.deletedSceneName}”.`}</span>
              <Button tone="secondary" onClick={p.onUndoDelete}>Undo</Button>
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
          <Switch
            label="Scenes leave the player's strips alone"
            checked={p.respectPlayer}
            onChange={p.onRespectPlayer}
            hint="If the player moved Speed, Fill or Evolve on the iPad since the last scene, the next scene keeps their setting."
          />
        </>
      )}
      <StepFooter back={{ label: 'Loops', onClick: () => p.onStep('loops') }} next={{ label: 'Next: Ending & check', onClick: () => p.onStep('ending'), primary: true }} />
    </section>
  );
}

/** Step 3: how long, how it ends, and whether everything is ready. */
function EndingStep(p: PieceStepsProps): JSX.Element {
  const perf = p.performance;
  return (
    <section aria-labelledby="piece-ending" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 id="piece-ending" style={heading}>3 · Ending &amp; check</h3>
      <div style={card}>
        <p style={{ margin: 0, fontWeight: 700 }}>{`${formatClock(p.lengthSec)} · ${describeEnding(perf)} · ${perf.ending === 'cue' ? 'you press End' : 'ends at the time'}`}</p>
        <p style={note}>The clock counts down from the length, with cues at 1 minute, 30 and 10 seconds. The piece never runs over: if End hasn&rsquo;t been pressed, the ending starts by itself in time to finish at {formatClock(p.lengthSec)}.</p>
      </div>
      <LengthField lengthSec={p.lengthSec} onChange={(lengthSec) => p.onPerformance({ lengthSec })} />
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
              <span style={{ display: 'block', fontSize: 12, color: 'var(--bs-fg2)' }}>{e.what}</span>
            </button>
          );
        })}
      </div>
      {perf.style !== 'stop' && (
        <SegmentedControl<number>
          label="The ending takes"
          value={perf.fadePasses}
          onChange={(fadePasses) => p.onPerformance({ fadePasses })}
          options={[{ value: 1, label: '1 pass' }, { value: 2, label: '2 passes' }, { value: 4, label: '4 passes' }]}
        />
      )}
      <SegmentedControl<EndingMode>
        label="When it ends"
        value={perf.ending}
        onChange={(ending) => p.onPerformance({ ending })}
        options={[
          { value: 'cue', label: `When I press End (by ${formatClock(p.lengthSec)} at the latest)` },
          { value: 'auto', label: `By itself at ${formatClock(p.lengthSec)}` },
        ]}
      />
      {endingTooLong(perf, p.passSec) && (
        <span role="alert" style={{ fontSize: 12, color: 'var(--bs-warn)' }}>The ending takes as long as half the piece at this tempo. Choose fewer passes or a longer length.</span>
      )}
      <SegmentedControl<'play' | 'manual'>
        label="The clock starts"
        value={perf.startOn}
        onChange={(startOn) => p.onPerformance({ startOn })}
        options={[{ value: 'play', label: 'With ▶ Play' }, { value: 'manual', label: 'When I press Start clock' }]}
      />
      <span style={{ fontWeight: 700, marginTop: 6 }}>Ready check</span>
      <ReadyList items={p.readyItems} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button tone="secondary" onClick={p.onBackup}>⤓ Back up to a file</Button>
        <Button tone="quiet" onClick={p.onRestore}>⤒ Restore from a file</Button>
      </div>
      <p role="status" style={note}>{p.diskLine}</p>
      {p.restoreError && <span role="alert" style={{ fontSize: 12, color: 'var(--bs-danger)' }}>{p.restoreError}</span>}
      <StepFooter back={{ label: 'Scenes', onClick: () => p.onStep('scenes') }} next={{ label: '▶ Go to Show', onClick: p.onShow, primary: true }} />
    </section>
  );
}

/** The piece's length as m:ss, checked as it is typed. */
function LengthField({ lengthSec, onChange }: { lengthSec: number; onChange(sec: number): void }): JSX.Element {
  const [text, setText] = useState(formatClock(lengthSec));
  const parsed = parseClock(text);
  const problem = parsed === null ? 'Type the length as minutes:seconds, like 7:00.' : parsed < 30 ? 'A piece is at least 0:30.' : null;
  return (
    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, fontSize: 13 }}>
      Length of the piece
      <input
        type="text" value={text} aria-invalid={problem !== null} aria-describedby="perform-length-problem"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (parsed !== null && parsed >= 30) onChange(parsed); }}
        style={{ width: 90, minHeight: 'var(--bs-target)' }}
      />
      <span id="perform-length-problem" style={{ fontSize: 12, color: problem ? 'var(--bs-warn)' : 'transparent' }}>{problem ?? ' '}</span>
    </label>
  );
}

interface SceneRowProps {
  index: number;
  scene: Scene;
  open: boolean;
  current: boolean;
  lengthSec: number;
  otherTimes: (number | null | undefined)[];
  loops: PieceLoop[];
  worldOptions: { value: SoundWorldChoice; label: string }[];
  onToggleOpen(): void;
  onGo(): void;
  /** Play from this scene's time (only while stopped). */
  onRehearse?(): void;
  onUpdateFromNow(): void;
  onEdit(patch: Partial<Scene>): void;
  onDelete(): void;
}

/** One scene: a line saying what it is, opening into everything it sets, editable there. */
function SceneRow(r: SceneRowProps): JSX.Element {
  const s = r.scene;
  const [timeText, setTimeText] = useState(typeof s.at === 'number' ? formatClock(s.at) : '');
  const parsed = timeText.trim() === '' ? null : parseClock(timeText);
  const typo = timeText.trim() !== '' && parsed === null;
  const problem = typo ? 'Type a time as minutes:seconds, like 1:30 — or leave it empty for by hand only.' : sceneTimeProblem(parsed, r.lengthSec, r.otherTimes);
  const loopNames = s.loops.map((slot) => r.loops.find((l) => l.slot === slot)).filter(Boolean).map((l) => loopName(l as PieceLoop));
  const world = r.worldOptions.find((w) => w.value === s.settings.soundWorld)?.label ?? s.settings.soundWorld;
  const fill = FILL_STEPS[nearestStep(FILL_STEPS, s.settings.fillAmount)].label.toLowerCase();
  const evolve = EVOLVE_STEPS[nearestStep(EVOLVE_STEPS, s.settings.evolveAmount)].label.toLowerCase();
  const summary = [
    loopNames.length > 0 ? loopNames.join(', ') : 'no loops',
    world,
    BAND_WORDS[s.settings.band],
    fill === 'off' ? 'no extra notes' : `${fill} extra notes`,
    evolve === 'off' ? 'sounds stay' : `sounds change ${evolve === 'more' ? 'a lot' : 'slowly'}`,
    `${s.settings.bpm} BPM`,
  ].join(' · ');
  const set = (patch: Partial<Scene['settings']>): void => r.onEdit({ settings: { ...s.settings, ...patch } });

  return (
    <div
      style={{
        borderRadius: 'var(--bs-radius-md)', padding: 6, display: 'flex', flexDirection: 'column', gap: 6,
        borderTop: `2px solid ${r.current ? 'var(--bs-accent)' : 'var(--bs-border)'}`,
        borderRight: `2px solid ${r.current ? 'var(--bs-accent)' : 'var(--bs-border)'}`,
        borderBottom: `2px solid ${r.current ? 'var(--bs-accent)' : 'var(--bs-border)'}`,
        borderLeft: `8px solid ${sceneColour(r.index)}`,
      }}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button" aria-expanded={r.open} onClick={r.onToggleOpen}
          style={{ flex: '1 1 200px', minHeight: 'var(--bs-target)', textAlign: 'left', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
        >
          <span style={{ fontWeight: 700 }}>{`${typeof s.at === 'number' ? formatClock(s.at) : 'by hand'} · ${s.name}${r.current ? ' · on now' : ''}`}</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--bs-fg2)' }}>{summary}</span>
        </button>
        {r.onRehearse && (
          <Button tone="secondary" onClick={r.onRehearse} aria-label={`Rehearse from ${s.name}: play the piece from ${typeof s.at === 'number' ? formatClock(s.at) : ''}`}>
            ▶ Rehearse from here
          </Button>
        )}
        <Button tone={r.current ? 'primary' : 'secondary'} aria-pressed={r.current} onClick={r.onGo} aria-label={`Jump to ${s.name} now`}>{r.current ? 'On now' : 'Jump here now'}</Button>
      </div>
      {r.open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 4 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, fontSize: 13 }}>
              Name
              <input
                type="text" defaultValue={s.name} aria-label="Scene name"
                onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== s.name) r.onEdit({ name }); }}
                style={{ width: 140, minHeight: 'var(--bs-target)' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, fontSize: 13 }}>
              Comes in at
              <input
                type="text" value={timeText} placeholder="m:ss" aria-invalid={problem !== null} aria-label={`When ${s.name} comes in (minutes:seconds; empty = by hand only)`}
                onChange={(e) => setTimeText(e.target.value)}
                onBlur={() => { if (!typo) r.onEdit({ at: parsed }); }}
                style={{ width: 80, minHeight: 'var(--bs-target)' }}
              />
            </label>
          </div>
          {problem && <span role="alert" style={{ fontSize: 12, color: 'var(--bs-warn)' }}>{problem}</span>}
          <div role="group" aria-label="Loops in this scene" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {r.loops.length === 0 && <span style={{ fontSize: 12, color: 'var(--bs-fg2)' }}>No loops saved yet.</span>}
            {r.loops.map((l) => {
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
          <SegmentedControl<SoundWorldChoice> label="Sound world" value={s.settings.soundWorld} onChange={(soundWorld) => set({ soundWorld })} options={r.worldOptions} />
          <span style={{ fontSize: 12, color: 'var(--bs-fg2)' }}>Band</span>
          <SegmentedControl<BandLevel>
            label="Band" value={s.settings.band} onChange={(band) => set({ band })}
            options={[{ value: 'off', label: 'Off' }, { value: 'gentle', label: 'Quiet' }, { value: 'full', label: 'Full' }]}
          />
          <span style={{ fontSize: 12, color: 'var(--bs-fg2)' }}>Extra notes</span>
          <SegmentedControl<number>
            label="Extra notes" value={nearestStep(FILL_STEPS, s.settings.fillAmount)}
            onChange={(k) => set({ fillAmount: FILL_STEPS[k].value })}
            options={FILL_STEPS.map((x, k) => ({ value: k, label: x.label }))}
          />
          <span style={{ fontSize: 12, color: 'var(--bs-fg2)' }}>Sounds change</span>
          <SegmentedControl<number>
            label="Sounds change" value={nearestStep(EVOLVE_STEPS, s.settings.evolveAmount)}
            onChange={(k) => set({ evolveAmount: EVOLVE_STEPS[k].value })}
            options={EVOLVE_STEPS.map((x, k) => ({ value: k, label: x.label }))}
          />
          <LabeledSlider label="Tempo" min={40} max={160} value={s.settings.bpm} display={`${s.settings.bpm} BPM`} onChange={(v) => set({ bpm: Math.round(v) })} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Button tone="secondary" onClick={r.onUpdateFromNow} title="Replace this scene's loops and sound with what is playing now">Update from now</Button>
            <Button tone="quiet" onClick={r.onDelete}>Delete scene</Button>
          </div>
        </div>
      )}
    </div>
  );
}
