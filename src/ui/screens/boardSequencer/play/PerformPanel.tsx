import { useState } from 'react';
import { Button } from '../ui/Button';
import { Disclosure } from '../ui/Disclosure';
import { LabeledSlider } from '../ui/LabeledSlider';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Switch } from '../ui/Switch';
import type { BandLevel } from '../../../../songs/band/band';
import type { SoundWorldChoice } from '../../../../audio/worlds/soundWorlds';
import {
  describeEnding, endingPasses, endingTooLong, formatClock, parseClock,
  type ClockView, type EndingMode, type EndingStyle, type PerformanceSettings,
} from '../../../../songs/performance/clock';
import { MAX_SCENES, type LoopSlotState, type Scene } from '../../../../songs/performance/launcher';
import { sceneTimeProblem } from '../../../../songs/performance/piece';

export interface PerformLoop {
  slot: number;
  /** The name the player gave it ('' = "Loop n"). */
  name: string;
  notes: number;
  state: LoopSlotState;
}

export interface PerformPanelProps {
  running: boolean;
  lengthSec: number;
  /** How long one pass lasts, in seconds: every timing in a piece is counted in passes. */
  passSec: number;
  clock: ClockView | null;
  scenes: Scene[];
  currentScene: number | null;
  loops: PerformLoop[];
  loopFadePasses: number;
  performance: PerformanceSettings;
  ending: boolean;
  respectPlayer: boolean;
  canSaveBoard: boolean;
  deletedSceneName: string | null;
  diskLine: string;
  restoreError: string | null;
  worldOptions: { value: SoundWorldChoice; label: string }[];
  onToggleLoop(slot: number): void;
  onSaveBoardToLoop(slot: number): void;
  onDrawLoop(slot: number): void;
  onClearLoop(slot: number): void;
  onRenameLoop(slot: number, name: string): void;
  onStopAllLoops(): void;
  onLoopFade(passes: number): void;
  onGoScene(i: number): void;
  onNextScene(): void;
  onSaveSceneFromNow(name: string): void;
  onUpdateSceneFromNow(i: number): void;
  onEditScene(i: number, patch: Partial<Scene>): void;
  onDeleteScene(i: number): void;
  onUndoDelete(): void;
  onMakePlan(): void;
  onRespectPlayer(on: boolean): void;
  onPerformance(patch: Partial<PerformanceSettings>): void;
  onStartClock(): void;
  onEndNow(): void;
  onCancelEnding(): void;
  onCapture(): void;
  onReadyCheck(): void;
  onBackup(): void;
  onRestore(): void;
}

const loopName = (l: PerformLoop): string => (l.name.length > 0 ? l.name : `Loop ${l.slot + 1}`);

function loopStateText(l: PerformLoop, running: boolean, fades: boolean): string {
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

const heading = { margin: 0, fontSize: 15, fontWeight: 700 } as const;
const note = { fontSize: 12, color: 'var(--bs-fg2)' } as const;

/**
 * The Perform tab: the whole piece in one place. A timeline of the scenes across the
 * piece's length, the scenes themselves — each one editable where it is, not deleted
 * and saved again — the loops as pads, and the ending, summed up in one line.
 */
export function PerformPanel(p: PerformPanelProps): JSX.Element {
  const [selected, setSelected] = useState<number | null>(null);
  const [loopMenu, setLoopMenu] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const elapsed = p.clock && p.clock.phase !== 'idle' ? p.clock.elapsedSec : null;
  const savedLoops = p.loops.filter((l) => l.state !== 'empty');
  const endingSummary = `${formatClock(p.lengthSec)} · ${describeEnding(p.performance)} · ${p.performance.ending === 'cue' ? 'I press End' : 'ends at the time'}`;

  return (
    <div role="group" aria-label="Perform" style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button tone="secondary" onClick={p.onReadyCheck}>✓ Ready check</Button>
        <Button
          tone="secondary"
          onClick={p.onMakePlan}
          title="Four scenes — Arrival, Build, Open, Home — placed across the piece, using your saved loops"
        >
          ✦ Make my plan
        </Button>
      </div>

      {/* Live: what to press during the piece. */}
      {p.running && (
        <section aria-labelledby="perform-live" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h3 id="perform-live" style={heading}>During the piece</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {p.clock?.phase === 'idle' && <Button tone="primary" onClick={p.onStartClock}>⏱ Start clock</Button>}
            <Button tone="secondary" onClick={p.onNextScene} disabled={p.scenes.length === 0}>Next scene ▶</Button>
            <Button tone="secondary" onClick={p.onCapture} disabled={!p.canSaveBoard} title={p.canSaveBoard ? undefined : 'Put counters on the board first.'}>⏺ Capture</Button>
            {!p.ending
              ? <Button tone="primary" onClick={p.onEndNow}>{`⏹ End now`}</Button>
              : <Button tone="secondary" onClick={p.onCancelEnding}>Cancel the ending</Button>}
          </div>
        </section>
      )}

      {/* The piece across its length. */}
      <section aria-labelledby="perform-timeline" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3 id="perform-timeline" style={heading}>{`The piece · ${formatClock(p.lengthSec)}`}</h3>
        <div
          style={{ position: 'relative', height: 44, borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-elev)', overflow: 'hidden' }}
          role="list"
          aria-label="Timeline of the scenes"
        >
          {p.scenes.map((s, i) => {
            if (typeof s.at !== 'number' || s.at >= p.lengthSec) return null;
            const nextAt = p.scenes.slice(i + 1).find((x) => typeof x.at === 'number')?.at ?? p.lengthSec;
            const left = (s.at / p.lengthSec) * 100;
            const width = (Math.min(p.lengthSec, nextAt as number) - s.at) / p.lengthSec * 100;
            return (
              <button
                key={s.id}
                type="button"
                role="listitem"
                onClick={() => setSelected(i)}
                aria-label={`${s.name} at ${formatClock(s.at)}${p.currentScene === i ? ', on now' : ''}`}
                style={{
                  position: 'absolute', left: `${left}%`, width: `${Math.max(width, 2)}%`, top: 0, bottom: 0,
                  background: sceneColour(i), color: '#fff', border: p.currentScene === i ? '3px solid var(--bs-fg)' : '1px solid var(--bs-bg)',
                  padding: '2px 6px', textAlign: 'left', fontSize: 12, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', cursor: 'pointer',
                }}
              >
                {`${s.name} ${formatClock(s.at)}`}
              </button>
            );
          })}
          {elapsed !== null && (
            <span
              aria-hidden="true"
              style={{ position: 'absolute', top: 0, bottom: 0, width: 3, left: `${Math.min(100, (elapsed / p.lengthSec) * 100)}%`, background: 'var(--bs-fg)' }}
            />
          )}
          {p.scenes.every((s) => typeof s.at !== 'number') && (
            <span style={{ ...note, position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
              No scenes on the clock yet. Make my plan, or give a scene a time.
            </span>
          )}
        </div>
        <span style={{ ...note, color: p.passSec < 4 ? 'var(--bs-warn)' : note.color }}>
          {`1 pass = ${p.passSec.toFixed(1)} s. Scenes, loops and the ending land on a pass.`}
          {p.passSec < 4 ? ' A very short loop: more steps or a slower tempo give the piece more room.' : ''}
        </span>
      </section>

      {/* The scenes, each editable in place. */}
      <section aria-labelledby="perform-scenes" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3 id="perform-scenes" style={heading}>Scenes</h3>
        {p.scenes.length === 0 && (
          <span style={note}>A scene is a set of loops and a sound. Press Make my plan for four ready-made scenes, or set things up and save one from now.</span>
        )}
        {p.scenes.map((s, i) => (
          <SceneRow
            key={s.id}
            index={i}
            scene={s}
            open={selected === i}
            current={p.currentScene === i}
            lengthSec={p.lengthSec}
            otherTimes={p.scenes.filter((_, k) => k !== i).map((x) => x.at)}
            loops={savedLoops}
            worldOptions={p.worldOptions}
            onToggleOpen={() => setSelected(selected === i ? null : i)}
            onGo={() => p.onGoScene(i)}
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
            id="perform-new-scene" type="text" value={newName} placeholder={`Scene ${p.scenes.length + 1}`}
            aria-label="Name for a new scene" onChange={(e) => setNewName(e.target.value)}
            style={{ width: 140, minHeight: 'var(--bs-target)' }}
          />
          <Button
            tone="secondary"
            onClick={() => { p.onSaveSceneFromNow(newName); setNewName(''); }}
            disabled={p.scenes.length >= MAX_SCENES}
            title={p.scenes.length >= MAX_SCENES ? 'Twelve scenes is the most.' : 'The loops playing now and the sound as it is now'}
          >
            + Save scene from now
          </Button>
        </div>
        <Switch
          label="Scenes leave the player's strips alone"
          checked={p.respectPlayer}
          onChange={p.onRespectPlayer}
          hint="If the player moved Speed, Fill or Evolve on the iPad since the last scene, the next scene keeps their setting."
        />
      </section>

      {/* The loops, as pads. */}
      <section aria-labelledby="perform-loops" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3 id="perform-loops" style={heading}>Loops</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6 }}>
          {p.loops.map((l) => {
            const on = l.state === 'playing' || l.state === 'starting';
            return (
              <div key={l.slot} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={l.state === 'empty'}
                  onClick={() => p.onToggleLoop(l.slot)}
                  aria-label={`${loopName(l)}: ${loopStateText(l, p.running, p.loopFadePasses > 0)}`}
                  style={{
                    minHeight: 64, borderRadius: 'var(--bs-radius-md)', textAlign: 'left', padding: '6px 8px',
                    border: `2px ${l.state === 'starting' || l.state === 'stopping' ? 'dashed' : 'solid'} ${on ? 'var(--bs-ok)' : 'var(--bs-border-control)'}`,
                    background: on ? 'var(--bs-accent-muted)' : 'var(--bs-raised)', color: 'inherit',
                    opacity: l.state === 'empty' ? 0.6 : 1, cursor: l.state === 'empty' ? 'default' : 'pointer',
                  }}
                >
                  <span style={{ display: 'block', fontWeight: 700 }}>{loopName(l)}</span>
                  <span style={{ display: 'block', fontSize: 12, color: on ? 'var(--bs-ok)' : 'var(--bs-fg2)' }}>{loopStateText(l, p.running, p.loopFadePasses > 0)}</span>
                </button>
                <button
                  type="button"
                  aria-expanded={loopMenu === l.slot}
                  aria-label={`More for ${loopName(l)}: name, save the board here, draw, clear`}
                  onClick={() => setLoopMenu(loopMenu === l.slot ? null : l.slot)}
                  style={{ minHeight: 32, border: 'none', background: 'transparent', color: 'var(--bs-fg2)', cursor: 'pointer' }}
                >
                  ⋯ more
                </button>
              </div>
            );
          })}
        </div>
        {loopMenu !== null && (() => {
          const l = p.loops[loopMenu];
          return (
            <div role="group" aria-label={`${loopName(l)} — more`} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: 8, borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-elev)' }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                Name
                <input
                  type="text" value={l.name} placeholder={`Loop ${l.slot + 1}`} aria-label={`Name of loop ${l.slot + 1}`}
                  onChange={(e) => p.onRenameLoop(l.slot, e.target.value)} style={{ width: 120, minHeight: 'var(--bs-target)' }}
                />
              </label>
              <Button tone="secondary" onClick={() => p.onSaveBoardToLoop(l.slot)} disabled={!p.canSaveBoard} title={p.canSaveBoard ? undefined : 'Put counters on the board first.'}>
                Save board here
              </Button>
              <Button tone="secondary" onClick={() => p.onDrawLoop(l.slot)}>Draw</Button>
              <Button tone="quiet" onClick={() => { p.onClearLoop(l.slot); }} disabled={l.state === 'empty'}>Clear</Button>
              <Button tone="quiet" onClick={() => setLoopMenu(null)}>Done</Button>
            </div>
          );
        })()}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button tone="secondary" onClick={p.onStopAllLoops} disabled={!p.loops.some((l) => l.state === 'playing' || l.state === 'starting')}>■ Stop all loops</Button>
        </div>
        <SegmentedControl<number>
          label="Loops fade in and out over"
          value={p.loopFadePasses}
          onChange={p.onLoopFade}
          options={[{ value: 0, label: 'At once' }, { value: 0.5, label: 'Half a pass' }, { value: 1, label: '1 pass' }, { value: 2, label: '2 passes' }]}
        />
      </section>

      {/* The ending, in one line; the settings behind it. */}
      <section aria-labelledby="perform-ending" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3 id="perform-ending" style={heading}>Length and ending</h3>
        <span style={{ fontWeight: 600 }}>{endingSummary}</span>
        {endingTooLong(p.performance, p.passSec) && (
          <span role="alert" style={{ fontSize: 12, color: 'var(--bs-warn)' }}>
            The ending takes as long as half the piece at this tempo. Choose fewer passes or a longer length.
          </span>
        )}
        <Disclosure summary="Change the length, when the clock starts, and the ending">
          <LengthField lengthSec={p.lengthSec} onChange={(lengthSec) => p.onPerformance({ lengthSec })} />
          <SegmentedControl<'play' | 'manual'>
            label="The clock starts"
            value={p.performance.startOn}
            onChange={(startOn) => p.onPerformance({ startOn })}
            options={[{ value: 'manual', label: 'When I press Start clock' }, { value: 'play', label: 'With Play' }]}
          />
          <SegmentedControl<EndingStyle>
            label="How it ends"
            value={p.performance.style}
            onChange={(style) => p.onPerformance({ style })}
            options={[
              { value: 'fade', label: 'Fade out' },
              { value: 'chord', label: 'Final chord' },
              { value: 'slow', label: 'Slow down' },
              { value: 'thin', label: 'Thin out' },
              { value: 'stop', label: 'Stop' },
            ]}
          />
          <span style={note}>
            {p.performance.style === 'fade' ? 'Everything fades together.'
              : p.performance.style === 'stop' ? 'A tidy stop on the one, at the end of the pass.'
                : p.performance.style === 'slow' ? 'The tempo eases down to a little over half, then a stop on the one.'
                  : p.performance.style === 'thin' ? 'The band and the fill leave first, so the player’s own notes end the piece.'
                    : 'The texture thins, then a held chord in the key and a crash ring out.'}
          </span>
          {p.performance.style !== 'stop' && (
            <SegmentedControl<number>
              label="The ending takes"
              value={p.performance.fadePasses}
              onChange={(fadePasses) => p.onPerformance({ fadePasses })}
              options={[{ value: 1, label: '1 pass' }, { value: 2, label: '2 passes' }, { value: 4, label: '4 passes' }]}
            />
          )}
          <SegmentedControl<EndingMode>
            label="When it ends"
            value={p.performance.ending}
            onChange={(ending) => p.onPerformance({ ending })}
            options={[
              { value: 'cue', label: 'When I press End' },
              { value: 'auto', label: `At the time (begins ${endingPasses(p.performance)} ${endingPasses(p.performance) === 1 ? 'pass' : 'passes'} early)` },
            ]}
          />
        </Disclosure>
      </section>

      <section aria-labelledby="perform-keep" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3 id="perform-keep" style={heading}>Keeping it safe</h3>
        <span role="status" style={note}>{p.diskLine}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button tone="secondary" onClick={p.onBackup}>⤓ Back up to a file</Button>
          <Button tone="secondary" onClick={p.onRestore}>⤒ Restore from a file</Button>
        </div>
        {p.restoreError && <span role="alert" style={{ fontSize: 12, color: 'var(--bs-danger)' }}>{p.restoreError}</span>}
      </section>
    </div>
  );
}

/** The piece's length as m:ss, checked as it is typed. */
function LengthField({ lengthSec, onChange }: { lengthSec: number; onChange(sec: number): void }): JSX.Element {
  const [text, setText] = useState(formatClock(lengthSec));
  const parsed = parseClock(text);
  const problem = parsed === null ? 'Type the length as minutes:seconds, like 7:00.' : parsed < 30 ? 'A piece is at least 0:30.' : null;
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
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
  loops: PerformLoop[];
  worldOptions: { value: SoundWorldChoice; label: string }[];
  onToggleOpen(): void;
  onGo(): void;
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
  const loopNames = s.loops.map((slot) => r.loops.find((l) => l.slot === slot)).filter(Boolean).map((l) => loopName(l as PerformLoop));
  const world = r.worldOptions.find((w) => w.value === s.settings.soundWorld)?.label ?? s.settings.soundWorld;
  const summary = `${loopNames.length > 0 ? loopNames.join(', ') : 'no loops'} · ${world} · band ${s.settings.band} · fill ${Math.round(s.settings.fillAmount * 100)}% · Evolve ${Math.round(s.settings.evolveAmount * 100)}% · ${s.settings.bpm} BPM`;
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
        <Button tone={r.current ? 'primary' : 'secondary'} aria-pressed={r.current} onClick={r.onGo}>Go</Button>
      </div>
      {r.open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 4 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              Name
              <input
                type="text" defaultValue={s.name} aria-label="Scene name"
                onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== s.name) r.onEdit({ name }); }}
                style={{ width: 140, minHeight: 'var(--bs-target)' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
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
          <SegmentedControl<BandLevel>
            label="Band" value={s.settings.band} onChange={(band) => set({ band })}
            options={[{ value: 'off', label: 'Off' }, { value: 'gentle', label: 'Gentle' }, { value: 'full', label: 'Full' }]}
          />
          <LabeledSlider label="Fill" min={0} max={100} value={Math.round(s.settings.fillAmount * 100)} display={`${Math.round(s.settings.fillAmount * 100)}%`} onChange={(v) => set({ fillAmount: v / 100 })} />
          <LabeledSlider label="Evolve" min={0} max={100} value={Math.round(s.settings.evolveAmount * 100)} display={`${Math.round(s.settings.evolveAmount * 100)}%`} onChange={(v) => set({ evolveAmount: v / 100 })} />
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
