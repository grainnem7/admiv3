// The colour table: every colour on one screen, a row each — what it plays, what it sounds
// like, a button to hear it at once, and a step back to the sound before. Used in Set up
// (Colours) and on the Play screen's Sound tab, so a sound can be tried with the player in
// either place. The rest of a colour's sound lives in its row's More.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Switch';
import { SwatchChip } from '../ui/SwatchChip';
import { StepRow } from './StepRow';
import type { BoardPalette } from '../theme/boardTokens';
import { worldOf } from '../../../../audio/worlds/soundWorlds';
import { BRIGHT, LOUD, SPACE_SEND } from '../../../../audio/soundSteps';
import {
  DEFAULT_NOTE_VARY, describeChannel, FADER_ROLES, ROLE_LABELS, TOGGLE_ROLES,
  type ColourChannel, type ColourId, type ColourRole,
} from '../../../../tracking/boardColours';
import type { BoardSequencerStored } from '../../../../profiles/BoardSequencerConfig';
import { DRUM_OPTIONS, soundNameFor } from '../soundOptions';
import { soundOptionGroups, soundOptionName, soundsFor } from '../soundCatalogue';
import { channelFor, colourChannelMap, configToSoundFrom } from '../../../../midi/boardMidi';
import { chainLabel, chainOnChannel } from '../../../../midi/abletonSounds';
import { playsTune } from '../../../../songs/beyondLoop';
import type { ChannelSoundPatch } from './SoundTab';

export interface ColourTableProps {
  config: BoardSequencerStored;
  palette: BoardPalette;
  /** Why the Plays column can't change now (e.g. while playing), or null. */
  roleLockedReason: string | null;
  onRole(id: ColourId, role: ColourRole): void;
  onLoopSlot(id: ColourId, slot: number): void;
  setChannelSound(id: string, patch: ChannelSoundPatch): void;
  onHear(c: ColourChannel): void;
  /** The colour whose preview is loading, or null. */
  hearing: string | null;
  /** What Hear is doing for one colour right now ("Playing…", "Couldn't load…"), shown on its row. */
  hearNote?: { id: string; text: string } | null;
  /** Set-up's extras for a row (count on board, recalibrate, remove). */
  rowExtras?(c: ColourChannel): ReactNode;
  /** Shown inside a row's More, after the sound details (set-up: black darkness). */
  rowMore?(c: ColourChannel): ReactNode;
  /** The live reading of a control counter ("Reverb 40%"), or null. */
  liveValue?(c: ColourChannel): string | null;
  /** Colours that share an Ableton channel with an earlier colour (one per part). */
  abletonShares?: ReadonlyMap<string, { channel: number; withId: string }>;
}

const NOTE: CSSProperties = { fontSize: 12, color: 'var(--bs-fg2)' };
const CELL: CSSProperties = { padding: '6px 3px', borderTop: '1px solid var(--bs-border)', verticalAlign: 'middle' };
// The Play screen's side panel is narrow: the selects take their column's width, and
// show as much of a long name as fits.
const SELECT: CSSProperties = { minHeight: 'var(--bs-target)', width: '100%', minWidth: 0, textOverflow: 'ellipsis' };
const ICON: CSSProperties = { minWidth: 'var(--bs-target)', padding: '0 8px' };
/** Plays and Sounds like, side by side, the same width on every row. */
const TWO: CSSProperties = { display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 6 };

const SOUND_JOBS: ColourRole[] = ['melody', 'bass', 'chord', 'drums', 'off'];
const CONTROL_JOBS: ColourRole[] = [...FADER_ROLES, ...TOGGLE_ROLES];
/** Sound colours first, in the order a band is read; then the rest. */
const ORDER: ColourRole[] = ['melody', 'chord', 'bass', 'drums'];
const rank = (r: ColourRole): number => (ORDER.includes(r) ? ORDER.indexOf(r) : r === 'off' ? ORDER.length : ORDER.length + 1);

const jobName = (r: ColourRole): string => (r === 'off' ? 'Not used' : ROLE_LABELS[r]);
const isMelodic = (c: ColourChannel): boolean => c.role === 'melody' || c.role === 'chord' || c.role === 'bass';

/** The value a colour's sound select stands on: its own pick, or '' for the world's. */
const soundValue = (c: ColourChannel): string => (c.role === 'drums' ? c.drum ?? '' : c.instrument ?? '');
/** Which field that value is: a drum colour's piece, or another colour's instrument. */
const soundField = (c: ColourChannel): 'drum' | 'instrument' => (c.role === 'drums' ? 'drum' : 'instrument');

export function ColourTable(p: ColourTableProps): JSX.Element {
  // ↶: the sound each row had before its last change (this session only). Learnt from the
  // colours as they change, so a change made outside the table (Reset every colour) counts
  // too; a job change clears it, so a drum piece never comes back as an instrument.
  const [before, setBefore] = useState<Record<string, string>>({});
  const seen = useRef(new Map<string, { field: 'drum' | 'instrument'; value: string }>());
  useEffect(() => {
    const changes: Record<string, string | null> = {};
    for (const c of p.config.channels) {
      const now = { field: soundField(c), value: soundValue(c) };
      const was = seen.current.get(c.id);
      if (was && was.field !== now.field) changes[c.id] = null;
      else if (was && was.value !== now.value) changes[c.id] = was.value;
      seen.current.set(c.id, now);
    }
    if (Object.keys(changes).length === 0) return;
    setBefore((b) => {
      const next = { ...b };
      for (const [id, v] of Object.entries(changes)) {
        if (v === null) delete next[id];
        else next[id] = v;
      }
      return next;
    });
  }, [p.config.channels]);
  const colours = [...p.config.channels].sort((a, b) => rank(a.role) - rank(b.role));

  const pickSound = (c: ColourChannel, value: string): void => {
    const v = value === '' ? undefined : value;
    p.setChannelSound(c.id, c.role === 'drums' ? { drum: v } : { instrument: v });
  };
  const goBack = (c: ColourChannel): void => {
    const prev = before[c.id];
    if (prev === undefined) return;
    pickSound(c, prev);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {p.roleLockedReason && <span role="note" style={NOTE}>{p.roleLockedReason}</span>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, tableLayout: 'fixed' }}>
        <thead>
          <tr style={{ ...NOTE, textAlign: 'left' }}>
            <th scope="col" style={{ padding: 3 }}>
              <div style={TWO}><span>Plays</span><span>Sounds like</span></div>
            </th>
          </tr>
        </thead>
        <tbody>
          {colours.map((c) => (
            <ColourRow
              key={c.id}
              c={c}
              n={p.config.channels.indexOf(c) + 1}
              p={p}
              onSound={(v) => pickSound(c, v)}
              canGoBack={before[c.id] !== undefined}
              onBack={() => goBack(c)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ColourRow({ c, n, p, onSound, canGoBack, onBack }: {
  c: ColourChannel; n: number; p: ColourTableProps; onSound(v: string): void; canGoBack: boolean; onBack(): void;
}): JSX.Element {
  const name = describeChannel(c);
  const world = worldOf(p.config.soundWorld);
  const plays = c.role === 'loop' ? `loop:${c.loopSlot ?? 0}` : c.role;
  const melodic = isMelodic(c);
  const hasSound = melodic || c.role === 'drums';
  const loading = p.hearing === c.id;
  const followName = soundNameFor({ ...c, instrument: undefined, drum: undefined }, p.config.soundWorld);
  const [open, setOpen] = useState(false);
  const options = c.role === 'drums' ? DRUM_OPTIONS : soundsFor(c.role);
  // A saved pick this job's list doesn't offer (an older choice, or one kept through a job
  // change) is shown as itself: a select with no matching option shows its first one.
  const own = soundValue(c) !== '' && !options.some((o) => o.key === soundValue(c)) ? soundValue(c) : null;
  const note = p.hearNote && p.hearNote.id === c.id ? p.hearNote.text : null;

  const onPlays = (v: string): void => {
    if (v.startsWith('loop:')) {
      p.onRole(c.id, 'loop');
      p.onLoopSlot(c.id, Number(v.slice(5)));
    } else {
      p.onRole(c.id, v as ColourRole);
    }
  };

  return (
    <>
      <tr aria-label={`${name}: ${jobName(c.role)}`}>
        <td style={CELL}>
          {/* Two lines, to fit a narrow panel: the colour and its buttons, then its two choices. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <SwatchChip swatch={c.swatch} palette={p.palette} number={n} size={22} />
            <span style={{ fontWeight: 600, flex: 1 }}>{name}</span>
            {p.rowExtras?.(c)}
            {hasSound && (
              <>
                <Button tone="secondary" aria-label={`Hear ${name}`} aria-busy={loading} title={loading ? 'Loading the sound…' : 'Hear it'} onClick={() => p.onHear(c)} style={ICON}>
                  {loading ? '…' : '▶ Hear'}
                </Button>
                <Button tone="quiet" aria-label={`Back to ${name}'s sound before`} title="The sound before" disabled={!canGoBack} onClick={onBack} style={ICON}>↶</Button>
              </>
            )}
            <Button tone="quiet" aria-label={`More for ${name}`} aria-expanded={open} title="More" onClick={() => setOpen((o) => !o)} style={ICON}>⋯</Button>
          </div>
          <div style={{ ...TWO, marginTop: 4 }}>
            <select
              aria-label={`${name}: plays`}
              value={plays}
              disabled={p.roleLockedReason !== null}
              title={p.roleLockedReason ?? undefined}
              onChange={(e) => onPlays(e.target.value)}
              style={SELECT}
            >
              {SOUND_JOBS.map((r) => <option key={r} value={r}>{jobName(r)}</option>)}
              <optgroup label="Control">
                {CONTROL_JOBS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </optgroup>
              <optgroup label="Loop">
                {p.config.loopNames.map((ln, slot) => (
                  <option key={slot} value={`loop:${slot}`}>{ln && ln.length > 0 ? `Loop ${slot + 1}: ${ln}` : `Loop ${slot + 1}`}</option>
                ))}
              </optgroup>
            </select>
            {hasSound ? (
              <select aria-label={`${name}: sound`} value={soundValue(c)} onChange={(e) => onSound(e.target.value)} style={SELECT}>
                <option value="">
                  {c.role === 'drums'
                    ? `${followName} (by row)`
                    : world ? `${world.name}: ${followName}` : `Default: ${followName}`}
                </option>
                {own && <option value={own}>{`${soundOptionName(own)} (own pick)`}</option>}
                {soundOptionGroups(options).map(({ group, items }) => {
                  const list = items.map((o) => <option key={o.key} value={o.key}>{o.name}</option>);
                  return group ? <optgroup key={group} label={group}>{list}</optgroup> : list;
                })}
              </select>
            ) : <span aria-label="No sound of its own" style={{ alignSelf: 'center' }}>—</span>}
          </div>
          {note && <div role="status" style={{ ...NOTE, marginTop: 4, color: 'var(--bs-accent)', fontWeight: 600 }}>{note}</div>}
        </td>
      </tr>
      {open && (
        <tr>
          <td style={{ padding: '0 4px 8px' }}>
            <ColourMore c={c} p={p} />
          </td>
        </tr>
      )}
    </>
  );
}

/** Everything else about one colour's sound, folded away under its row. */
function ColourMore({ c, p }: { c: ColourChannel; p: ColourTableProps }): JSX.Element {
  const { config } = p;
  const world = worldOf(config.soundWorld);
  const melodic = isMelodic(c);
  const set = (patch: ChannelSoundPatch): void => p.setChannelSound(c.id, patch);
  const plays = playsTune(c, true) ? 'tune' : 'note';
  const soundFrom = configToSoundFrom(config);
  const midiCh = soundFrom === 'admi' ? null : channelFor({ role: c.role, origin: 'placed', colour: c.id }, {
    channelMode: config.midiChannelMode,
    colourChannels: config.midiChannelMode === 'colour' ? colourChannelMap(config.channels) : undefined,
  });
  const chain = midiCh === null ? null : chainOnChannel(c, midiCh, config.soundWorld, { channelMode: config.midiChannelMode, loopChannels: config.midiLoopChannels });
  const share = soundFrom === 'admi' ? undefined : p.abletonShares?.get(c.id);
  const shareName = share ? describeChannel(config.channels.find((x) => x.id === share.withId) ?? c) : null;
  const live = p.liveValue?.(c) ?? null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 6 }}>
      {midiCh !== null && <span style={NOTE}>{`MIDI ch ${midiCh}${chain !== null && !share ? ` · Ableton sound: ${chainLabel(chain)}` : ''}`}</span>}
      {share && shareName && (
        <span role="note" style={{ ...NOTE, color: 'var(--bs-warn)' }}>
          {`Shares channel ${share.channel} with ${shareName}: Ableton plays one sound for both. Choose One per colour on the Connections tab to give each its own.`}
        </span>
      )}
      {live && <span style={NOTE}>{live}</span>}
      {config.phrases && (melodic || c.role === 'drums') && (
        <StepRow
          label="Each counter plays"
          steps={[{ label: 'One note', value: 0 }, { label: c.role === 'drums' ? 'A groove' : c.role === 'bass' ? 'A bassline' : c.role === 'chord' ? 'The chords' : 'A phrase', value: 1 }]}
          value={plays === 'tune' ? 1 : 0}
          onPick={(v) => set({ plays: v === 1 ? 'tune' : 'note' })}
          hint={plays === 'note' ? 'One note where each counter sits.' : 'One counter plays a whole phrase until the next counter of its colour.'}
        />
      )}
      {melodic && (
        <>
          <StepRow label="Loud" steps={LOUD} value={c.volume ?? 1} onPick={(v) => set({ volume: v })} />
          <StepRow label="Bright" steps={BRIGHT} value={c.tone ?? 1} onPick={(v) => set({ tone: v })} />
          <StepRow label="Space" steps={SPACE_SEND} value={c.reverbSend ?? world?.reverbSend ?? 0.18} onPick={(v) => set({ reverbSend: v })} />
        </>
      )}
      {(c.role === 'melody' || c.role === 'bass') && (!config.phrases || plays === 'note') && (
        <StepRow
          label="Notes wander"
          steps={[{ label: 'Never', value: 0 }, { label: 'A little', value: 0.35 }, { label: 'More', value: 0.7 }]}
          value={c.noteVary ?? DEFAULT_NOTE_VARY}
          onPick={(v) => set({ noteVary: v })}
          hint={(c.noteVary ?? DEFAULT_NOTE_VARY) <= 0 ? 'Exactly the note each counter sits on, every pass.' : 'Each counter sometimes moves to a neighbouring note, and is back on its own every 4th pass.'}
        />
      )}
      {(melodic || c.role === 'drums') && (
        <Switch
          label="Changes over time"
          checked={c.changes !== false}
          onChange={(on) => set({ changes: on ? undefined : false })}
          hint={config.evolveAmount <= 0 ? 'Only while "Sounds change" is on.' : undefined}
        />
      )}
      {p.rowMore?.(c)}
    </div>
  );
}
