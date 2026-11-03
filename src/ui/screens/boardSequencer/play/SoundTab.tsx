// The Sound tab: what each colour sounds like, the feel of the whole instrument, and the
// three helpers that add to the player's music. Everything a musician reaches for during
// a session sits here as a few named steps; the developer-level choices live in Advanced.

import type { CSSProperties, ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Disclosure } from '../ui/Disclosure';
import { Note } from '../ui/explain';
import { SegmentedControl } from '../ui/SegmentedControl';
import type { BoardPalette } from '../theme/boardTokens';
import { SOUND_WORLDS, SOUND_WORLD_IDS, worldOf, type SoundWorldChoice } from '../../../../audio/worlds/soundWorlds';
import type { BandLevel, BandPart } from '../../../../songs/band/band';
import { type ColourChannel, type ColourId, type ColourRole } from '../../../../tracking/boardColours';
import { ColourTable } from './ColourTable';
import type { BoardSequencerStored } from '../../../../profiles/BoardSequencerConfig';
import { ENERGY, nearest, SPACE_ALL, type Step } from '../../../../audio/soundSteps';
import { StepRow } from './StepRow';
import { ChordChoice, chordWords } from './ChordChoice';
import { BandJobsChoice } from './BandJobsChoice';
import { LabeledSlider } from '../ui/LabeledSlider';
import { KEEP_ON_TOP_MAX_DB, KEEP_ON_TOP_MIN_DB } from '../../../../songs/band/keepOnTop';
import { Switch } from '../ui/Switch';
import { configToSoundFrom } from '../../../../midi/boardMidi';
import { useSessionFold } from '../ui/useSessionFold';
import { WORDS } from '../words';

/** Said wherever a control only changes ADMI's own sound, while Ableton makes it. */
const IN_ABLETON = 'Sound set in Ableton';

/** The fields of a colour's sound that the colour table changes. */
export type ChannelSoundPatch = Partial<Pick<ColourChannel,
  'instrument' | 'drum' | 'volume' | 'tone' | 'reverbSend' | 'delaySend' | 'plays' | 'changes' | 'noteVary'>>;

/** A helper's ↻ / ↶ / 📌 buttons and what they can do right now. */
export interface HelperActions {
  /** Why the amount can't be changed here (a counter on the board owns it), or null. */
  reason: string | null;
  onTry(): void;
  onPrevious(): void;
  canPrevious: boolean;
  onFreeze(): void;
  frozen: boolean;
  /** Why Freeze can't be pressed yet, or null. */
  freezeReason: string | null;
}

export interface SoundTabProps {
  config: BoardSequencerStored;
  palette: BoardPalette;
  running: boolean;
  update(patch: Partial<BoardSequencerStored>): void;
  /** Change a colour's sound: saved for the player and heard straight away. */
  setChannelSound(id: string, patch: ChannelSoundPatch): void;
  /** What a colour plays (its job), and which loop a loop colour plays. */
  onRole(id: ColourId, role: ColourRole): void;
  onLoopSlot(id: ColourId, slot: number): void;
  /** ▶ Hear a colour's sound now, and which one is loading. */
  onHear(c: ColourChannel): void;
  hearing: string | null;
  hearNote?: { id: string; text: string } | null;
  /** Swing and humanize also go to the running engine. */
  setGroove(swing: number, humanize: number): void;
  fill: HelperActions & { count: number; status: string | null };
  evolve: HelperActions & { lastChange: string | null };
  band: { playing: boolean; parts: BandPart[] };
  /** The live reading of a control counter ("Reverb 40%"), or null for a sound colour. */
  liveValue(c: ColourChannel): string | null;
  /** Key, scale, note length, the studio mix and the other choices most sessions leave. */
  advanced: ReactNode;
  /** Phase 2: colours that share an Ableton channel with an earlier colour (one per part). */
  abletonShares?: ReadonlyMap<string, { channel: number; withId: string }>;
}

// ---- steps: a few named places instead of a slider ----

// Loud, Bright, Space, Energy and overall Space are shared with MIDI out (soundSteps.ts).
const FILL_STEPS: Step[] = [{ label: 'Off', value: 0 }, { label: 'A few', value: 0.25 }, { label: 'Some', value: 0.5 }, { label: 'Lots', value: 0.8 }];
const EVOLVE_STEPS: Step[] = [{ label: 'Off', value: 0 }, { label: 'Slowly', value: 0.35 }, { label: 'More', value: 0.7 }];
const LOOP_VARY_STEPS: Step[] = [{ label: 'Off', value: 0 }, { label: 'A little', value: 0.35 }, { label: 'More', value: 0.7 }];

type GrooveName = 'straight' | 'swung' | 'lazy';
const GROOVES: Record<GrooveName, { label: string; swing: number; humanize: number }> = {
  straight: { label: 'Straight', swing: 0, humanize: 0 },
  swung: { label: 'Swung', swing: 0.33, humanize: 0.08 },
  lazy: { label: 'Lazy', swing: 0.5, humanize: 0.22 },
};


function grooveOf(swing: number, humanize: number): GrooveName | null {
  for (const [name, g] of Object.entries(GROOVES) as [GrooveName, typeof GROOVES[GrooveName]][]) {
    if (Math.abs(g.swing - swing) < 0.02 && Math.abs(g.humanize - humanize) < 0.02) return name;
  }
  return null;
}

const SECTION: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const HEADING: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 700 };
const NOTE: CSSProperties = { fontSize: 14, color: 'var(--bs-fg2)' };
const CARD: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
  borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-raised)', border: '1px solid var(--bs-border)',
};

// ---- a helper: Band, Extra notes, Sounds change ----

/**
 * A helper's card, folded to one line that says how it is set (A1): its name, then its
 * setting ("Extra notes · Some"). Open, it shows everything it did before. The fold is
 * remembered for the session. The card keeps its group name, open or folded.
 */
function HelperFold({ id, title, summary, children }: { id: string; title: string; summary: string; children: ReactNode }): JSX.Element {
  const [open, toggle] = useSessionFold(`sound-${id}`);
  return (
    <div role="group" aria-label={title} style={{ ...CARD, paddingTop: 2, paddingBottom: open ? 10 : 2 }}>
      <button
        type="button" aria-expanded={open} onClick={toggle} data-helper-fold={id}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: 0,
          background: 'transparent', border: 'none', color: 'inherit', minHeight: 'var(--bs-target)', cursor: 'pointer',
        }}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span style={{ fontWeight: 600 }}>{title}</span>
        <span style={{ ...NOTE, flex: 1, minWidth: 0, fontSize: 14 }}>{summary}</span>
      </button>
      {open && children}
    </div>
  );
}

function HelperButtons({ a, tryWord, tryLabel }: { a: HelperActions; tryWord: string; tryLabel: string }): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <Button tone="primary" onClick={a.onTry} aria-label={tryLabel}>{`↻ ${tryWord}`}</Button>
      <Button onClick={a.onPrevious} reason={a.canPrevious ? null : 'Nothing to go back to yet.'}>↶ Previous</Button>
      <Button aria-pressed={a.frozen} onClick={a.onFreeze} reason={a.frozen ? null : a.freezeReason}>
        {a.frozen ? '📌 Frozen ✓' : '📌 Freeze'}
      </Button>
    </div>
  );
}

const BAND_LEVEL_WORDS: Record<BandLevel, string> = { off: 'Off', gentle: 'Quiet', full: 'Full' };
const upperFirst = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

const BAND_PART_NAMES: Record<BandPart, string> = { pad: 'chords', bass: 'bass', groove: 'drums', counter: 'counter-melody', leadIn: 'lead-in' };

export function SoundTab(p: SoundTabProps): JSX.Element {
  const { config, update } = p;
  const world = worldOf(config.soundWorld);
  const groove = grooveOf(config.swing, config.humanize);
  const fillStep = nearest(FILL_STEPS, config.fillAmount);
  const evolveStep = nearest(EVOLVE_STEPS, config.evolveAmount);
  const inAbleton = configToSoundFrom(config) === 'ableton';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 10 }}>
      {/* ---- the whole instrument ---- */}
      <section aria-labelledby="sound-feel" style={SECTION}>
        <h2 id="sound-feel" style={HEADING}>Overall feel</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>World</span>
          <SegmentedControl<SoundWorldChoice>
            label="Sound world"
            value={config.soundWorld}
            onChange={(v) => update({ soundWorld: v })}
            options={[
              ...SOUND_WORLD_IDS.map((id) => ({ value: id as SoundWorldChoice, label: SOUND_WORLDS[id].name })),
              { value: 'none' as SoundWorldChoice, label: 'My picks' },
            ]}
          />
          {world && config.channels.some((c) => c.instrument || c.drum) && (
            <Button
              tone="quiet"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => update({ channels: config.channels.map((c) => ({ ...c, instrument: undefined, drum: undefined })) })}
            >
              {`Reset every colour to the ${world.name} world`}
            </Button>
          )}
          <span style={NOTE}>{world ? world.description : 'Each colour plays the sound chosen in its row.'}{inAbleton ? ' Also switches Ableton\u2019s chains (CC 30) on every colour without its own sound.' : ''}</span>
        </div>
        <StepRow
          label="Energy"
          steps={ENERGY}
          value={config.energy}
          onPick={(v) => update({ energy: v })}
          hint="How hard everything plays, and how busy the drums are."
        />
        <StepRow
          label="Space"
          steps={SPACE_ALL}
          value={config.space}
          onPick={(v) => update({ space: v })}
          hint={inAbleton ? '→ Ableton Return A level (CC 22 on channel 16).' : 'How much room and echo around everything. A reverb or echo counter on the board takes over.'}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 14, color: 'var(--bs-fg2)' }}>Groove</span>
          <SegmentedControl<GrooveName | 'custom'>
            label="Groove"
            value={groove ?? 'custom'}
            onChange={(g) => { if (g !== 'custom') p.setGroove(GROOVES[g].swing, GROOVES[g].humanize); }}
            options={(Object.keys(GROOVES) as GrooveName[]).map((g) => ({ value: g, label: GROOVES[g].label }))}
          />
          <Note>
            {groove === null
              ? `Your own swing (${Math.round(config.swing * 100)}%) and loose timing (${Math.round(config.humanize * 100)}%), set finely on the ${WORDS.timing} tab.`
              : groove === 'straight' ? 'Every note exactly on the beat.'
                : groove === 'swung' ? 'Off-beats a little late, like jazz or hip-hop.'
                  : 'Swung and loose: a few notes rest, timing breathes.'}
            {groove !== null && ` Sets the swing and loose timing on the ${WORDS.timing} tab in one step.`}
          </Note>
        </div>
      </section>

      {/* ---- each colour ---- */}
      <section aria-labelledby="sound-colours" style={SECTION}>
        <h2 id="sound-colours" style={HEADING}>Your colours</h2>
        {config.channels.length === 0
          ? <span style={NOTE}>No colours yet. Set up: Colours.</span>
          : (
            <ColourTable
              config={config}
              palette={p.palette}
              roleLockedReason={p.running ? 'Stop the board to change what a colour plays.' : null}
              onRole={p.onRole}
              onLoopSlot={p.onLoopSlot}
              setChannelSound={p.setChannelSound}
              onHear={p.onHear}
              hearing={p.hearing}
              hearNote={p.hearNote}
              liveValue={p.liveValue}
              abletonShares={p.abletonShares}
            />
          )}
        {p.running && <span style={NOTE}>A new sound comes in from the next notes, once it has loaded.</span>}
      </section>

      {/* ---- what the instrument adds ---- */}
      <section aria-labelledby="sound-helpers" style={SECTION}>
        <h2 id="sound-helpers" style={HEADING}>Helpers</h2>
        <Note>Each adds to your music. On the board: ● your counters · ◌ extra notes · ▬ the band.</Note>

        <HelperFold id="band" title="Band" summary={BAND_LEVEL_WORDS[config.band]}>
          <SegmentedControl<BandLevel>
            label="Band"
            value={config.band}
            onChange={(v) => update({ band: v })}
            options={[{ value: 'off', label: 'Off' }, { value: 'gentle', label: 'Quiet' }, { value: 'full', label: 'Full' }]}
          />
          <Note>
            {config.band === 'off'
              ? (config.bandJobs.asBefore
                ? 'Chords, a bass and drums that build up under you as you put counters down.'
                : 'Pads, a bass, drums and a counter-melody that play along with you once a counter is down.')
              : config.bandJobs.asBefore
                ? `${config.band === 'gentle' ? 'A held chord, a root bass and a soft pulse.' : 'Chords, a walking bass and the full kit.'} Chords under your first counters, the bass from three, the drums from five. Put down a bass, chord or drum counter and the band hands that part to you.`
                : `${config.band === 'gentle' ? 'Quiet: soft and simple (held chords, a root bass, a gentle pulse, the counter-melody on the main beats only).' : 'Full: louder and busier (a walking bass, the whole kit, the counter-melody in every gap).'} It comes in on the pass after your first counter.`}
          </Note>
          {config.band !== 'off' && <BandJobsChoice value={config.bandJobs} onChange={(bandJobs) => update({ bandJobs })} />}
          {config.band !== 'off' && p.running && (
            <span role="status" style={NOTE}>
              {p.band.playing && p.band.parts.length > 0
                ? `Playing now: ${p.band.parts.map((x) => BAND_PART_NAMES[x]).join(', ')}.`
                : 'Waiting for your first counter.'}
            </span>
          )}
        </HelperFold>

        <HelperFold id="on-top" title="Keep my notes on top" summary={config.keepOnTop ? `On, the rest ${config.keepOnTopDb} dB quieter` : 'Off'}>
          <Switch
            label="Keep my notes on top" checked={config.keepOnTop} onChange={(keepOnTop) => update({ keepOnTop })}
            hint="While your own notes sound, the band, your loops and the extra notes go a little quieter, so you are always heard. Off: everything plays at its own level."
          />
          {config.keepOnTop && (
            <LabeledSlider
              label="How much quieter" min={KEEP_ON_TOP_MIN_DB} max={KEEP_ON_TOP_MAX_DB} step={0.5} value={config.keepOnTopDb}
              display={`${config.keepOnTopDb} dB${config.keepOnTopDb === 3 ? ' (usual)' : ''}`}
              onChange={(v) => update({ keepOnTopDb: Math.round(v * 2) / 2 })}
            />
          )}
        </HelperFold>

        <HelperFold id="chords" title="Chords" summary={upperFirst(chordWords(config.chords))}>
          <ChordChoice value={config.chords} onChange={(chords) => update({ chords })} />
          <Note>
            {`Everything with notes plays to these chords: your counters, your loops, the band and the extra notes. A chord counter changes one chord, from its column until the next chord.${p.running ? ' New chords start at the next pass.' : ''}`}
          </Note>
          <Switch
            label="Melody and bass fit the chord" checked={config.clashNudge} onChange={(clashNudge) => update({ clashNudge })}
            hint="On the main beats, a melody or bass note that rubs against the chord moves to the nearest chord note. Off: every note plays as placed."
          />
        </HelperFold>

        <HelperFold id="extra" title={WORDS.extraNotes} summary={`${FILL_STEPS[fillStep].label}${p.fill.frozen ? ' · frozen' : ''}`}>
          <StepRow
            label="How many"
            steps={FILL_STEPS}
            value={config.fillAmount}
            disabled={p.fill.reason !== null}
            onPick={(v) => update({ fillAmount: v, ...(v === 0 ? { fillKept: null } : {}) })}
            reason={p.fill.reason}
          />
          {fillStep === 0
            ? <Note>The instrument adds notes around yours: passing notes, echoes, softer drum hits. It never plays over a note you put down.</Note>
            : <span style={NOTE}>{`${p.fill.count} extra ${p.fill.count === 1 ? 'note' : 'notes'} now, shown on the board as dotted rings. ${p.fill.frozen ? 'Frozen: they stay as they are, whatever you move.' : 'They follow the board as you move counters.'}`}</span>}
          {p.fill.status && <span role="status" aria-live="polite" style={NOTE}>{p.fill.status}</span>}
          <HelperButtons a={p.fill} tryWord={WORDS.newIdea} tryLabel={`${WORDS.newIdea}: other extra notes`} />
        </HelperFold>

        <HelperFold id="evolve" title={WORDS.soundsChange} summary={`${EVOLVE_STEPS[evolveStep].label}${p.evolve.frozen ? ' · frozen' : ''}`}>
          <StepRow
            label="How much"
            steps={EVOLVE_STEPS}
            value={config.evolveAmount}
            disabled={p.evolve.reason !== null}
            onPick={(v) => update({ evolveAmount: v })}
            reason={p.evolve.reason}
          />
          {evolveStep === 0
            ? <Note>The music keeps moving: one-note counters wander to nearby notes, sounds get brighter or darker, and now and then a colour moves to another instrument or drum pattern.</Note>
            : <span style={NOTE}>{p.evolve.frozen
              ? 'Frozen: the sounds stay as they are now.'
              : `Notes wander to their neighbours (home again every 4th loop), sounds drift every loop and change every ${config.evolveSceneLoops} loops, one colour at a time. The drums can change pattern too. Turn off "Changes over time" on a card to keep that colour exactly as placed.`}</span>}
          {p.evolve.lastChange && <span role="status" style={NOTE}>{p.evolve.lastChange}</span>}
          <HelperButtons a={p.evolve} tryWord={WORDS.newSound} tryLabel={`${WORDS.newSound}: other sounds`} />
        </HelperFold>
      </section>

      <section aria-label="Loops vary" style={SECTION}>
        <HelperFold id="loops-vary" title="Loops vary" summary={LOOP_VARY_STEPS[nearest(LOOP_VARY_STEPS, config.loopVary)].label}>
          <StepRow
            label="How much saved loops change"
            steps={LOOP_VARY_STEPS}
            value={config.loopVary}
            onPick={(v) => update({ loopVary: v })}
          />
          <Note>
            {config.loopVary <= 0
              ? 'Saved loops play exactly as saved, every pass.'
              : 'Saved loops don\'t repeat exactly: on some passes their notes move to neighbours or add a passing note, tunes play another version and drum loops get busier or sparser. Every 4th pass they are back as saved. Your own counters are not changed.'}
          </Note>
          <Note>
            Layered melodies take turns: one leads each pass and the others answer in its gaps, so loops talk to each other. Your counters always lead. For the AI to add its own notes around everything that is playing, turn up Extra notes.
          </Note>
        </HelperFold>
      </section>

      <Disclosure summary="Advanced: key, scale, note length, mix, AI">
        {inAbleton && <Note as="p" style={{ margin: '0 0 8px' }}>{`${IN_ABLETON}: Studio mix and the mix settings here only change ADMI's own sound. Key, scale and note length still change the notes Ableton plays.`}</Note>}
        {p.advanced}
      </Disclosure>
    </div>
  );
}
