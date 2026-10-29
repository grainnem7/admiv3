// The Sound tab: what each colour sounds like, the feel of the whole instrument, and the
// three helpers that add to the player's music. Everything a musician reaches for during
// a session sits here as a few named steps; the developer-level choices live in Advanced.

import type { CSSProperties, ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Disclosure } from '../ui/Disclosure';
import { SegmentedControl } from '../ui/SegmentedControl';
import type { BoardPalette } from '../theme/boardTokens';
import { SOUND_WORLDS, SOUND_WORLD_IDS, worldOf, type SoundWorldChoice } from '../../../../audio/worlds/soundWorlds';
import type { BandLevel, BandPart } from '../../../../songs/band/band';
import { type ColourChannel, type ColourId, type ColourRole } from '../../../../tracking/boardColours';
import { ColourTable } from './ColourTable';
import type { BoardSequencerStored } from '../../../../profiles/BoardSequencerConfig';
import { ENERGY, nearest, SPACE_ALL, type Step } from '../../../../audio/soundSteps';
import { StepRow } from './StepRow';
import { ChordChoice } from './ChordChoice';
import { Switch } from '../ui/Switch';
import { configToSoundFrom } from '../../../../midi/boardMidi';

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
const HEADING: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 700 };
const NOTE: CSSProperties = { fontSize: 12, color: 'var(--bs-fg2)' };
const CARD: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
  borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-raised)', border: '1px solid var(--bs-border)',
};

// ---- a helper: Band, Extra notes, Sounds change ----

function HelperButtons({ a, tryLabel }: { a: HelperActions; tryLabel: string }): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <Button tone="primary" onClick={a.onTry} aria-label={tryLabel}>↻ Try another</Button>
      <Button onClick={a.onPrevious} reason={a.canPrevious ? null : 'Nothing to go back to yet.'}>↶ Previous</Button>
      <Button aria-pressed={a.frozen} onClick={a.onFreeze} reason={a.frozen ? null : a.freezeReason}>
        {a.frozen ? '📌 Frozen ✓' : '📌 Freeze'}
      </Button>
    </div>
  );
}

const BAND_PART_NAMES: Record<BandPart, string> = { pad: 'chords', bass: 'bass', groove: 'drums' };

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
        <h3 id="sound-feel" style={HEADING}>Overall feel</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 12, color: 'var(--bs-fg2)' }}>World</span>
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
          <span style={{ fontSize: 12, color: 'var(--bs-fg2)' }}>Groove</span>
          <SegmentedControl<GrooveName | 'custom'>
            label="Groove"
            value={groove ?? 'custom'}
            onChange={(g) => { if (g !== 'custom') p.setGroove(GROOVES[g].swing, GROOVES[g].humanize); }}
            options={(Object.keys(GROOVES) as GrooveName[]).map((g) => ({ value: g, label: GROOVES[g].label }))}
          />
          <span style={NOTE}>
            {groove === null
              ? `Your own swing (${Math.round(config.swing * 100)}%) and humanize (${Math.round(config.humanize * 100)}%) from the Groove tab.`
              : groove === 'straight' ? 'Every note exactly on the beat.'
                : groove === 'swung' ? 'Off-beats a little late, like jazz or hip-hop.'
                  : 'Swung and loose: a few notes rest, timing breathes.'}
          </span>
        </div>
      </section>

      {/* ---- each colour ---- */}
      <section aria-labelledby="sound-colours" style={SECTION}>
        <h3 id="sound-colours" style={HEADING}>Your colours</h3>
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
        <h3 id="sound-helpers" style={HEADING}>Helpers</h3>
        <span style={NOTE}>Each adds to your music. On the board: ● your counters · ◌ extra notes · ▬ the band.</span>

        <div role="group" aria-label="Band" style={CARD}>
          <span style={{ fontWeight: 600 }}>Band</span>
          <SegmentedControl<BandLevel>
            label="Band"
            value={config.band}
            onChange={(v) => update({ band: v })}
            options={[{ value: 'off', label: 'Off' }, { value: 'gentle', label: 'Quiet' }, { value: 'full', label: 'Full' }]}
          />
          <span style={NOTE}>
            {config.band === 'off'
              ? 'Chords, a bass and drums that build up under you as you put counters down.'
              : `${config.band === 'gentle' ? 'A held chord, a root bass and a soft pulse.' : 'Chords, a walking bass and the full kit.'} Chords under your first counters, the bass from three, the drums from five. Put down a bass, chord or drum counter and the band hands that part to you.`}
          </span>
          {config.band !== 'off' && p.running && (
            <span role="status" style={NOTE}>
              {p.band.playing && p.band.parts.length > 0
                ? `Playing now: ${p.band.parts.map((x) => BAND_PART_NAMES[x]).join(', ')}.`
                : 'Waiting for your first counter.'}
            </span>
          )}
        </div>

        <div role="group" aria-label="Chords" style={CARD}>
          <span style={{ fontWeight: 600 }}>Chords</span>
          <ChordChoice value={config.chords} onChange={(chords) => update({ chords })} />
          <span style={NOTE}>
            {`Everything with notes plays to these chords: your counters, your loops, the band and the extra notes. A chord counter changes one chord, from its column until the next chord.${p.running ? ' New chords start at the next pass.' : ''}`}
          </span>
          <Switch
            label="Melody and bass fit the chord" checked={config.clashNudge} onChange={(clashNudge) => update({ clashNudge })}
            hint="On the main beats, a melody or bass note that rubs against the chord moves to the nearest chord note. Off: every note plays as placed."
          />
        </div>

        <div role="group" aria-label="Extra notes" style={CARD}>
          <span style={{ fontWeight: 600 }}>Extra notes</span>
          <StepRow
            label="How many"
            steps={FILL_STEPS}
            value={config.fillAmount}
            disabled={p.fill.reason !== null}
            onPick={(v) => update({ fillAmount: v, ...(v === 0 ? { fillKept: null } : {}) })}
            hint={p.fill.reason}
          />
          <span style={NOTE}>
            {fillStep === 0
              ? 'The instrument adds notes around yours: passing notes, echoes, softer drum hits. It never plays over a note you put down.'
              : `${p.fill.count} extra ${p.fill.count === 1 ? 'note' : 'notes'} now, shown on the board as dotted rings. ${p.fill.frozen ? 'Frozen: they stay as they are, whatever you move.' : 'They follow the board as you move counters.'}`}
          </span>
          {p.fill.status && <span role="status" aria-live="polite" style={NOTE}>{p.fill.status}</span>}
          <HelperButtons a={p.fill} tryLabel="Try other extra notes" />
        </div>

        <div role="group" aria-label="Sounds change" style={CARD}>
          <span style={{ fontWeight: 600 }}>Sounds change</span>
          <StepRow
            label="How much"
            steps={EVOLVE_STEPS}
            value={config.evolveAmount}
            disabled={p.evolve.reason !== null}
            onPick={(v) => update({ evolveAmount: v })}
            hint={p.evolve.reason}
          />
          <span style={NOTE}>
            {evolveStep === 0
              ? 'The music keeps moving: one-note counters wander to nearby notes, sounds get brighter or darker, and now and then a colour moves to another instrument or drum pattern.'
              : p.evolve.frozen
                ? 'Frozen: the sounds stay as they are now.'
                : `Notes wander to their neighbours (home again every 4th loop), sounds drift every loop and change every ${config.evolveSceneLoops} loops, one colour at a time. The drums can change pattern too. Turn off "Changes over time" on a card to keep that colour exactly as placed.`}
          </span>
          {p.evolve.lastChange && <span role="status" style={NOTE}>{p.evolve.lastChange}</span>}
          <HelperButtons a={p.evolve} tryLabel="Try other sounds" />
        </div>
      </section>

      <section aria-labelledby="sound-loops" style={SECTION}>
        <div role="group" aria-label="Loops vary" style={CARD}>
          <span id="sound-loops" style={{ fontWeight: 600 }}>Loops vary</span>
          <StepRow
            label="How much saved loops change"
            steps={LOOP_VARY_STEPS}
            value={config.loopVary}
            onPick={(v) => update({ loopVary: v })}
          />
          <span style={NOTE}>
            {config.loopVary <= 0
              ? 'Saved loops play exactly as saved, every pass.'
              : 'Saved loops don\'t repeat exactly: on some passes their notes move to neighbours or add a passing note, tunes play another version and drum loops get busier or sparser. Every 4th pass they are back as saved. Your own counters are not changed.'}
          </span>
          <span style={NOTE}>
            Layered melodies take turns: one leads each pass and the others answer in its gaps, so loops talk to each other. Your counters always lead. For the AI to add its own notes around everything that is playing, turn up Extra notes.
          </span>
        </div>
      </section>

      <Disclosure summary="Advanced: key, scale, note length, mix, AI">
        {inAbleton && <p style={{ ...NOTE, margin: '0 0 8px' }}>{`${IN_ABLETON}: Studio mix and the mix settings here only change ADMI's own sound. Key, scale and note length still change the notes Ableton plays.`}</p>}
        {p.advanced}
      </Disclosure>
    </div>
  );
}
