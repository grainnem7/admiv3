// The band's jobs (harmony spec stage 2): "As before", or the parts it keeps whatever the
// player plays. Used on the Sound tab and in each scene of Make a piece.

import { SegmentedControl } from '../ui/SegmentedControl';
import { Switch } from '../ui/Switch';
import {
  AS_BEFORE_JOBS, BAND_JOBS, BAND_JOB_WORDS, DEFAULT_JOBS, type BandJobs,
} from '../../../../songs/band/bandJobs';

const SMALL = { fontSize: 14, color: 'var(--bs-fg2)' } as const;

export function BandJobsChoice({ value, onChange }: { value: BandJobs; onChange(next: BandJobs): void }): JSX.Element {
  return (
    <div role="group" aria-label="Band parts" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={SMALL}>Band parts</span>
      <SegmentedControl<'asBefore' | 'chosen'>
        label="Band parts" value={value.asBefore ? 'asBefore' : 'chosen'}
        onChange={(v) => {
          if (v === (value.asBefore ? 'asBefore' : 'chosen')) return;
          // Choosing parts starts from what the band always played: pads, bass and drums.
          onChange(v === 'asBefore' ? { ...AS_BEFORE_JOBS } : { ...DEFAULT_JOBS });
        }}
        options={[
          { value: 'asBefore', label: 'As before', hint: 'The band builds up with your counters and hands you each part you take.' },
          { value: 'chosen', label: 'Choose parts', hint: 'The band keeps the parts you choose, whatever you play.' },
        ]}
      />
      {value.asBefore ? (
        <span style={SMALL}>As it was: chords under your first counters, the bass from three, the drums from five, and each part handed to you when you take it.</span>
      ) : (
        <>
          {BAND_JOBS.map((job) => (
            <Switch
              key={job} label={BAND_JOB_WORDS[job].label} checked={value[job]} hint={BAND_JOB_WORDS[job].what}
              onChange={(on) => onChange({ ...value, [job]: on })}
            />
          ))}
          <span style={SMALL}>The band keeps these parts whatever you play, fitting around you and your loops.</span>
        </>
      )}
    </div>
  );
}
