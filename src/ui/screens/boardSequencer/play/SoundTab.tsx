// The Sound tab: what each colour sounds like, the feel of the whole instrument, and the
// three helpers that add to the player's music. Everything a musician reaches for during
// a session sits here as a few named steps; the developer-level choices live in Advanced.

import { useState, type CSSProperties, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Disclosure } from '../ui/Disclosure';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Switch } from '../ui/Switch';
import { SwatchChip } from '../ui/SwatchChip';
import type { BoardPalette } from '../theme/boardTokens';
import { SOUND_WORLDS, SOUND_WORLD_IDS, worldOf, type SoundWorldChoice } from '../../../../audio/worlds/soundWorlds';
import type { BandLevel, BandPart } from '../../../../songs/band/band';
import { describeChannel, ROLE_LABELS, type ColourChannel } from '../../../../tracking/boardColours';
import type { BoardSequencerStored } from '../../../../profiles/BoardSequencerConfig';
import { DRUM_OPTIONS, INSTRUMENT_OPTIONS, soundNameFor } from '../soundOptions';

/** The fields of a colour's sound that the cards change. */
export type ChannelSoundPatch = Partial<Pick<ColourChannel,
  'instrument' | 'drum' | 'volume' | 'tone' | 'reverbSend' | 'delaySend' | 'plays' | 'changes'>>;

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
  /** Swing and humanize also go to the running engine. */
  setGroove(swing: number, humanize: number): void;
  fill: HelperActions & { count: number; status: string | null };
  evolve: HelperActions & { lastChange: string | null };
  band: { playing: boolean; parts: BandPart[] };
  /** The live reading of a control counter ("Reverb 40%"), or null for a sound colour. */
  liveValue(c: ColourChannel): string | null;
  /** Key, scale, note length, the studio mix and the other choices most sessions leave. */
  advanced: ReactNode;
}

// ---- steps: a few named places instead of a slider ----

interface Step { label: string; value: number }

const LOUD: Step[] = [{ label: 'Soft', value: 0.4 }, { label: 'Medium', value: 0.65 }, { label: 'Loud', value: 0.85 }, { label: 'Full', value: 1 }];
const BRIGHT: Step[] = [{ label: 'Dark', value: 0.3 }, { label: 'Warm', value: 0.55 }, { label: 'Clear', value: 0.8 }, { label: 'Bright', value: 1 }];
const SPACE_SEND: Step[] = [{ label: 'Dry', value: 0 }, { label: 'Room', value: 0.15 }, { label: 'Hall', value: 0.3 }, { label: 'Huge', value: 0.5 }];
const ENERGY: Step[] = [{ label: 'Calm', value: 0.2 }, { label: 'Steady', value: 0.5 }, { label: 'Lively', value: 0.75 }, { label: 'Driving', value: 1 }];
const SPACE_ALL: Step[] = [{ label: 'Dry', value: 0.1 }, { label: 'Natural', value: 0.5 }, { label: 'Roomy', value: 0.75 }, { label: 'Huge', value: 1 }];
const FILL_STEPS: Step[] = [{ label: 'Off', value: 0 }, { label: 'A few', value: 0.25 }, { label: 'Some', value: 0.5 }, { label: 'Lots', value: 0.8 }];
const EVOLVE_STEPS: Step[] = [{ label: 'Off', value: 0 }, { label: 'Slowly', value: 0.35 }, { label: 'More', value: 0.7 }];
const LOOP_VARY_STEPS: Step[] = [{ label: 'Off', value: 0 }, { label: 'A little', value: 0.35 }, { label: 'More', value: 0.7 }];

type GrooveName = 'straight' | 'swung' | 'lazy';
const GROOVES: Record<GrooveName, { label: string; swing: number; humanize: number }> = {
  straight: { label: 'Straight', swing: 0, humanize: 0 },
  swung: { label: 'Swung', swing: 0.33, humanize: 0.08 },
  lazy: { label: 'Lazy', swing: 0.5, humanize: 0.22 },
};

/** The step nearest a stored value, so a value set elsewhere still lights a step. */
function nearest(steps: Step[], v: number): number {
  let best = 0;
  for (let i = 1; i < steps.length; i++) if (Math.abs(steps[i].value - v) < Math.abs(steps[best].value - v)) best = i;
  return best;
}

function grooveOf(swing: number, humanize: number): GrooveName | null {
  for (const [name, g] of Object.entries(GROOVES) as [GrooveName, typeof GROOVES[GrooveName]][]) {
    if (Math.abs(g.swing - swing) < 0.02 && Math.abs(g.humanize - humanize) < 0.02) return name;
  }
  return null;
}

function StepRow({ label, steps, value, onPick, disabled = false, hint }: {
  label: string; steps: Step[]; value: number; onPick(v: number): void; disabled?: boolean; hint?: string | null;
}): JSX.Element {
  const i = nearest(steps, value);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 12, color: 'var(--bs-fg2)' }}>{label}</span>
      <SegmentedControl<number>
        label={label}
        value={i}
        disabled={disabled}
        onChange={(k) => onPick(steps[k].value)}
        options={steps.map((s, k) => ({ value: k, label: s.label }))}
      />
      {hint && <span style={{ fontSize: 12, color: 'var(--bs-fg2)' }}>{hint}</span>}
    </div>
  );
}

const SECTION: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const HEADING: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 700 };
const NOTE: CSSProperties = { fontSize: 12, color: 'var(--bs-fg2)' };
const CARD: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
  borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-raised)', border: '1px solid var(--bs-border)',
};

// ---- one colour's card ----

function isMelodic(c: ColourChannel): boolean {
  return c.role === 'melody' || c.role === 'chord' || c.role === 'bass';
}

/** True when this colour has any sound choice of its own (so Reset has something to do). */
function customised(c: ColourChannel): boolean {
  return [c.instrument || undefined, c.drum || undefined, c.volume, c.tone, c.reverbSend, c.delaySend, c.plays, c.changes]
    .some((v) => v !== undefined);
}

/** The ‹ name › picker: steps through a list, with the list itself one press away. */
function Picker({ label, value, options, onPick }: {
  label: string; value: string; options: { key: string; name: string }[]; onPick(key: string): void;
}): JSX.Element {
  const i = Math.max(0, options.findIndex((o) => o.key === value));
  const step = (d: number): void => onPick(options[(i + d + options.length) % options.length].key);
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', alignItems: 'stretch', gap: 4 }}>
      <Button aria-label={`Previous ${label.toLowerCase()}`} onClick={() => step(-1)}>‹</Button>
      <select
        aria-label={label}
        value={options[i]?.key ?? ''}
        onChange={(e) => onPick(e.target.value)}
        style={{ flex: 1, minHeight: 'var(--bs-target)' }}
      >
        {options.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
      </select>
      <Button aria-label={`Next ${label.toLowerCase()}`} onClick={() => step(1)}>›</Button>
    </div>
  );
}

function ColourCard({ c, n, p }: { c: ColourChannel; n: number; p: SoundTabProps }): JSX.Element {
  const { config } = p;
  const world = worldOf(config.soundWorld);
  const melodic = isMelodic(c);
  const sound = soundNameFor(c, config.soundWorld);
  const live = p.liveValue(c);
  const plays = c.plays ?? (c.role === 'melody' ? 'note' : 'tune');
  const set = (patch: ChannelSoundPatch): void => p.setChannelSound(c.id, patch);
  const name = describeChannel(c);
  const [open, setOpen] = useState(false);
  return (
    <div role="group" aria-label={`${name}: ${ROLE_LABELS[c.role]}`} style={CARD}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <SwatchChip swatch={c.swatch} palette={p.palette} number={n} size={24} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 600 }}>{`${name} · ${ROLE_LABELS[c.role]}`}</span>
          {sound && <span style={NOTE}>{sound}</span>}
          {live && <span style={NOTE}>{live}</span>}
          {c.role === 'loop' && <span style={NOTE}>{`Plays loop ${(c.loopSlot ?? 0) + 1}${config.loopNames[c.loopSlot ?? 0] ? `: ${config.loopNames[c.loopSlot ?? 0]}` : ''}`}</span>}
        </div>
        {customised(c) && (melodic || c.role === 'drums') && (
          <Button
            tone="quiet"
            aria-label={`Reset ${name} to the ${world ? `${world.name} world` : 'default'}`}
            onClick={() => set({
              instrument: undefined, drum: undefined, volume: undefined, tone: undefined,
              reverbSend: undefined, delaySend: undefined, plays: undefined, changes: undefined,
            })}
          >
            Reset
          </Button>
        )}
      </div>
      {melodic && (
        <Picker
          label="Sound"
          value={c.instrument ?? ''}
          options={[{ key: '', name: world ? `${world.name} world's sound` : 'Default' }, ...INSTRUMENT_OPTIONS]}
          onPick={(key) => set({ instrument: key === '' ? undefined : key })}
        />
      )}
      {c.role === 'drums' && (
        <Picker
          label="Drum"
          value={c.drum ?? ''}
          options={[{ key: '', name: 'By row (kick → crash)' }, ...DRUM_OPTIONS]}
          onPick={(key) => set({ drum: key === '' ? undefined : key })}
        />
      )}
      {melodic && (
        <Button
          tone="quiet"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          style={{ alignSelf: 'flex-start' }}
        >
          {`${open ? '▾' : '▸'} Adjust: ${LOUD[nearest(LOUD, c.volume ?? 1)].label.toLowerCase()} · ${BRIGHT[nearest(BRIGHT, c.tone ?? 1)].label.toLowerCase()} · ${SPACE_SEND[nearest(SPACE_SEND, c.reverbSend ?? world?.reverbSend ?? 0.18)].label.toLowerCase()}`}
        </Button>
      )}
      {melodic && open && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
          <StepRow label="Loud" steps={LOUD} value={c.volume ?? 1} onPick={(v) => set({ volume: v })} />
          <StepRow label="Bright" steps={BRIGHT} value={c.tone ?? 1} onPick={(v) => set({ tone: v })} />
          <StepRow
            label="Space"
            steps={SPACE_SEND}
            value={c.reverbSend ?? world?.reverbSend ?? 0.18}
            onPick={(v) => set({ reverbSend: v })}
          />
        </div>
      )}
      {config.phrases && (melodic || c.role === 'drums') && (
        <StepRow
          label="Each counter plays"
          steps={[{ label: 'One note', value: 0 }, { label: c.role === 'drums' ? 'A groove' : c.role === 'bass' ? 'A bassline' : c.role === 'chord' ? 'The chords' : 'A tune', value: 1 }]}
          value={plays === 'tune' ? 1 : 0}
          onPick={(v) => set({ plays: v === 1 ? 'tune' : 'note' })}
          hint={plays === 'note'
            ? (config.evolveAmount > 0 && c.changes !== false
              ? 'One note where each counter sits. "Sounds change" moves it to nearby notes on some passes.'
              : 'Exactly the notes you put down, where you put them.')
            : c.role === 'drums' ? 'One counter keeps a whole groove going; higher on the board is busier.'
              : c.role === 'bass' ? 'One counter plays a bassline under the chords.'
                : c.role === 'chord' ? 'Where a counter sits sets the chord until the next one.'
                  : 'One counter plays a short tune from its step.'}
        />
      )}
      {(melodic || c.role === 'drums') && (
        <Switch
          label="Changes over time"
          checked={c.changes !== false}
          onChange={(on) => set({ changes: on ? undefined : false })}
          hint={config.evolveAmount <= 0 ? 'Only while "Sounds change" (below) is on.' : undefined}
        />
      )}
    </div>
  );
}

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
  const colours = config.channels.filter((c) => c.role !== 'off');
  const groove = grooveOf(config.swing, config.humanize);
  const fillStep = nearest(FILL_STEPS, config.fillAmount);
  const evolveStep = nearest(EVOLVE_STEPS, config.evolveAmount);

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
          <span style={NOTE}>{world ? world.description : 'Each colour plays the sound chosen on its card.'}</span>
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
          hint="How much room and echo around everything. A reverb or echo counter on the board takes over."
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
        {colours.length === 0
          ? <span style={NOTE}>No colour has a job yet. Set up: Colours.</span>
          : colours.map((c) => (
            <ColourCard key={c.id} c={c} n={config.channels.indexOf(c) + 1} p={p} />
          ))}
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
              ? 'Chords, a bass and drums that join in under you once your first counter is down.'
              : `${config.band === 'gentle' ? 'A held chord, a root bass and a soft pulse.' : 'Chords, a walking bass and the full kit.'} Put down a bass, chord or drum counter and the band hands that part to you.`}
          </span>
          {config.band !== 'off' && p.running && (
            <span role="status" style={NOTE}>
              {p.band.playing && p.band.parts.length > 0
                ? `Playing now: ${p.band.parts.map((x) => BAND_PART_NAMES[x]).join(', ')}.`
                : 'Waiting for your first counter.'}
            </span>
          )}
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
        {p.advanced}
      </Disclosure>
    </div>
  );
}
