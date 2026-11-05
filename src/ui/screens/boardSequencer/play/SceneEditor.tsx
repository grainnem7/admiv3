import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { SegmentedControl } from '../ui/SegmentedControl';
import { LabeledSlider } from '../ui/LabeledSlider';
import { focusWhenGone, PLAY_STOP_ID } from '../ui/focusNext';
import { useSessionFold } from '../ui/useSessionFold';
import { LoopThumb, type PieceLoop } from './PieceSteps';
import { loopName } from './LoopRail';
import { ChordChoice, chordWords } from './ChordChoice';
import { BandJobsChoice } from './BandJobsChoice';
import { BAND_WORDS, playerWords } from '../pieceCheck';
import { ENERGY_NAMES, WORDS } from '../words';
import { formatClock, parseClock, plainNumberProblem } from '../../../../songs/performance/clock';
import type { Scene, WayIn } from '../../../../songs/performance/launcher';
import type { ScenePatch } from '../../../../songs/performance/piece';
import { ENERGY_LEVELS, ENERGY_WORDS, type SceneEnergy } from '../../../../songs/performance/energy';
import { bandJobsWords, LEAD_INS, LEAD_IN_WORDS, type LeadIn } from '../../../../songs/band/bandJobs';
import { GLIDE_DEFAULT_SEC, GLIDE_MAX_SEC, GLIDE_MIN_SEC } from '../../../../songs/performance/speedGlide';
import type { BandLevel } from '../../../../songs/band/band';
import type { SoundWorldChoice } from '../../../../audio/worlds/soundWorlds';

export interface SceneEditorProps {
  /** The scene's number in the piece, from 1. */
  number: number;
  scene: Scene;
  /** The scene on now. */
  current: boolean;
  running: boolean;
  lengthSec: number;
  passSec: number;
  /** When the next scene comes in; null when this is the last (it runs to the end). */
  nextAt: number | null;
  loops: PieceLoop[];
  worldOptions: { value: SoundWorldChoice; label: string }[];
  playerName: string | null;
  loopFadePasses: number;
  /** Why nothing can be changed now (the piece plays from Show), or null. Jump here now stays. */
  locked: string | null;
  onEdit(patch: ScenePatch): void;
  /** The scene's length typed, in seconds (the screen moves the later scenes). */
  onLength(sec: number): void;
  /** Play the piece from this scene (only while stopped). */
  onHear?(): void;
  /** Switch to this scene now (only while the board plays). */
  onGo?(): void;
  /** Copy what is playing into this scene (only while the board plays). */
  onUpdateFromNow?(): void;
  onNewIdeas(): void;
  onDuplicate(): void;
  /** Delete it; `pressed` is the Delete button, for where focus goes next. */
  onDelete(pressed: HTMLElement): void;
  onCheck(): void;
}

/** Scene amounts as named steps: the same words as the Sound tab's helpers. */
const FILL_STEPS = [{ label: 'Off', value: 0 }, { label: 'A few', value: 0.25 }, { label: 'Some', value: 0.5 }, { label: 'Lots', value: 0.8 }];
const EVOLVE_STEPS = [{ label: 'Off', value: 0 }, { label: 'Slowly', value: 0.35 }, { label: 'More', value: 0.7 }];
function nearestStep(steps: { label: string; value: number }[], v: number): number {
  let best = 0;
  steps.forEach((s, i) => { if (Math.abs(s.value - v) < Math.abs(steps[best].value - v)) best = i; });
  return best;
}

const label = { fontSize: 14, color: 'var(--bs-fg2)' } as const;

/** The ways into a scene (K3), each with its words. A loop in both scenes carries on untouched. */
type WayKey = 'fade-1' | 'fade-2' | 'overlap-1' | 'overlap-2' | 'cut';
const WAYS: Record<WayKey, { label: string; what: string; wayIn: WayIn }> = {
  'fade-1': { label: 'Fade · 1 pass', what: 'The loops leaving fade out as the ones arriving fade in, over one pass.', wayIn: { kind: 'fade', passes: 1 } },
  'fade-2': { label: 'Fade · 2 passes', what: 'The loops leaving fade out as the ones arriving fade in, over two passes.', wayIn: { kind: 'fade', passes: 2 } },
  'overlap-1': { label: 'Overlap · 1 pass', what: 'The loops arriving start at full; the ones leaving carry on for a pass, then stop.', wayIn: { kind: 'overlap', passes: 1 } },
  'overlap-2': { label: 'Overlap · 2 passes', what: 'The loops arriving start at full; the ones leaving carry on for two passes, then stop.', wayIn: { kind: 'overlap', passes: 2 } },
  cut: { label: 'Cut', what: 'The loops leaving stop at the end of the pass; the ones arriving start on the first beat.', wayIn: { kind: 'cut' } },
};
const wayKey = (w: WayIn): WayKey => (w.kind === 'cut' ? 'cut' : `${w.kind}-${w.passes}`);

/**
 * The editor of the selected scene (Keep design, 5 Nov 2026, K2): the scene row's open state,
 * laid out as a form in the panel beside the board, one scene at a time. Its name in place,
 * its span, its loops as pills, its Energy, a line of words for the rest with "change ▾"
 * opening the finer settings, how long it lasts, and Hear from here, Duplicate, Delete and
 * Check. "Into this scene" (K3) comes between Energy and the length.
 */
export function SceneEditor(r: SceneEditorProps): JSX.Element {
  const s = r.scene;
  const who = playerWords(r.playerName);
  const at = typeof s.at === 'number' ? s.at : 0;
  const lengthNow = Math.max(0, (r.nextAt ?? r.lengthSec) - at);
  const [lengthText, setLengthText] = useState(formatClock(lengthNow));
  const [problem, setProblem] = useState<string | null>(null);
  // Another scene selected, or the length changed elsewhere: the field follows.
  useEffect(() => { setLengthText(formatClock(lengthNow)); setProblem(null); }, [s.id, lengthNow]);
  const saved = r.loops.filter((l) => l.state !== 'empty');
  // A loop the scene uses that holds nothing still shows, marked, so it can be taken out (T2-06).
  const emptyInScene = r.loops.filter((l) => l.state === 'empty' && s.loops.includes(l.slot));
  const world = r.worldOptions.find((w) => w.value === s.settings.soundWorld)?.label ?? s.settings.soundWorld;
  const glide = typeof s.glideSec === 'number' && s.glideSec > 0 ? s.glideSec : 0;
  const fill = FILL_STEPS[nearestStep(FILL_STEPS, s.settings.fillAmount)].label.toLowerCase();
  const evolve = EVOLVE_STEPS[nearestStep(EVOLVE_STEPS, s.settings.evolveAmount)].label.toLowerCase();
  // The rest, in one line while it is folded, so nothing set is hidden.
  const restLine = [
    world,
    chordWords(s.settings.chords),
    BAND_WORDS[s.settings.band],
    ...(s.settings.band !== 'off' ? [bandJobsWords(s.settings.bandJobs)] : []),
    fill === 'off' ? 'no extra notes' : `${fill} extra notes`,
    evolve === 'off' ? 'sounds stay' : `sounds change ${evolve === 'more' ? 'a lot' : 'slowly'}`,
    `${s.settings.bpm} BPM${glide > 0 ? `, reached over ${glide} s` : ''}`,
    ...(s.leadIn ? [`${LEAD_IN_WORDS[s.leadIn].label.toLowerCase()} before it`] : []),
    ...(s.alone ? [`${who.name} alone`] : []),
  ].join(' · ');
  const set = (patch: Partial<Scene['settings']>): void => r.onEdit({ settings: { ...s.settings, ...patch } });
  const kept = s.aiIdeas?.length ?? 0;
  // One fold for every scene, remembered for the session (A1).
  const [more, toggleMore] = useSessionFold('scene-more');
  const off = r.locked !== null;

  const saveLength = (): void => {
    const t = lengthText.trim();
    const parsed = t === '' ? null : parseClock(t);
    if (parsed === null) {
      const plain = plainNumberProblem(t);
      setProblem(`${plain ? `${plain} ` : ''}Type the length as minutes:seconds, like 2:00.`);
      return;
    }
    setProblem(null);
    setLengthText(formatClock(parsed));
    if (parsed !== lengthNow) r.onLength(parsed);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* The heading: its number, its name in place, its span. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap' }}>{`Scene ${r.number}`}</span>
        <input
          key={s.id} type="text" defaultValue={s.name} aria-label="Scene name" disabled={off}
          onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== s.name) r.onEdit({ name }); }}
          style={{ width: 140, minHeight: 'var(--bs-target)', fontSize: 16, fontWeight: 700 }}
        />
        <span style={{ ...label, fontVariantNumeric: 'tabular-nums' }}>{typeof s.at === 'number' ? `${formatClock(at)} → ${formatClock(at + lengthNow)}${r.current ? ' · on now' : ''}` : 'no time'}</span>
      </div>
      {r.locked && <span role="note" style={label}>{r.locked}</span>}

      <span style={label}>Loops in this scene</span>
      <div role="group" aria-label="Loops in this scene" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {saved.length === 0 && <span style={label}>No loops kept yet.</span>}
        {emptyInScene.map((l) => (
          <button
            key={`empty${l.slot}`} type="button" disabled={off}
            onClick={() => r.onEdit({ loops: s.loops.filter((x) => x !== l.slot) })}
            title="This loop holds nothing, so nothing plays from it"
            style={{ minHeight: 'var(--bs-target)', padding: '4px 12px', borderRadius: 999, cursor: 'pointer', color: 'inherit', border: '1px dashed var(--bs-warn)', background: 'transparent' }}
          >
            {`${loopName(l)}: empty, take it out`}
          </button>
        ))}
        {saved.map((l) => {
          const inScene = s.loops.includes(l.slot);
          return (
            <button
              key={l.slot} type="button" aria-pressed={inScene} disabled={off}
              onClick={() => r.onEdit({ loops: inScene ? s.loops.filter((x) => x !== l.slot) : [...s.loops, l.slot].sort((a, b) => a - b) })}
              // In the scene: a pill in the text colour, semibold, with its ✓ (L5).
              style={{
                minHeight: 'var(--bs-target)', padding: '4px 10px', borderRadius: 999, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                color: inScene ? 'var(--bs-fg)' : 'var(--bs-fg2)', fontWeight: inScene ? 600 : 500,
                border: `1px solid ${inScene ? 'var(--bs-fg)' : 'var(--bs-border-control)'}`, background: 'transparent',
              }}
            >
              <LoopThumb cells={l.cells} rows={8} cols={8} swatchFor={() => 'currentColor'} width={20} />
              {`${inScene ? '✓ ' : ''}${loopName(l)}`}
            </button>
          );
        })}
      </div>

      <span style={label}>Energy</span>
      <SegmentedControl<number>
        label="Energy of this scene" value={s.settings.sceneEnergy} onChange={(e) => { if (!off) set({ sceneEnergy: e as SceneEnergy }); }}
        options={[{ value: 0, label: ENERGY_NAMES[0] }, ...ENERGY_LEVELS.map((e) => ({ value: e, label: ENERGY_NAMES[e] }))]}
      />
      <span style={label}>{ENERGY_WORDS[s.settings.sceneEnergy]}</span>

      {/* How the piece gets into this scene (K3): a fade, an overlap, or a cut at the pass. */}
      <span style={label}>Into this scene</span>
      <SegmentedControl<WayKey>
        label="Into this scene" value={wayKey(s.wayIn ?? { kind: 'fade', passes: 1 })}
        onChange={(k) => { if (!off) r.onEdit({ wayIn: WAYS[k].wayIn }); }}
        options={(Object.keys(WAYS) as WayKey[]).map((k) => ({ value: k, label: WAYS[k].label, hint: WAYS[k].what }))}
      />
      <span style={label}>{WAYS[wayKey(s.wayIn ?? { kind: 'fade', passes: 1 })].what}</span>

      {/* The rest as one line, with change ▾ opening it: the world, chords, band, Extra notes, Sounds change, speed, lead-in, alone, ideas, Update from now. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderTop: '1px solid var(--bs-border)', paddingTop: 8 }}>
        <span style={{ ...label, flex: '1 1 200px', minWidth: 0 }}>{restLine}</span>
        <button
          type="button" aria-expanded={more} onClick={toggleMore} aria-label={`change ${more ? '▴' : '▾'}: the finer settings of ${s.name}`}
          style={{ background: 'transparent', border: 'none', color: 'var(--bs-fg)', minHeight: 'var(--bs-target)', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
        >
          {`change ${more ? '▴' : '▾'}`}
        </button>
      </div>
      {more && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: off ? 0.6 : 1 }}>
          <SegmentedControl<SoundWorldChoice> label="Sound world" showLabel value={s.settings.soundWorld} onChange={(soundWorld) => { if (!off) set({ soundWorld }); }} options={r.worldOptions} />
          <ChordChoice value={s.settings.chords} onChange={(chords) => { if (!off) set({ chords }); }} />
          <span style={label}>Band</span>
          <SegmentedControl<BandLevel>
            label="Band" value={s.settings.band} onChange={(band) => { if (!off) set({ band }); }}
            options={[{ value: 'off', label: 'Off' }, { value: 'gentle', label: 'Quiet' }, { value: 'full', label: 'Full' }]}
          />
          {s.settings.band !== 'off' && <BandJobsChoice value={s.settings.bandJobs} onChange={(bandJobs) => { if (!off) set({ bandJobs }); }} />}
          <span style={label}>Extra notes</span>
          <SegmentedControl<number>
            label="Extra notes" value={nearestStep(FILL_STEPS, s.settings.fillAmount)}
            onChange={(k) => { if (!off) set({ fillAmount: FILL_STEPS[k].value }); }}
            options={FILL_STEPS.map((x, k) => ({ value: k, label: x.label }))}
          />
          <span style={label}>Sounds change</span>
          <SegmentedControl<number>
            label="Sounds change" value={nearestStep(EVOLVE_STEPS, s.settings.evolveAmount)}
            onChange={(k) => { if (!off) set({ evolveAmount: EVOLVE_STEPS[k].value }); }}
            options={EVOLVE_STEPS.map((x, k) => ({ value: k, label: x.label }))}
          />
          <LabeledSlider label={WORDS.speed} min={40} max={240} value={s.settings.bpm} display={`${s.settings.bpm} BPM`} reason={r.locked} onChange={(v) => set({ bpm: Math.round(v) })} />
          <span style={label}>Reach this speed</span>
          <SegmentedControl<'once' | 'gradually'>
            label="Reach this speed" value={glide > 0 ? 'gradually' : 'once'}
            onChange={(v) => { if (off || v === (glide > 0 ? 'gradually' : 'once')) return; r.onEdit({ glideSec: v === 'once' ? 0 : GLIDE_DEFAULT_SEC }); }}
            options={[{ value: 'once', label: 'At once' }, { value: 'gradually', label: 'Gradually' }]}
          />
          {glide > 0 && (
            <LabeledSlider label="Over" min={GLIDE_MIN_SEC} max={GLIDE_MAX_SEC} step={1} value={glide} display={`${glide} seconds`} reason={r.locked} onChange={(v) => r.onEdit({ glideSec: Math.round(v) })} />
          )}
          <span style={label}>Lead-in</span>
          <SegmentedControl<LeadIn>
            label="Lead-in" value={s.leadIn ?? 'none'} onChange={(leadIn) => { if (!off) r.onEdit({ leadIn }); }}
            options={LEAD_INS.map((l) => ({ value: l, label: LEAD_IN_WORDS[l].label, hint: LEAD_IN_WORDS[l].what }))}
          />
          <span style={label}>{`${LEAD_IN_WORDS[s.leadIn ?? 'none'].what}${s.leadIn ? ' Brought in by hand, it plays in what is left of that pass.' : ''}`}</span>
          {/* A scene with no loops is silence unless the player plays: only on purpose (F4). */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, minHeight: 'var(--bs-target)', cursor: 'pointer' }}>
            <input type="checkbox" checked={s.alone === true} disabled={off} onChange={(e) => r.onEdit({ alone: e.target.checked })} style={{ width: 20, height: 20 }} />
            <span>{`${who.Name} alone: no loops, only what ${who.name} plays`}</span>
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button tone="secondary" onClick={r.onNewIdeas} aria-label={`New ideas: ${s.name}`} reason={r.locked}>↻ New ideas</Button>
            <span style={{ ...label, flex: '1 1 200px' }}>
              {`This scene plays the same ideas every rehearsal.${kept > 0 ? ` ${kept} AI ${kept === 1 ? 'idea is' : 'ideas are'} kept for it.` : ''} New ideas gives it different ones.`}
            </span>
          </div>
          {!r.onUpdateFromNow && <span style={label}>While the board plays, Update from now copies what is playing into this scene.</span>}
          {r.onUpdateFromNow && (
            <div><Button tone="secondary" onClick={r.onUpdateFromNow} reason={r.locked} title="Replace this scene's loops and sound with what is playing now">Update from now</Button></div>
          )}
        </div>
      )}

      {/* The opening scene of an older piece that starts later: the piece has no scene until then; one press moves it to 0:00. */}
      {r.number === 1 && typeof s.at === 'number' && s.at > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span role="note" style={{ fontSize: 14, color: 'var(--bs-warn)' }}>{`The piece has no scene until ${formatClock(s.at)}.`}</span>
          <Button tone="secondary" onClick={() => r.onEdit({ at: 0 })} reason={r.locked}>Start the piece with it</Button>
        </div>
      )}
      {/* A scene left with no time (no room before the end, from an older piece): say so; it can be deleted. */}
      {typeof s.at !== 'number' && (
        <span role="note" style={{ fontSize: 14, color: 'var(--bs-warn)' }}>This scene has no time: no room was left before the end. Delete it, or shorten a scene and keep it again.</span>
      )}
      {/* How long it lasts: the next scenes move with it (the screen does the moving). */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, flexWrap: 'wrap' }}>
        <span>Length</span>
        <input
          type="text" value={lengthText} placeholder="m:ss" aria-invalid={problem !== null} aria-label={`How long ${s.name} lasts (minutes:seconds)`} disabled={off || typeof s.at !== 'number'}
          onChange={(e) => setLengthText(e.target.value)}
          onBlur={saveLength}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveLength(); } }}
          style={{ width: 80, minHeight: 'var(--bs-target)' }}
        />
        <span style={label}>{r.nextAt === null ? 'to the end of the piece' : 'the next scenes move with it'}</span>
      </label>
      {problem && <span role="alert" style={{ fontSize: 14, color: 'var(--bs-warn)' }}>{problem}</span>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {r.onHear && (
          <Button
            tone="secondary"
            // It goes once the piece plays: focus goes to ■ Stop, one press from stopping it.
            onClick={(e) => { r.onHear?.(); void focusWhenGone(() => document.getElementById(PLAY_STOP_ID), e.currentTarget, 20_000); }}
            aria-label={`Hear from here: ${s.name}, play the piece from ${formatClock(at)}`}
          >
            ▶ Hear from here
          </Button>
        )}
        {/* Only where it would do something (U2): the scene on now says so in its heading. */}
        {r.onGo && !r.current && <Button tone="secondary" onClick={r.onGo} aria-label={`Jump here now: ${s.name}`}>Jump here now</Button>}
        <Button tone="quiet" onClick={r.onDuplicate} reason={r.locked} aria-label={`Duplicate: ${s.name}`} title="A copy of this scene after it, halfway through it">Duplicate</Button>
        <Button tone="quiet" onClick={(e) => r.onDelete(e.currentTarget)} reason={r.locked}>Delete scene</Button>
        <Button tone="quiet" onClick={r.onCheck} aria-label="Check › the length, the ending and the ready check">Check ›</Button>
      </div>
    </div>
  );
}
