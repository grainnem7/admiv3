// The chords a scene (or the player) plays to: a named sequence and how long each chord
// lasts. Used on the Sound tab and in each scene of Make a piece.

import { SegmentedControl } from '../ui/SegmentedControl';
import {
  CHORD_BARS, CHORD_SEQUENCE_IDS, CHORD_SEQUENCE_WORDS, type ChordBars, type ChordSequenceId, type ChordSetting,
} from '../../../../songs/harmony/currentChord';

const SMALL = { fontSize: 14, color: 'var(--bs-fg2)' } as const;

/** "Rising chords, 2 bars each", "chords as before": for a scene's one-line summary. */
export function chordWords(c: ChordSetting): string {
  if (c.sequence === 'asBefore') return 'chords as before';
  const name = CHORD_SEQUENCE_WORDS[c.sequence].label;
  if (c.sequence === 'still') return 'Still chords (a drone)';
  return `${name} chords, ${c.bars} ${c.bars === 1 ? 'bar' : 'bars'} each`;
}

export function ChordChoice({ value, onChange }: { value: ChordSetting; onChange(next: ChordSetting): void }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={SMALL}>Chords</span>
      <SegmentedControl<ChordSequenceId>
        label="Chords" value={value.sequence} onChange={(sequence) => onChange({ ...value, sequence })}
        options={CHORD_SEQUENCE_IDS.map((id) => ({ value: id, label: CHORD_SEQUENCE_WORDS[id].label, hint: CHORD_SEQUENCE_WORDS[id].what }))}
      />
      <span style={SMALL}>{CHORD_SEQUENCE_WORDS[value.sequence].what}</span>
      {/* "As before" is four chords to a loop and Still never moves: no length to choose. */}
      {value.sequence !== 'asBefore' && value.sequence !== 'still' && (
        <>
          <span style={SMALL}>Each chord lasts</span>
          <SegmentedControl<ChordBars>
            label="Each chord lasts" value={value.bars} onChange={(bars) => onChange({ ...value, bars })}
            options={CHORD_BARS.map((b) => ({ value: b, label: `${b} ${b === 1 ? 'bar' : 'bars'}` }))}
          />
        </>
      )}
    </div>
  );
}
